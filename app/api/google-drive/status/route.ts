import { jsonSuccess, requireApiUser, route } from "@/lib/middleware/errors";
import { getSupabaseDriveConnectionStatus } from "@/lib/services/google-supabase-token.service";

export const runtime = "nodejs";

export const GET = route(async () => {
  const session = await requireApiUser();
  const status = await getSupabaseDriveConnectionStatus(session.user.id, {
    includeStorage: true,
  });
  return jsonSuccess(status);
});
