import { getStudentLessonDetail } from "@/lib/services/portal.service";
import { jsonSuccess, requireApiStudent, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const GET = route<{ id: string }>(async (_request, context) => {
  const session = await requireApiStudent();
  const { id } = await context.params;
  return jsonSuccess(await getStudentLessonDetail(session.user.id, id));
});
