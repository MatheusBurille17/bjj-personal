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
import { consumeOAuthState } from "@/lib/services/oauth-state.service";
import { completeGoogleAuthorization } from "@/lib/services/google-auth.service";
import { logOAuthAudit } from "@/lib/services/oauth-audit.service";
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
    return "server_error";
  }
  return "server_error";
}

function errorRedirect(
  request: Request,
  code: string,
  limit: RateLimitResult,
  redirectPath?: string,
): NextResponse {
  const safePath = sanitizeRedirectPath(redirectPath);
  const isAppArea =
    safePath?.startsWith("/settings") || safePath?.startsWith("/portal");
  const target = new URL(isAppArea && safePath ? safePath : "/login", request.url);
  target.searchParams.set("error", code);
  return applyRateLimitHeaders(
    NextResponse.redirect(target, 303),
    limit,
  );
}

export const GET = route(async (request) => {
  const limit = checkRateLimit(`google-callback:${getClientIp(request)}`);
  if (!limit.allowed) return rateLimitResponse(limit);

  enforceHttpsInProduction(request);

  const url = new URL(request.url);
  const stateParam = url.searchParams.get("state");
  const stateResult = await consumeOAuthState(stateParam);
  const context = requestContext(request);

  const googleError = url.searchParams.get("error");
  if (googleError) {
    const code =
      googleError === "access_denied" ? "access_denied" : "server_error";
    logOAuthAudit({
      event: "google_code_exchange_failed",
      success: false,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { reason: code, google_error: googleError },
    });
    return errorRedirect(
      request,
      code,
      limit,
      stateResult.state?.redirectPath,
    );
  }

  if (!stateResult.valid || !stateResult.state) {
    logOAuthAudit({
      event: "google_state_validation_failed",
      success: false,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { reason: stateResult.reason ?? "state_not_found" },
    });
    return errorRedirect(
      request,
      stateResult.reason ?? "state_not_found",
      limit,
    );
  }

  const code = url.searchParams.get("code");
  if (!code) {
    logOAuthAudit({
      event: "google_code_exchange_failed",
      success: false,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { reason: "missing_code", connect_mode: stateResult.state.connectMode },
    });
    return errorRedirect(
      request,
      "invalid_request",
      limit,
      stateResult.state.redirectPath,
    );
  }

  const session = await getCurrentSession();

  if (stateResult.state.connectMode && !session) {
    return errorRedirect(
      request,
      "unauthorized",
      limit,
      stateResult.state.redirectPath,
    );
  }

  try {
    const result = await completeGoogleAuthorization({
      code,
      codeVerifier: stateResult.state.codeVerifier,
      connectMode: stateResult.state.connectMode,
      currentUserId: session?.user.id ?? null,
      context,
    });

    const destination =
      sanitizeRedirectPath(stateResult.state.redirectPath) ??
      (result.auth.active_role === "teacher" ? "/dashboard" : "/portal");
    const target = new URL(destination, request.url);
    if (stateResult.state.connectMode) {
      target.searchParams.set("google", "connected");
    }

    return applyRateLimitHeaders(NextResponse.redirect(target, 303), limit);
  } catch (error) {
    const reason = errorCodeFrom(error);
    logOAuthAudit({
      event: "google_code_exchange_failed",
      userId: session?.user.id ?? null,
      success: false,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: {
        reason,
        connect_mode: stateResult.state.connectMode,
      },
    });

    const fallbackPath = stateResult.state.connectMode
      ? stateResult.state.redirectPath ??
        (session?.activeRole === "teacher" ? "/settings" : "/portal/profile")
      : stateResult.state.redirectPath;

    return errorRedirect(request, reason, limit, fallbackPath);
  }
});
