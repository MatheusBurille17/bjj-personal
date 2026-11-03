import { jsonSuccess, requireApiUser, route } from "@/lib/middleware/errors";
import { cancelUploadSession } from "@/lib/services/video-storage.service";

export const runtime = "nodejs";

export const POST = route<{ sessionId: string }>(async (_request, context) => {
  const session = await requireApiUser();
  const { sessionId } = await context.params;
  return jsonSuccess(await cancelUploadSession(session.user.id, sessionId));
});
