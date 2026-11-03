import { updateModule } from "@/lib/services/library.service";
import { updateModuleSchema } from "@/lib/validation/library";
import { jsonSuccess, parseJson, requireApiTeacher, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const PATCH = route<{ id: string }>(async (request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  const data = updateModuleSchema.parse(await parseJson(request));
  return jsonSuccess(updateModule(id, session.user.id, data));
});
