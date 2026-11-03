import { NextResponse } from "next/server";
import { ApiError, route } from "@/lib/middleware/errors";
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  type RateLimitResult,
} from "@/lib/middleware/rate-limit";
import { enforceHttpsInProduction } from "@/lib/utils/https";
import { sanitizeRedirectPath } from "@/lib/utils/url";
import { getCurrentSession } from "@/lib/auth/session";
import {
  completeSupabaseGoogleAuthorization,
  consumeGoogleOAuthIntent,
} from "@/lib/services/google-supabase-auth.service";
import { logOAuthAuditSupabase } from "@/lib/services/oauth-audit-supabase.service";
import { GoogleOAuthError } from "@/lib/google-oauth-errors";

export const runtime = "nodejs";

function requestContext(request: Request) {
  return {
    ip: getClientIp(request),
    userAgent: request.headers.get("user-agent"),
  };
}

function errorCodeFrom(error: unknown): string {
  if (error instanceof GoogleOAuthError) return error.code;
  if (error instanceof ApiError) {
    const details = error.details as { error?: string } | undefined;
    if (details?.error) return details.error;
    if (error.status === 409) return "email_mismatch_on_connect";
    if (error.status === 401) return "unauthorized";
    if (error.status === 404) return "not_found";
    if (error.status === 403) return "forbidden";
    return "server_error";
  }
  return "server_error";
}

function errorRedirect(
  request: Request,
  code: string,
  limit: RateLimitResult,
  redirectPath: string | undefined,
  connectMode: boolean,
): NextResponse {
  const safePath = sanitizeRedirectPath(redirectPath);
  const isAppArea =
    safePath?.startsWith("/settings") || safePath?.startsWith("/portal");
  // Nesses casos a sessão anterior não existe mais (troca/expiração): mostra o
  // erro na tela de login, sem cair no redirecionamento do middleware.
  const forceLogin =
    code === "email_mismatch_on_connect" || code === "unauthorized";
  const target = new URL(
    !forceLogin && connectMode && isAppArea && safePath ? safePath : "/login",
    request.url,
  );
  target.searchParams.set("error", code);
  return applyRateLimitHeaders(NextResponse.redirect(target, 303), limit);
}

export const GET = route(async (request) => {
  const limit = await checkRateLimit(`google-callback:${getClientIp(request)}`);
  if (!limit.allowed) return rateLimitResponse(limit);

  enforceHttpsInProduction(request);

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const googleError = url.searchParams.get("error");
  const intent = await consumeGoogleOAuthIntent();
  const connectMode = intent?.connect === true;
  const redirectPath = sanitizeRedirectPath(intent?.next);
  const context = requestContext(request);

  if (googleError) {
    const reason =
      googleError === "access_denied" ? "access_denied" : "server_error";
    await logOAuthAuditSupabase({
      event: "google_code_exchange_failed",
      success: false,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: {
        reason,
        google_error: googleError,
        connect_mode: connectMode,
      },
    });
    return errorRedirect(request, reason, limit, redirectPath, connectMode);
  }

  if (!code) {
    await logOAuthAuditSupabase({
      event: "google_code_exchange_failed",
      success: false,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { reason: "missing_code", connect_mode: connectMode },
    });
    return errorRedirect(
      request,
      "invalid_request",
      limit,
      redirectPath,
      connectMode,
    );
  }

  try {
    const result = await completeSupabaseGoogleAuthorization({
      code,
      connectMode,
      connectEmail: intent?.email ?? null,
      connectUserId: intent?.userId ?? null,
      context,
    });

    const destination =
      sanitizeRedirectPath(redirectPath) ??
      (result.activeRole === "teacher" ? "/dashboard" : "/portal");
    const target = new URL(destination, request.url);
    if (connectMode) {
      target.searchParams.set("google", "connected");
    }

    return applyRateLimitHeaders(NextResponse.redirect(target, 303), limit);
  } catch (error) {
    const reason = errorCodeFrom(error);
    const session = await getCurrentSession().catch(() => null);

    await logOAuthAuditSupabase({
      event: "google_code_exchange_failed",
      userId: session?.user.id ?? null,
      success: false,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: {
        reason,
        connect_mode: connectMode,
      },
    });

    return errorRedirect(request, reason, limit, redirectPath, connectMode);
  }
});
