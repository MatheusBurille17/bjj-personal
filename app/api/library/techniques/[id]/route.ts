import { updateTechnique } from "@/lib/services/library.service";
import { updateTechniqueSchema } from "@/lib/validation/library";
import { jsonSuccess, parseJson, requireApiTeacher, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const PATCH = route<{ id: string }>(async (request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  const data = updateTechniqueSchema.parse(await parseJson(request));
  return jsonSuccess(updateTechnique(id, session.user.id, data));
});
