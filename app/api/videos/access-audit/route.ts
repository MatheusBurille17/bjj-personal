import { jsonSuccess, requireApiUser, route } from "@/lib/middleware/errors";
import { listVideoAccessAudit } from "@/lib/services/video-storage.service";

export const runtime = "nodejs";

export const GET = route(async (request) => {
  const session = await requireApiUser();
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "20");

  return jsonSuccess(
    listVideoAccessAudit(session.user.id, session.activeRole, {
      videoId: url.searchParams.get("video_id") ?? undefined,
      userId: url.searchParams.get("user_id") ?? undefined,
      dateFrom: url.searchParams.get("date_from") ?? undefined,
      dateTo: url.searchParams.get("date_to") ?? undefined,
      page: Number.isFinite(page) && page > 0 ? page : 1,
      pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20,
    }),
  );
});
