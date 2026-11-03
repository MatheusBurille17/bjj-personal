import { revokeAccess } from "@/lib/services/library.service";
import { jsonDeleted, requireApiTeacher, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const DELETE = route<{ id: string }>(async (_request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  revokeAccess(id, session.user.id);
  return jsonDeleted("Acesso revogado");
});
