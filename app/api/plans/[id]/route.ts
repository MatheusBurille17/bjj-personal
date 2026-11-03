import {
  deletePlan,
  getPlanDetail,
  updatePlan,
} from "@/lib/services/plan.service";
import { updatePlanSchema } from "@/lib/validation/plan";
import {
  jsonDeleted,
  jsonSuccess,
  parseJson,
  requireApiTeacher,
  route,
} from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const GET = route<{ id: string }>(async (_request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  return jsonSuccess(await getPlanDetail(id, session.user.id));
});

export const PATCH = route<{ id: string }>(async (request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  const data = updatePlanSchema.parse(await parseJson(request));
  return jsonSuccess(await updatePlan(id, session.user.id, data));
});

export const DELETE = route<{ id: string }>(async (_request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  deletePlan(id, session.user.id);
  return jsonDeleted("Plano removido");
});
