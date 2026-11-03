import { setVideoStatus } from "@/lib/services/library.service";
import { videoStatusSchema } from "@/lib/validation/library";
import { jsonSuccess, parseJson, requireApiTeacher, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

/** Endpoint de apoio ao modo demonstração: simula o webhook de processamento. */
export const POST = route<{ id: string }>(async (request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  const data = videoStatusSchema.parse(await parseJson(request));
  return jsonSuccess(await setVideoStatus(id, session.user.id, data.status));
});
