import { createPlan, getPlans } from "@/lib/services/plan.service";
import { createPlanSchema, planListSchema } from "@/lib/validation/plan";
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
  const query = planListSchema.parse({
    search: searchParams.get("search") ?? "",
    status: searchParams.getAll("status"),
    from_date: searchParams.get("from_date") ?? undefined,
    to_date: searchParams.get("to_date") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
  });
  const result = await getPlans(session.user.id, query);
  return jsonSuccess(result.plans, { pagination: result.pagination });
});

export const POST = route(async (request) => {
  const session = await requireApiTeacher();
  const data = createPlanSchema.parse(await parseJson(request));
  return jsonCreated(await createPlan(session.user.id, data));
});
