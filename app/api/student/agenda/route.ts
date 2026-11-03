import { getStudentAgenda } from "@/lib/services/portal.service";
import { jsonSuccess, requireApiStudent, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const GET = route(async (request) => {
  const session = await requireApiStudent();
  const { searchParams } = new URL(request.url);
  return jsonSuccess(
    await getStudentAgenda(session.user.id, {
      from_date: searchParams.get("from_date") ?? undefined,
      to_date: searchParams.get("to_date") ?? undefined,
      enrollment_id: searchParams.get("enrollment_id") ?? undefined,
    }),
  );
});
