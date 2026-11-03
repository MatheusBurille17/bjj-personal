import { getTeacherDashboard } from "@/lib/services/lesson.service";
import { jsonSuccess, requireApiTeacher, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const GET = route(async () => {
  const session = await requireApiTeacher();
  return jsonSuccess(getTeacherDashboard(session.user.id));
});
