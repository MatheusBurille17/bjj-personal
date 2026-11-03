import { createTeacherAccount } from "@/lib/services/auth.service";
import { signupSchema } from "@/lib/validation/auth";
import { jsonCreated, parseJson, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const POST = route(async (request) => {
  const body = await parseJson(request);
  const data = signupSchema.parse(body);
  const result = await createTeacherAccount(data);
  return jsonCreated(result);
});
