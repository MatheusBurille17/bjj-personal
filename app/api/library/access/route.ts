import {
  getAccessForEnrollment,
  grantTechniqueAccess,
} from "@/lib/services/library.service";
import { z } from "zod";
import {
  jsonCreated,
  jsonSuccess,
  parseJson,
  requireApiTeacher,
  route,
} from "@/lib/middleware/errors";

export const runtime = "nodejs";

const grantSchema = z.object({
  enrollment_id: z.string().uuid("Aluno inválido"),
  technique_id: z.string().uuid("Técnica inválida"),
});

export const GET = route(async (request) => {
  const session = await requireApiTeacher();
  const { searchParams } = new URL(request.url);
  const enrollmentId = searchParams.get("enrollment_id");
  if (!enrollmentId) return jsonSuccess([]);
  return jsonSuccess(getAccessForEnrollment(enrollmentId, session.user.id));
});

export const POST = route(async (request) => {
  const session = await requireApiTeacher();
  const data = grantSchema.parse(await parseJson(request));
  return jsonCreated(
    grantTechniqueAccess(session.user.id, data.enrollment_id, data.technique_id),
  );
});
