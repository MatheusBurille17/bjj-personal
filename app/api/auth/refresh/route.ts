import { requireApiUser } from "@/lib/middleware/errors";
import { createSessionCookie } from "@/lib/auth/session";
import { jsonSuccess, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const POST = route(async () => {
  const session = await requireApiUser();
  const expiresAt = await createSessionCookie(session.user.id, session.activeRole);
  return jsonSuccess({
    session: {
      expires_at: expiresAt,
      user_id: session.user.id,
      role: session.activeRole,
    },
  });
});
