import { reorderPlanDayVideos } from "@/lib/services/plan.service";
import { reorderSchema } from "@/lib/validation/library";
import { jsonSuccess, parseJson, requireApiTeacher, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const POST = route(async (request) => {
  const session = await requireApiTeacher();
  const data = reorderSchema.parse(await parseJson(request));
  reorderPlanDayVideos(session.user.id, data.items);
  return jsonSuccess({ success: true });
});
