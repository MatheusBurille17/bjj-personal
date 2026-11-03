import { createLesson, getLessons } from "@/lib/services/lesson.service";
import { createLessonSchema, lessonListSchema } from "@/lib/validation/lesson";
import {
  jsonCreated,
  jsonSuccess,
  parseJson,
  requireApiTeacher,
  route,
} from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const GET = route(async (request) => {
  const session = await requireApiTeacher();
  const { searchParams } = new URL(request.url);
  const query = lessonListSchema.parse({
    enrollment_id: searchParams.get("enrollment_id") ?? undefined,
    status: searchParams.getAll("status"),
    from_date: searchParams.get("from_date") ?? undefined,
    to_date: searchParams.get("to_date") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
  });
  const result = getLessons(session.user.id, query);
  return jsonSuccess(result.lessons, { pagination: result.pagination });
});

export const POST = route(async (request) => {
  const session = await requireApiTeacher();
  const data = createLessonSchema.parse(await parseJson(request));
  return jsonCreated(createLesson(session.user.id, data));
});
