import { NextResponse } from "next/server";
import { ApiError, jsonSuccess, route } from "@/lib/middleware/errors";
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  type RateLimitResult,
} from "@/lib/middleware/rate-limit";
import { enforceHttpsInProduction } from "@/lib/utils/https";
import { sanitizeRedirectPath } from "@/lib/utils/url";
import { beginSupabaseGoogleAuthorization } from "@/lib/services/google-supabase-auth.service";
import { toApiError } from "@/lib/google-oauth-errors";

export const runtime = "nodejs";

function parseConnectMode(value: string | null): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

type AuthorizationPreparation =
  | { rateLimited: true; limit: RateLimitResult }
  | { rateLimited: false; authorizationUrl: string; limit: RateLimitResult };

async function prepareAuthorization(
  request: Request,
): Promise<AuthorizationPreparation> {
  const limit = await checkRateLimit(`google-authorize:${getClientIp(request)}`);
  if (!limit.allowed) {
    return { rateLimited: true, limit };
  }

  enforceHttpsInProduction(request);

  const url = new URL(request.url);
  const rawRedirectPath = url.searchParams.get("redirect_path");
  const redirectPath = sanitizeRedirectPath(rawRedirectPath);
  if (rawRedirectPath && !redirectPath) {
    throw ApiError.validation("redirect_path inválido", {
      error: "invalid_redirect_path",
    });
  }

  const connectMode = parseConnectMode(url.searchParams.get("connect_mode"));

  try {
    // O provider Google do Supabase Auth cuida do state/PKCE e da troca do
    // código. O app recebe o callback e persiste os tokens do Drive.
    const authorizationUrl = await beginSupabaseGoogleAuthorization({
      request,
      redirectPath,
      connectMode,
    });
    return { rateLimited: false, authorizationUrl, limit };
  } catch (error) {
    throw toApiError(error);
  }
}

export const POST = route(async (request) => {
  const prepared = await prepareAuthorization(request);
  if (prepared.rateLimited) return rateLimitResponse(prepared.limit);
  return applyRateLimitHeaders(
    jsonSuccess({ authorization_url: prepared.authorizationUrl }),
    prepared.limit,
  );
});

/** Fallback para navegação direta (links/formulários sem JavaScript). */
export const GET = route(async (request) => {
  const prepared = await prepareAuthorization(request);
  if (prepared.rateLimited) return rateLimitResponse(prepared.limit);
  return applyRateLimitHeaders(
    NextResponse.redirect(prepared.authorizationUrl, 303),
    prepared.limit,
  );
});
