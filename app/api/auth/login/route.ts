import { login } from "@/lib/services/auth.service";
import { loginSchema } from "@/lib/validation/auth";
import { jsonSuccess, parseJson, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const POST = route(async (request) => {
  const body = await parseJson(request);
  const data = loginSchema.parse(body);
  const result = await login(data);
  return jsonSuccess(result);
});
