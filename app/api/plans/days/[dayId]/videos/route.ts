import { addVideoToPlanDay, getPlanDayVideos } from "@/lib/services/plan.service";
import { planVideoSchema } from "@/lib/validation/plan";
import {
  jsonCreated,
  jsonSuccess,
  parseJson,
  requireApiTeacher,
  route,
} from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const GET = route<{ dayId: string }>(async (_request, context) => {
  const session = await requireApiTeacher();
  const { dayId } = await context.params;
  return jsonSuccess(getPlanDayVideos(dayId, session.user.id));
});

export const POST = route<{ dayId: string }>(async (request, context) => {
  const session = await requireApiTeacher();
  const { dayId } = await context.params;
  const data = planVideoSchema.parse(await parseJson(request));
  return jsonCreated(addVideoToPlanDay(dayId, session.user.id, data.video_id, data.sort_order));
});
