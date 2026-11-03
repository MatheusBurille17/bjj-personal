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

function redirectWithError(
  request: Request,
  redirectPath: string | undefined,
  code: string,
  limit: RateLimitResult,
) {
  const forceLogin =
    code === "email_mismatch_on_connect" || code === "unauthorized";
  const target = new URL(
    forceLogin ? "/login" : sanitizeRedirectPath(redirectPath) ?? "/settings",
    request.url,
  );
  target.searchParams.set(forceLogin ? "error" : "drive_error", code);
  return applyRateLimitHeaders(NextResponse.redirect(target, 303), limit);
}

function errorCodeFrom(error: unknown): string {
  if (error instanceof GoogleOAuthError) return error.code;
  if (error instanceof ApiError) {
    const details = error.details as { error?: string; drive_error?: string } | undefined;
    if (details?.drive_error) return details.drive_error;
    if (details?.error) return details.error;
    if (error.status === 401) return "unauthorized";
    if (error.status === 403) return "forbidden";
    if (error.status === 404) return "not_found";
    return "server_error";
  }
  return "server_error";
}

export const GET = route(async (request) => {
  const limit = await checkRateLimit(`drive-oauth-callback:${getClientIp(request)}`);
  if (!limit.allowed) return rateLimitResponse(limit);
  enforceHttpsInProduction(request);

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const googleError = url.searchParams.get("error");
  const intent = await consumeGoogleOAuthIntent();
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
      metadata: { reason, google_error: googleError, flow: "drive" },
    });
    return redirectWithError(request, redirectPath, reason, limit);
  }

  if (!code) {
    await logOAuthAuditSupabase({
      event: "google_code_exchange_failed",
      success: false,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { reason: "missing_code", flow: "drive" },
    });
    return redirectWithError(
      request,
      redirectPath,
      "invalid_request",
      limit,
    );
  }

  try {
    const session = await getCurrentSession();
    if (!session) {
      return redirectWithError(
        request,
        redirectPath,
        "unauthorized",
        limit,
      );
    }

    await completeSupabaseGoogleAuthorization({
      code,
      connectMode: true,
      connectEmail: intent?.email ?? null,
      connectUserId: intent?.userId ?? null,
      context,
    });

    const target = new URL(
      sanitizeRedirectPath(redirectPath) ?? "/settings",
      request.url,
    );
    target.searchParams.set("drive", "connected");
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
      metadata: { reason, flow: "drive" },
    });
    return redirectWithError(request, redirectPath, reason, limit);
  }
});
