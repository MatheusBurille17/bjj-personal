import { ApiError, jsonCreated, parseJson, requireApiUser, route } from "@/lib/middleware/errors";
import { initializeUploadSession } from "@/lib/services/video-storage.service";
import { toApiError } from "@/lib/google-drive-errors";

export const runtime = "nodejs";

export const POST = route(async (request) => {
  const session = await requireApiUser();
  const body = (await parseJson(request)) as Record<string, unknown>;

  const destination =
    String(body.destination ?? "library") === "personal"
      ? "personal"
      : "library";
  if (destination === "library" && !session.roles.is_teacher) {
    throw ApiError.forbidden("Somente instrutores podem enviar vídeos da biblioteca");
  }

  const title = String(body.title ?? "").trim();
  if (title.length < 2) {
    throw ApiError.validation("Informe um título com pelo menos 2 caracteres");
  }

  const totalBytes = Number(body.total_bytes ?? body.totalBytes ?? body.size ?? 0);
  const fileName = String(body.file_name ?? body.fileName ?? "video.mp4");
  const mimeType = String(body.mime_type ?? body.mimeType ?? "video/mp4");

  try {
    const result = await initializeUploadSession(session.user.id, {
      title,
      description: body.description ? String(body.description) : null,
      destination,
      fileName,
      mimeType,
      totalBytes,
      techniqueId: body.technique_id ? String(body.technique_id) : null,
      moduleId: body.module_id ? String(body.module_id) : null,
    });

    return jsonCreated({
      session_id: result.session.id,
      // O navegador envia o arquivo diretamente para esta URL do Google.
      upload_url: result.uploadUrl,
      chunk_size: result.session.chunk_size,
      total_chunks: result.session.total_chunks,
      file_name: fileName,
      mime_type: mimeType,
      expires_at: result.session.expires_at,
    });
  } catch (error) {
    throw toApiError(error);
  }
});
