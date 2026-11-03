import { jsonSuccess, requireApiUser, route } from "@/lib/middleware/errors";
import { getVideoStorageStatus } from "@/lib/services/video-storage.service";

export const runtime = "nodejs";

export const GET = route(async () => {
  const session = await requireApiUser();
  const status = await getVideoStorageStatus(session.user.id);
  return jsonSuccess(status);
});
