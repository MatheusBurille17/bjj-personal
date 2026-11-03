import { createTechnique, getTechniques } from "@/lib/services/library.service";
import { createTechniqueSchema } from "@/lib/validation/library";
import {
  jsonCreated,
  jsonSuccess,
  parseJson,
  parseQueryInt,
  requireApiTeacher,
  route,
} from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const GET = route(async (request) => {
  const session = await requireApiTeacher();
  const { searchParams } = new URL(request.url);
  const result = getTechniques(session.user.id, {
    includeArchived: searchParams.get("includeArchived") === "true",
    page: parseQueryInt(searchParams.get("page"), 1),
    pageSize: parseQueryInt(searchParams.get("pageSize"), 20),
  });
  return jsonSuccess(result.techniques, { pagination: result.pagination });
});

export const POST = route(async (request) => {
  const session = await requireApiTeacher();
  const data = createTechniqueSchema.parse(await parseJson(request));
  return jsonCreated(createTechnique(session.user.id, data));
});
