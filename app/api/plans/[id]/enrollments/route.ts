import { getPlanEnrollments, grantPlanAccess } from "@/lib/services/plan.service";
import { grantPlanAccessSchema } from "@/lib/validation/plan";
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
  return jsonSuccess(await getPlanEnrollments(id, session.user.id));
});

export const POST = route<{ id: string }>(async (request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  const data = grantPlanAccessSchema.parse(await parseJson(request));
  return jsonCreated(await grantPlanAccess(id, session.user.id, data.enrollment_id));
});
