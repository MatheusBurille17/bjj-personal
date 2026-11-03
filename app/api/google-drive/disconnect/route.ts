import { jsonSuccess, requireApiUser, route } from "@/lib/middleware/errors";
import { disconnectDrive } from "@/lib/services/google-drive.service";

export const runtime = "nodejs";

export const DELETE = route(async () => {
  const session = await requireApiUser();
  const result = await disconnectDrive(session.user.id);
  return jsonSuccess({
    success: true,
    message: "Desconectado com sucesso",
    revoked: result.revoked,
  });
});

export const POST = DELETE;
