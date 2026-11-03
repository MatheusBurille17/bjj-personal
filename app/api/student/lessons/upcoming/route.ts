import { getStudentAgenda } from "@/lib/services/portal.service";
import { jsonSuccess, requireApiStudent, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const GET = route(async () => {
  const session = await requireApiStudent();
  const upcoming = getStudentAgenda(session.user.id).filter(
    (lesson) => lesson.status === "scheduled" && new Date(lesson.starts_at).getTime() >= Date.now(),
  );
  return jsonSuccess(upcoming);
});
