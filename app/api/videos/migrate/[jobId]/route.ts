import { jsonSuccess, requireApiUser, route } from "@/lib/middleware/errors";
import { getMigrationJob } from "@/lib/services/video-storage.service";

export const runtime = "nodejs";

export const GET = route<{ jobId: string }>(async (_request, context) => {
  const session = await requireApiUser();
  const { jobId } = await context.params;
  return jsonSuccess(getMigrationJob(session.user.id, jobId));
});
