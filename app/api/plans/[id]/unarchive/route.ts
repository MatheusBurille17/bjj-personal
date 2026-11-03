import { unarchivePlan } from "@/lib/services/plan.service";
import { jsonSuccess, requireApiTeacher, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const POST = route<{ id: string }>(async (_request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  return jsonSuccess(await unarchivePlan(id, session.user.id));
});
