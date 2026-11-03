import { clearSessionCookie } from "@/lib/auth/session";
import { jsonSuccess, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const POST = route(async () => {
  await clearSessionCookie();
  return jsonSuccess({ success: true });
});
