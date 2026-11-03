import { changeLessonStatus } from "@/lib/services/lesson.service";
import { lessonStatusSchema } from "@/lib/validation/lesson";
import { jsonSuccess, parseJson, requireApiTeacher, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const PATCH = route<{ id: string }>(async (request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  const data = lessonStatusSchema.parse(await parseJson(request));
  return jsonSuccess(changeLessonStatus(id, session.user.id, data));
});
