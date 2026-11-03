import { resetPassword } from "@/lib/services/auth.service";
import { clearSessionCookie } from "@/lib/auth/session";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { jsonSuccess, parseJson, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const POST = route(async (request) => {
  const body = await parseJson(request);
  const data = resetPasswordSchema.parse(body);
  await resetPassword(data.token, data.password);
  await clearSessionCookie();
  return jsonSuccess({ success: true, message: "Senha atualizada com sucesso" });
});
