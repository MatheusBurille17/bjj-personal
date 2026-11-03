import { revokePlanAccess } from "@/lib/services/plan.service";
import { jsonDeleted, requireApiTeacher, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const DELETE = route<{ assocId: string }>(async (_request, context) => {
  const session = await requireApiTeacher();
  const { assocId } = await context.params;
  revokePlanAccess(assocId, session.user.id);
  return jsonDeleted("Acesso ao plano revogado");
});
