import { getStudentHistory } from "@/lib/services/portal.service";
import {
  jsonSuccess,
  parseQueryInt,
  requireApiStudent,
  route,
} from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const GET = route(async (request) => {
  const session = await requireApiStudent();
  const { searchParams } = new URL(request.url);
  const result = getStudentHistory(session.user.id, {
    from_date: searchParams.get("from_date") ?? undefined,
    to_date: searchParams.get("to_date") ?? undefined,
    enrollment_id: searchParams.get("enrollment_id") ?? undefined,
    page: parseQueryInt(searchParams.get("page"), 1),
    pageSize: parseQueryInt(searchParams.get("pageSize"), 20),
  });
  return jsonSuccess(result.lessons, { pagination: result.pagination });
});
