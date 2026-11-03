import { switchRole } from "@/lib/services/auth.service";
import { switchRoleSchema } from "@/lib/validation/auth";
import { jsonSuccess, parseJson, requireApiUser, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const POST = route(async (request) => {
  const session = await requireApiUser();
  const data = switchRoleSchema.parse(await parseJson(request));
  const result = await switchRole(session.user.id, data.role);
  return jsonSuccess(result);
});
