import { archiveModule } from "@/lib/services/library.service";
import { archiveDriveModuleAssets } from "@/lib/services/video-storage.service";
import { jsonSuccess, requireApiTeacher, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const POST = route<{ id: string }>(async (_request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  const moduleRecord = archiveModule(id, session.user.id);
  try {
    await archiveDriveModuleAssets(session.user.id, id);
  } catch (error) {
    console.warn("[google-drive] module archive skip", {
      module_id: id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return jsonSuccess(moduleRecord);
});
