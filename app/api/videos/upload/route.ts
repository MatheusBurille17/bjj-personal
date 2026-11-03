import { ApiError, jsonCreated, requireApiUser, route } from "@/lib/middleware/errors";
import {
  uploadLibraryVideo,
  uploadPersonalVideo,
} from "@/lib/services/video-storage.service";
import { toApiError } from "@/lib/google-drive-errors";

export const runtime = "nodejs";

export const POST = route(async (request) => {
  const session = await requireApiUser();
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw ApiError.validation("Envie o arquivo como multipart/form-data");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    throw ApiError.validation("Arquivo de vídeo obrigatório", {
      drive_error: "invalid_file",
    });
  }

  const title = String(form.get("title") ?? form.get("video_title") ?? "").trim();
  if (title.length < 2) {
    throw ApiError.validation("Informe um título com pelo menos 2 caracteres");
  }
  const description = String(form.get("description") ?? "").trim() || null;
  const destination =
    String(form.get("destination") ?? "library") === "personal"
      ? "personal"
      : "library";

  try {
    const video =
      destination === "personal"
        ? await uploadPersonalVideo(session.user.id, file, {
            title,
            description,
          })
        : await uploadLibraryVideo(session.user.id, file, {
            title,
            description,
            moduleId: String(form.get("module_id") ?? ""),
          });

    return jsonCreated({
      video_id: video.id,
      file_id: video.provider_video_id,
      name: video.title,
      size: video.size_bytes ?? file.size,
      url: video.drive_file_url,
      provider: video.provider,
      status: video.status,
    });
  } catch (error) {
    throw toApiError(error);
  }
});
