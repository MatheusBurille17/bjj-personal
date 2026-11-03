import { getStudentStatistics } from "@/lib/services/portal.service";
import { jsonSuccess, requireApiStudent, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const GET = route(async () => {
  const session = await requireApiStudent();
  return jsonSuccess(await getStudentStatistics(session.user.id));
});
