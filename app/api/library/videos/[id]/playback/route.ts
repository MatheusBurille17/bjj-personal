import { getTeacherPlaybackUrl, getVideo } from "@/lib/services/library.service";
import {
  getVideoPlayback,
  recordVideoAccess,
} from "@/lib/services/video-storage.service";
import { jsonSuccess, requireApiTeacher, route } from "@/lib/middleware/errors";
import { getClientIp } from "@/lib/middleware/rate-limit";
import { toApiError } from "@/lib/google-drive-errors";

export const runtime = "nodejs";

export const GET = route<{ id: string }>(async (request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  const video = await getVideo(id, session.user.id);

  if (video.provider === "google_drive") {
    try {
      const result = await getVideoPlayback(id, session.user.id, "teacher", {
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
      await recordVideoAccess(id, session.user.id, {
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
  }

  return jsonSuccess({
    playback_url: getTeacherPlaybackUrl(id, session.user.id),
    expires_in: 86_400,
    provider: video.provider,
  });
});
