import { jsonSuccess, requireApiUser, route } from "@/lib/middleware/errors";
import { disconnectSupabaseGoogleAccount } from "@/lib/services/google-supabase-token.service";

export const runtime = "nodejs";

export const DELETE = route(async () => {
  const session = await requireApiUser();
  const result = await disconnectSupabaseGoogleAccount(session.user.id);
  return jsonSuccess({
    success: true,
    message: "Desconectado com sucesso",
    revoked: result.revocation_succeeded,
  });
});

export const POST = DELETE;
