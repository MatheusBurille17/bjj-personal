import {
  ApiError,
  jsonDeleted,
  jsonSuccess,
  parseJson,
  requireApiUser,
  route,
} from "@/lib/middleware/errors";
import {
  deleteVideoForUser,
  getUserVideo,
  refreshVideoMetadata,
  updateVideoForUser,
} from "@/lib/services/video-storage.service";
import { toApiError } from "@/lib/google-drive-errors";

export const runtime = "nodejs";

export const GET = route<{ videoId: string }>(async (_request, context) => {
  const session = await requireApiUser();
  const { videoId } = await context.params;
  let video = await getUserVideo(videoId, session.user.id, session.activeRole);
  if (
    video.provider === "google_drive" &&
    (!video.metadata_synced_at ||
      Date.now() - new Date(video.metadata_synced_at).getTime() > 24 * 60 * 60 * 1000)
  ) {
    try {
      video = await refreshVideoMetadata(
        videoId,
        session.user.id,
        session.activeRole,
      );
    } catch (error) {
      console.warn("[google-drive] metadata sync skipped", {
        video_id: videoId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return jsonSuccess(video);
});

export const PATCH = route<{ videoId: string }>(async (request, context) => {
  const session = await requireApiUser();
  const { videoId } = await context.params;
  const body = (await parseJson(request)) as {
    title?: string;
    description?: string | null;
  };
  if (body.title !== undefined && body.title.trim().length < 2) {
    throw ApiError.validation("O título deve ter pelo menos 2 caracteres");
  }
  try {
    const video = await updateVideoForUser(
      videoId,
      session.user.id,
      session.activeRole,
      {
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.description !== undefined
          ? { description: body.description }
          : {}),
      },
    );
    return jsonSuccess(video);
  } catch (error) {
    throw toApiError(error);
  }
});

export const DELETE = route<{ videoId: string }>(async (request, context) => {
  const session = await requireApiUser();
  const { videoId } = await context.params;
  const url = new URL(request.url);
  const hard = url.searchParams.get("hard") === "true";
  const result = await deleteVideoForUser(
    videoId,
    session.user.id,
    session.activeRole,
    { hard },
  );
  return jsonDeleted(
    result.driveDeleted
      ? "Vídeo e arquivo do Drive removidos"
      : "Vídeo removido",
  );
});
