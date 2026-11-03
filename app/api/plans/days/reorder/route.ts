import { reorderPlanDays } from "@/lib/services/plan.service";
import { reorderPlanDaysSchema } from "@/lib/validation/plan";
import { jsonSuccess, parseJson, requireApiTeacher, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const POST = route(async (request) => {
  const session = await requireApiTeacher();
  const data = reorderPlanDaysSchema.parse(await parseJson(request));
  reorderPlanDays(session.user.id, data.items);
  return jsonSuccess({ success: true });
});
