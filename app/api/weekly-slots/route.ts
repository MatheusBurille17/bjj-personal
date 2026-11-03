import { createWeeklySlot, getWeeklySlots } from "@/lib/services/lesson.service";
import { createWeeklySlotSchema } from "@/lib/validation/lesson";
import {
  jsonCreated,
  jsonSuccess,
  parseJson,
  requireApiTeacher,
  route,
} from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const GET = route(async (request) => {
  const session = await requireApiTeacher();
  const { searchParams } = new URL(request.url);
  return jsonSuccess(
    await getWeeklySlots(session.user.id, searchParams.get("enrollment_id") ?? undefined),
  );
});

export const POST = route(async (request) => {
  const session = await requireApiTeacher();
  const data = createWeeklySlotSchema.parse(await parseJson(request));
  return jsonCreated(await createWeeklySlot(session.user.id, data));
});
