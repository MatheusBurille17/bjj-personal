import {
  ApiError,
  jsonCreated,
  parseJson,
  requireApiUser,
  route,
} from "@/lib/middleware/errors";
import { startMigrationJob } from "@/lib/services/video-storage.service";

export const runtime = "nodejs";

export const POST = route(async (request) => {
  const session = await requireApiUser();
  if (!session.roles.is_teacher) {
    throw ApiError.forbidden("Somente instrutores podem migrar vídeos");
  }
  const body = (await parseJson(request).catch(() => ({}))) as {
    video_ids?: unknown;
  };
  const videoIds = Array.isArray(body.video_ids)
    ? body.video_ids.filter((id): id is string => typeof id === "string")
    : undefined;
  const job = startMigrationJob(session.user.id, videoIds);
  return jsonCreated({
    migrationId: job.id,
    status: job.status,
    totalVideos: job.total_videos,
    processedVideos: job.processed_videos,
  });
});
