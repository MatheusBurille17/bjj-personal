import { getLessonDetail, updateLesson } from "@/lib/services/lesson.service";
import { updateLessonSchema } from "@/lib/validation/lesson";
import { jsonSuccess, parseJson, requireApiTeacher, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const GET = route<{ id: string }>(async (_request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  return jsonSuccess(getLessonDetail(id, session.user.id));
});

export const PATCH = route<{ id: string }>(async (request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  const data = updateLessonSchema.parse(await parseJson(request));
  return jsonSuccess(updateLesson(id, session.user.id, data));
});
