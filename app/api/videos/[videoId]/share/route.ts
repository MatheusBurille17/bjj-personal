import {
  ApiError,
  jsonSuccess,
  parseJson,
  requireApiUser,
  route,
} from "@/lib/middleware/errors";
import { shareVideoForUser } from "@/lib/services/video-storage.service";
import { toApiError } from "@/lib/google-drive-errors";

export const runtime = "nodejs";

export const POST = route<{ videoId: string }>(async (request, context) => {
  const session = await requireApiUser();
  const { videoId } = await context.params;
  const body = (await parseJson(request)) as { email?: string };
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw ApiError.validation("E-mail inválido");
  }
  try {
    await shareVideoForUser(
      videoId,
      session.user.id,
      session.activeRole,
      email,
    );
    return jsonSuccess({ success: true, shared_with: email });
  } catch (error) {
    throw toApiError(error);
  }
});
