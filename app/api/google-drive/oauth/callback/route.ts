import { NextResponse } from "next/server";
import { ApiError, route } from "@/lib/middleware/errors";
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/lib/middleware/rate-limit";
import { enforceHttpsInProduction } from "@/lib/utils/https";
import { sanitizeRedirectPath } from "@/lib/utils/url";
import { getCurrentSession } from "@/lib/auth/session";
import { consumeOAuthState } from "@/lib/services/oauth-state.service";
import {
  exchangeDriveCode,
  storeDriveTokens,
} from "@/lib/services/google-drive-token.service";
import { ensureLibraryStructure } from "@/lib/services/google-drive.service";
import { getGoogleUserProfile } from "@/lib/google-oauth-client";
import { getDriveAbout } from "@/lib/services/google-drive-client";
import { logGoogleDriveError } from "@/lib/google-drive-errors";

export const runtime = "nodejs";

function redirectWithError(
  request: Request,
  redirectPath: string | undefined,
  code: string,
  limit: ReturnType<typeof checkRateLimit>,
) {
  const target = new URL(
    sanitizeRedirectPath(redirectPath) ?? "/settings",
    request.url,
  );
  target.searchParams.set("drive_error", code);
  return applyRateLimitHeaders(NextResponse.redirect(target, 303), limit);
}

export const GET = route(async (request) => {
  const limit = checkRateLimit(`drive-oauth-callback:${getClientIp(request)}`);
  if (!limit.allowed) return rateLimitResponse(limit);
  enforceHttpsInProduction(request);

  const url = new URL(request.url);
  const stateResult = await consumeOAuthState(url.searchParams.get("state"));
  const googleError = url.searchParams.get("error");

  if (googleError) {
    return redirectWithError(
      request,
      stateResult.state?.redirectPath,
      googleError === "access_denied" ? "access_denied" : "server_error",
      limit,
    );
  }

  if (
    !stateResult.valid ||
    !stateResult.state ||
    stateResult.state.purpose !== "drive"
  ) {
    return redirectWithError(
      request,
      undefined,
      stateResult.reason ?? "state_mismatch",
      limit,
    );
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return redirectWithError(
      request,
      stateResult.state.redirectPath,
      "invalid_request",
      limit,
    );
  }

  try {
    const session = await getCurrentSession();
    if (!session) {
      return redirectWithError(
        request,
        stateResult.state.redirectPath,
        "unauthorized",
        limit,
      );
    }

    const credential = await exchangeDriveCode(
      code,
      stateResult.state.codeVerifier,
    );
    const profile = await getGoogleUserProfile(credential.access_token);
    const about = await getDriveAbout(credential.access_token);

    await storeDriveTokens(session.user.id, {
      accessToken: credential.access_token,
      refreshToken: credential.refresh_token,
      expiresIn: credential.expires_in,
      scope: credential.scope,
      driveId: about.driveId || profile.email,
      googleEmail: about.email || profile.email,
    });
    await ensureLibraryStructure(session.user.id);

    const target = new URL(
      sanitizeRedirectPath(stateResult.state.redirectPath) ?? "/settings",
      request.url,
    );
    target.searchParams.set("drive", "connected");
    return applyRateLimitHeaders(NextResponse.redirect(target, 303), limit);
  } catch (error) {
    logGoogleDriveError(error, "oauth.callback");
    const code =
      error instanceof ApiError
        ? String(
            (error.details as { drive_error?: string })?.drive_error ??
              "server_error",
          )
        : "server_error";
    return redirectWithError(
      request,
      stateResult.state.redirectPath,
      code,
      limit,
    );
  }
});
