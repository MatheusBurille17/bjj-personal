import { NextResponse } from "next/server";
import { jsonSuccess, requireApiUser, route } from "@/lib/middleware/errors";
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/lib/middleware/rate-limit";
import { enforceHttpsInProduction } from "@/lib/utils/https";
import { sanitizeRedirectPath } from "@/lib/utils/url";
import {
  createCodeChallenge,
  createOAuthState,
  storeOAuthState,
} from "@/lib/services/oauth-state.service";
import {
  buildDriveAuthorizationUrl,
} from "@/lib/services/google-drive-token.service";
import { toApiError } from "@/lib/google-oauth-errors";

export const runtime = "nodejs";

async function prepare(request: Request) {
  const limit = checkRateLimit(`drive-oauth-authorize:${getClientIp(request)}`);
  if (!limit.allowed) return { rateLimited: true as const, limit };

  enforceHttpsInProduction(request);
  const session = await requireApiUser();
  const url = new URL(request.url);
  const fallback =
    session.activeRole === "teacher" ? "/settings" : "/portal/profile";
  const redirectPath =
    sanitizeRedirectPath(url.searchParams.get("redirect_path")) ?? fallback;

  const state = createOAuthState({
    redirectPath,
    purpose: "drive",
    connectMode: true,
  });
  await storeOAuthState(state);
  const challenge = await createCodeChallenge(state.codeVerifier);
  try {
    const authorizationUrl = buildDriveAuthorizationUrl({
      state: state.state,
      codeChallenge: challenge,
    });
    return { rateLimited: false as const, authorizationUrl, limit };
  } catch (error) {
    throw toApiError(error);
  }
}

export const POST = route(async (request) => {
  const prepared = await prepare(request);
  if (prepared.rateLimited) return rateLimitResponse(prepared.limit);
  return applyRateLimitHeaders(
    jsonSuccess({ authorizationUrl: prepared.authorizationUrl }),
    prepared.limit,
  );
});

export const GET = route(async (request) => {
  const prepared = await prepare(request);
  if (prepared.rateLimited) return rateLimitResponse(prepared.limit);
  return applyRateLimitHeaders(
    NextResponse.redirect(prepared.authorizationUrl, 303),
    prepared.limit,
  );
});
