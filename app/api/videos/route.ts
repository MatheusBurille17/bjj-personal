import { jsonSuccess, requireApiUser, route } from "@/lib/middleware/errors";
import { listUserVideos } from "@/lib/services/video-storage.service";

export const runtime = "nodejs";

export const GET = route(async (request) => {
  const session = await requireApiUser();
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(
    url.searchParams.get("pageSize") ?? url.searchParams.get("limit") ?? "20",
  );
  const offsetRaw = url.searchParams.get("offset");
  const archived = url.searchParams.get("archived");

  const result = await listUserVideos(session.user.id, session.activeRole, {
    technique_id: url.searchParams.get("technique_id") ?? undefined,
    module_id: url.searchParams.get("module_id") ?? undefined,
    visibility:
      url.searchParams.get("visibility") === "personal"
        ? "personal"
        : url.searchParams.get("visibility") === "library"
          ? "library"
          : undefined,
    archived: archived === "true" || archived === "1",
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20,
    ...(offsetRaw !== null
      ? {
          offset:
            Number.isFinite(Number(offsetRaw)) && Number(offsetRaw) >= 0
              ? Number(offsetRaw)
              : 0,
        }
      : {}),
  });

  return jsonSuccess(result);
});
