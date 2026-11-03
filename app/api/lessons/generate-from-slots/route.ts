import { generateLessonsFromSlots } from "@/lib/services/lesson.service";
import { generateLessonsSchema } from "@/lib/validation/lesson";
import { jsonSuccess, parseJson, requireApiTeacher, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const POST = route(async (request) => {
  const session = await requireApiTeacher();
  const data = generateLessonsSchema.parse(await parseJson(request));
  return jsonSuccess(await generateLessonsFromSlots(session.user.id, data));
});
