import {
  ApiError,
  jsonSuccess,
  parseJson,
  requireApiUser,
  route,
} from "@/lib/middleware/errors";
import { completeUploadSession } from "@/lib/services/video-storage.service";
import { toApiError } from "@/lib/google-drive-errors";

export const runtime = "nodejs";

export const POST = route<{ sessionId: string }>(async (request, context) => {
  const session = await requireApiUser();
  const { sessionId } = await context.params;
  const body = (await parseJson(request)) as Record<string, unknown>;

  const fileId = String(body.file_id ?? body.fileId ?? "").trim();
  if (!fileId) {
    throw ApiError.validation("file_id do Google Drive é obrigatório");
  }

  try {
    const { video } = await completeUploadSession(session.user.id, sessionId, {
      fileId,
      size: body.size ? Number(body.size) : undefined,
      mimeType: body.mime_type ? String(body.mime_type) : undefined,
    });

    return jsonSuccess({
      video_id: video.id,
      file_id: video.provider_video_id,
      name: video.title,
      size: video.size_bytes ?? null,
      url: video.drive_file_url ?? null,
      provider: video.provider,
      status: video.status,
    });
  } catch (error) {
    throw toApiError(error);
  }
});
