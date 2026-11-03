import {
  deleteVideo,
  getVideo,
  updateVideo,
} from "@/lib/services/library.service";
import {
  deleteVideoForUser,
  updateVideoForUser,
} from "@/lib/services/video-storage.service";
import { updateVideoSchema } from "@/lib/validation/library";
import {
  jsonDeleted,
  jsonSuccess,
  parseJson,
  requireApiTeacher,
  route,
} from "@/lib/middleware/errors";
import { toApiError } from "@/lib/google-drive-errors";

export const runtime = "nodejs";

export const PATCH = route<{ id: string }>(async (request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  const data = updateVideoSchema.parse(await parseJson(request));
  const video = await getVideo(id, session.user.id);

  if (video.provider === "google_drive") {
    try {
      return jsonSuccess(
        await updateVideoForUser(id, session.user.id, "teacher", {
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.description !== undefined
            ? { description: data.description }
            : {}),
        }),
      );
    } catch (error) {
      throw toApiError(error);
    }
  }

  return jsonSuccess(await updateVideo(id, session.user.id, data));
});

export const DELETE = route<{ id: string }>(async (request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  const video = await getVideo(id, session.user.id);
  const hard = new URL(request.url).searchParams.get("hard") === "true";

  if (video.provider === "google_drive") {
    const result = await deleteVideoForUser(
      id,
      session.user.id,
      "teacher",
      { hard },
    );
    return jsonDeleted(
      result.driveDeleted
        ? "Vídeo e arquivo do Drive removidos"
        : "Vídeo removido",
    );
  }

  await deleteVideo(id, session.user.id);
  return jsonDeleted("Vídeo removido");
});
