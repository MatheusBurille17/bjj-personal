import { requestPasswordRecovery } from "@/lib/services/auth.service";
import { recoverSchema } from "@/lib/validation/auth";
import { jsonSuccess, parseJson, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const POST = route(async (request) => {
  const body = await parseJson(request);
  const data = recoverSchema.parse(body);
  const result = await requestPasswordRecovery(data.email);
  return jsonSuccess(result);
});
