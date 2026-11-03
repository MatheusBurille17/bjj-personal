import { jsonSuccess, requireApiStudent, route } from "@/lib/middleware/errors";
import {
  getVideoPlayback,
  recordVideoAccess,
} from "@/lib/services/video-storage.service";
import { getClientIp } from "@/lib/middleware/rate-limit";
import { toApiError } from "@/lib/google-drive-errors";

export const runtime = "nodejs";

export const GET = route<{ id: string }>(async (request, context) => {
  const session = await requireApiStudent();
  const { id } = await context.params;
  try {
    const result = await getVideoPlayback(id, session.user.id, "student", {
      ip: getClientIp(request),
      userAgent: request.headers.get("user-agent"),
    });
    return jsonSuccess({
      playback_url: result.playback_url,
      expires_at: result.expires_at,
      expires_in: result.expires_in,
      provider: result.provider,
    });
  } catch (error) {
    recordVideoAccess(id, session.user.id, {
      action: "playback",
      success: false,
      ip: getClientIp(request),
      userAgent: request.headers.get("user-agent"),
      metadata: {
        reason: error instanceof Error ? error.message : "unknown",
      },
    });
    throw toApiError(error);
  }
});
