import { deletePlanDay, updatePlanDay } from "@/lib/services/plan.service";
import { updatePlanDaySchema } from "@/lib/validation/plan";
import {
  jsonDeleted,
  jsonSuccess,
  parseJson,
  requireApiTeacher,
  route,
} from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const PATCH = route<{ dayId: string }>(async (request, context) => {
  const session = await requireApiTeacher();
  const { dayId } = await context.params;
  const data = updatePlanDaySchema.parse(await parseJson(request));
  return jsonSuccess(updatePlanDay(dayId, session.user.id, data));
});

export const DELETE = route<{ dayId: string }>(async (_request, context) => {
  const session = await requireApiTeacher();
  const { dayId } = await context.params;
  deletePlanDay(dayId, session.user.id);
  return jsonDeleted("Dia removido do plano");
});
