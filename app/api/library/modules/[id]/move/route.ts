import { moveModule } from "@/lib/services/library.service";
import { moveModuleSchema } from "@/lib/validation/library";
import { jsonSuccess, parseJson, requireApiTeacher, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const POST = route<{ id: string }>(async (request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  const data = moveModuleSchema.parse(await parseJson(request));
  return jsonSuccess(moveModule(id, session.user.id, data.technique_id));
});
