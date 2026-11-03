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
import { beginSupabaseGoogleAuthorization } from "@/lib/services/google-supabase-auth.service";
import { toApiError } from "@/lib/google-oauth-errors";

export const runtime = "nodejs";

async function prepare(request: Request) {
  const limit = await checkRateLimit(`drive-oauth-authorize:${getClientIp(request)}`);
  if (!limit.allowed) return { rateLimited: true as const, limit };

  enforceHttpsInProduction(request);
  const session = await requireApiUser();
  const url = new URL(request.url);
  const fallback =
    session.activeRole === "teacher" ? "/settings" : "/portal/profile";
  const redirectPath =
    sanitizeRedirectPath(url.searchParams.get("redirect_path")) ?? fallback;

  try {
    // Reutiliza o provider Google do Supabase Auth. O callback dedicado do
    // Drive mantém o retorno em `?drive=connected`.
    const authorizationUrl = await beginSupabaseGoogleAuthorization({
      request,
      redirectPath,
      connectMode: true,
      callbackPath: "/api/google-drive/oauth/callback",
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
