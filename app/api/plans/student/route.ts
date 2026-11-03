import { getStudentTrainingPlans } from "@/lib/services/portal.service";
import { jsonSuccess, requireApiStudent, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const GET = route(async (request) => {
  const session = await requireApiStudent();
  const { searchParams } = new URL(request.url);
  return jsonSuccess(
    await getStudentTrainingPlans(
      session.user.id,
      searchParams.get("enrollment_id") ?? undefined,
    ),
  );
});
