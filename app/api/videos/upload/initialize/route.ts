import { ApiError, jsonCreated, parseJson, requireApiUser, route } from "@/lib/middleware/errors";
import { initializeUploadSession } from "@/lib/services/video-storage.service";

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
  const totalBytes = Number(body.total_bytes ?? body.size ?? 0);
  const sessionRecord = initializeUploadSession(session.user.id, {
    title,
    description: body.description ? String(body.description) : null,
    destination,
    fileName: String(body.file_name ?? "video.mp4"),
    mimeType: String(body.mime_type ?? "video/mp4"),
    totalBytes,
    techniqueId: body.technique_id ? String(body.technique_id) : null,
    moduleId: body.module_id ? String(body.module_id) : null,
  });

  return jsonCreated({
    session_id: sessionRecord.id,
    chunk_size: sessionRecord.chunk_size,
    total_chunks: sessionRecord.total_chunks,
    upload_urls: Array.from(
      { length: sessionRecord.total_chunks },
      (_, index) =>
        `/api/videos/upload/${sessionRecord.id}/chunk?chunk_index=${index}`,
    ),
    expires_at: sessionRecord.expires_at,
  });
});
