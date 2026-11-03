import { jsonSuccess, requireApiUser, route } from "@/lib/middleware/errors";
import { completeUploadSession, getVideoPlayback } from "@/lib/services/video-storage.service";
import { toApiError } from "@/lib/google-drive-errors";

export const runtime = "nodejs";

export const POST = route<{ sessionId: string }>(async (_request, context) => {
  const session = await requireApiUser();
  const { sessionId } = await context.params;

  try {
    const { video } = await completeUploadSession(session.user.id, sessionId);
    let playback = null;
    try {
      playback = await getVideoPlayback(
        video.id,
        session.user.id,
        session.activeRole,
      );
    } catch {
      playback = null;
    }
    return jsonSuccess({
      video_id: video.id,
      file_id: video.provider_video_id,
      name: video.title,
      size: video.size_bytes,
      playback_url: playback?.playback_url ?? null,
      expires_at: playback?.expires_at ?? null,
      provider: video.provider,
    });
  } catch (error) {
    throw toApiError(error);
  }
});
