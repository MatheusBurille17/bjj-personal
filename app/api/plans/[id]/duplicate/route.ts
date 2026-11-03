import { duplicatePlan } from "@/lib/services/plan.service";
import { jsonCreated, requireApiTeacher, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const POST = route<{ id: string }>(async (_request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  return jsonCreated(await duplicatePlan(id, session.user.id));
});
