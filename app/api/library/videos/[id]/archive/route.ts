import { archiveVideo } from "@/lib/services/library.service";
import { archiveDriveVideoAssets } from "@/lib/services/video-storage.service";
import { jsonSuccess, requireApiTeacher, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const POST = route<{ id: string }>(async (_request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  const video = archiveVideo(id, session.user.id);
  try {
    await archiveDriveVideoAssets(session.user.id, id);
  } catch (error) {
    console.warn("[google-drive] archive skip", {
      video_id: id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return jsonSuccess(video);
});
