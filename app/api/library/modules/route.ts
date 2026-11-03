import { createModule } from "@/lib/services/library.service";
import { createModuleSchema } from "@/lib/validation/library";
import { jsonCreated, parseJson, requireApiTeacher, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const POST = route(async (request) => {
  const session = await requireApiTeacher();
  const data = createModuleSchema.parse(await parseJson(request));
  return jsonCreated(createModule(session.user.id, data));
});
