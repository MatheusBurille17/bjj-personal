import { getModules } from "@/lib/services/library.service";
import { jsonSuccess, requireApiTeacher, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const GET = route<{ id: string }>(async (request, context) => {
  const session = await requireApiTeacher();
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  return jsonSuccess(
    await getModules(id, session.user.id, searchParams.get("includeArchived") === "true"),
  );
});
