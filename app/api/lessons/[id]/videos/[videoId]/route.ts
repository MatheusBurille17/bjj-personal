import { removeLessonVideo } from "@/lib/services/lesson.service";
import { jsonDeleted, requireApiTeacher, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const DELETE = route<{ id: string; videoId: string }>(async (_request, context) => {
  const session = await requireApiTeacher();
  const { id, videoId } = await context.params;
  removeLessonVideo(id, session.user.id, videoId);
  return jsonDeleted("Vídeo removido da aula");
});
