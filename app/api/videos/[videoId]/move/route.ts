import {
  jsonSuccess,
  parseJson,
  requireApiUser,
  route,
} from "@/lib/middleware/errors";
import { moveVideoForUser } from "@/lib/services/video-storage.service";
import { toApiError } from "@/lib/google-drive-errors";

export const runtime = "nodejs";

export const POST = route<{ videoId: string }>(async (request, context) => {
  const session = await requireApiUser();
  const { videoId } = await context.params;
  const body = (await parseJson(request)) as {
    destination_module_id?: string;
    archive?: boolean | string;
  };
  try {
    const result = await moveVideoForUser(
      videoId,
      session.user.id,
      session.activeRole,
      {
        destination_module_id: body.destination_module_id,
        archive: body.archive === true || body.archive === "true",
      },
    );
    return jsonSuccess({
      video: result.video,
      new_path: result.folder_id,
    });
  } catch (error) {
    throw toApiError(error);
  }
});
