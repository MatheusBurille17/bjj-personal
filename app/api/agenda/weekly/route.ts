import { getWeeklyAgenda } from "@/lib/services/lesson.service";
import { agendaQuerySchema } from "@/lib/validation/lesson";
import { jsonSuccess, requireApiTeacher, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const GET = route(async (request) => {
  const session = await requireApiTeacher();
  const { searchParams } = new URL(request.url);
  const query = agendaQuerySchema.parse({
    week_start: searchParams.get("week_start") ?? undefined,
    date: searchParams.get("date") ?? undefined,
  });
  return jsonSuccess(getWeeklyAgenda(session.user.id, query.week_start));
});
