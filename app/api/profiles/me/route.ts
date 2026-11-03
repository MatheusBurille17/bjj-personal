import { getProfileView } from "@/lib/services/profile.service";
import { updateOwnProfile } from "@/lib/services/auth.service";
import { profileUpdateSchema } from "@/lib/validation/auth";
import {
  jsonSuccess,
  parseJson,
  requireApiUser,
  route,
} from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const GET = route(async () => {
  const session = await requireApiUser();
  return jsonSuccess(getProfileView(session.user.id));
});

export const PATCH = route(async (request) => {
  const session = await requireApiUser();
  const data = profileUpdateSchema.parse(await parseJson(request));
  const result = await updateOwnProfile(session.user.id, data);
  return jsonSuccess(result);
});
