import { createDirectUpload } from "@/lib/mux/upload";
import { jsonSuccess, requireApiTeacher, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const POST = route(async () => {
  await requireApiTeacher();
  return jsonSuccess(await createDirectUpload());
});
