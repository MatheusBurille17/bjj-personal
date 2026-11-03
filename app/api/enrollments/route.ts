import {
  createEnrollment,
  getEnrollments,
} from "@/lib/services/enrollment.service";
import {
  createEnrollmentSchema,
  searchEnrollmentsSchema,
} from "@/lib/validation/enrollment";
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
  const query = searchEnrollmentsSchema.parse({
    search: searchParams.get("search") ?? "",
    status: searchParams.getAll("status"),
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
  });

  const result = await getEnrollments(session.user.id, query);
  return jsonSuccess(result, { pagination: result.pagination });
});

export const POST = route(async (request) => {
  const session = await requireApiTeacher();
  const data = createEnrollmentSchema.parse(await parseJson(request));
  const result = await createEnrollment(session.user.id, data);
  return jsonCreated(result);
});
