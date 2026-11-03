import { jsonSuccess, requireApiUser, route } from "@/lib/middleware/errors";
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/lib/middleware/rate-limit";
import { enforceHttpsInProduction } from "@/lib/utils/https";
import { refreshUserGoogleToken } from "@/lib/services/google-auth.service";

export const runtime = "nodejs";

export const POST = route(async (request) => {
  const limit = checkRateLimit(`google-token-refresh:${getClientIp(request)}`);
  if (!limit.allowed) return rateLimitResponse(limit);

  enforceHttpsInProduction(request);

  const session = await requireApiUser();
  const result = await refreshUserGoogleToken(session.user.id);

  return applyRateLimitHeaders(
    jsonSuccess({
      success: true,
      token_refreshed: result.token_refreshed,
      expires_at: result.expires_at,
    }),
    limit,
  );
});
