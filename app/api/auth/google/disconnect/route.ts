import { jsonSuccess, requireApiUser, route } from "@/lib/middleware/errors";
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/lib/middleware/rate-limit";
import { enforceHttpsInProduction } from "@/lib/utils/https";
import { disconnectGoogleAccount } from "@/lib/services/google-auth.service";

export const runtime = "nodejs";

export const POST = route(async (request) => {
  const limit = checkRateLimit(`google-disconnect:${getClientIp(request)}`);
  if (!limit.allowed) return rateLimitResponse(limit);

  enforceHttpsInProduction(request);

  const session = await requireApiUser();
  const result = await disconnectGoogleAccount(session.user.id, {
    ip: getClientIp(request),
    userAgent: request.headers.get("user-agent"),
  });

  return applyRateLimitHeaders(
    jsonSuccess({
      success: true,
      message: "Conta Google desconectada",
      ...result,
    }),
    limit,
  );
});
