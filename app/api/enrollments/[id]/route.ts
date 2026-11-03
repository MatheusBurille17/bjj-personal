import {
  deleteEnrollment,
  getEnrollmentDetail,
  updateEnrollment,
} from "@/lib/services/enrollment.service";
import { updateEnrollmentSchema } from "@/lib/validation/enrollment";
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
  return jsonSuccess(await getEnrollmentDetail(id, session.user.id));
});

export const PATCH = route<{ id: string }>(async (request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  const data = updateEnrollmentSchema.parse(await parseJson(request));
  return jsonSuccess(await updateEnrollment(id, session.user.id, data));
});

export const DELETE = route<{ id: string }>(async (_request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  deleteEnrollment(id, session.user.id);
  return jsonDeleted("Aluno removido");
});
