import { uploadAvatar } from "@/lib/services/profile.service";
import { ApiError, jsonSuccess, requireApiUser, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const POST = route(async (request) => {
  const session = await requireApiUser();
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw ApiError.validation("Envie um arquivo de imagem", {
      fields: { file: "Arquivo não enviado" },
    });
  }
  const result = await uploadAvatar(session.user.id, file);
  return jsonSuccess(result);
});
