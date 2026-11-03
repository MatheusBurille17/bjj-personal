import { getLessonStats } from "@/lib/services/lesson.service";
import { jsonSuccess, requireApiTeacher, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const GET = route(async (request) => {
  const session = await requireApiTeacher();
  const { searchParams } = new URL(request.url);
  return jsonSuccess(
    await getLessonStats(session.user.id, {
      enrollment_id: searchParams.get("enrollment_id") ?? undefined,
      from_date: searchParams.get("from_date") ?? undefined,
      to_date: searchParams.get("to_date") ?? undefined,
    }),
  );
});
