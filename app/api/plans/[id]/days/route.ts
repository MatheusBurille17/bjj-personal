import { createPlanDay, getPlanDays } from "@/lib/services/plan.service";
import { createPlanDaySchema } from "@/lib/validation/plan";
import {
  jsonCreated,
  jsonSuccess,
  parseJson,
  requireApiTeacher,
  route,
} from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const GET = route<{ id: string }>(async (_request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  return jsonSuccess(await getPlanDays(id, session.user.id));
});

export const POST = route<{ id: string }>(async (request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  const data = createPlanDaySchema.parse(await parseJson(request));
  return jsonCreated(await createPlanDay(id, session.user.id, data));
});
