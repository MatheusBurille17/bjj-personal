import { deleteWeeklySlot, updateWeeklySlot } from "@/lib/services/lesson.service";
import { updateWeeklySlotSchema } from "@/lib/validation/lesson";
import {
  jsonDeleted,
  jsonSuccess,
  parseJson,
  requireApiTeacher,
  route,
} from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const PATCH = route<{ id: string }>(async (request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  const data = updateWeeklySlotSchema.parse(await parseJson(request));
  return jsonSuccess(await updateWeeklySlot(id, session.user.id, data));
});

export const DELETE = route<{ id: string }>(async (_request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  deleteWeeklySlot(id, session.user.id);
  return jsonDeleted("Horário removido");
});
