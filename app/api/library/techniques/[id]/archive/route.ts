import { archiveTechnique } from "@/lib/services/library.service";
import { archiveDriveTechniqueAssets } from "@/lib/services/video-storage.service";
import { jsonSuccess, requireApiTeacher, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const POST = route<{ id: string }>(async (_request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  const technique = archiveTechnique(id, session.user.id);
  try {
    await archiveDriveTechniqueAssets(session.user.id, id);
  } catch (error) {
    console.warn("[google-drive] technique archive skip", {
      technique_id: id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return jsonSuccess(technique);
});
