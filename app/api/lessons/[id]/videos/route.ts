import { addLessonVideo, getLessonDetail } from "@/lib/services/lesson.service";
import { lessonVideoSchema } from "@/lib/validation/lesson";
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
  return jsonSuccess(getLessonDetail(id, session.user.id).videos);
});

export const POST = route<{ id: string }>(async (request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  const data = lessonVideoSchema.parse(await parseJson(request));
  return jsonCreated(addLessonVideo(id, session.user.id, data.video_id, data.sort_order));
});
