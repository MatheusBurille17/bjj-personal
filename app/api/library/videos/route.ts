import { createVideo } from "@/lib/services/library.service";
import { createVideoSchema } from "@/lib/validation/library";
import { jsonCreated, parseJson, requireApiTeacher, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const POST = route(async (request) => {
  const session = await requireApiTeacher();
  const data = createVideoSchema.parse(await parseJson(request));
  return jsonCreated(createVideo(session.user.id, data));
});
