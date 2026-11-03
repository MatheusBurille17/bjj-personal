import { getTeacherPublicProfile } from "@/lib/services/profile.service";
import { jsonSuccess, requireApiUser, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const GET = route<{ id: string }>(async (_request, context) => {
  const session = await requireApiUser();
  const { id } = await context.params;
  return jsonSuccess(await getTeacherPublicProfile(id, session.user.id));
});
