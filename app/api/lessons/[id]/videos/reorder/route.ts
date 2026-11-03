import { reorderLessonVideos } from "@/lib/services/lesson.service";
import { reorderSchema } from "@/lib/validation/library";
import { jsonSuccess, parseJson, requireApiTeacher, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const PATCH = route<{ id: string }>(async (request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  const data = reorderSchema.parse(await parseJson(request));
  return jsonSuccess(reorderLessonVideos(id, session.user.id, data.items));
});
