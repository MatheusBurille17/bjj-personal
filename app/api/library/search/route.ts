import { searchVideos } from "@/lib/services/library.service";
import {
  jsonSuccess,
  parseQueryInt,
  requireApiTeacher,
  route,
} from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const GET = route(async (request) => {
  const session = await requireApiTeacher();
  const { searchParams } = new URL(request.url);
  const result = await searchVideos(session.user.id, {
    search: searchParams.get("search") ?? "",
    includeArchived: searchParams.get("includeArchived") === "true",
    page: parseQueryInt(searchParams.get("page"), 1),
    pageSize: parseQueryInt(searchParams.get("pageSize"), 20),
  });
  return jsonSuccess(result.videos, { pagination: result.pagination });
});
