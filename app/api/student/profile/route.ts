import { z } from "zod";
import { getStudentProfile } from "@/lib/services/portal.service";
import { updateOwnProfile } from "@/lib/services/auth.service";
import {
  jsonSuccess,
  parseJson,
  requireApiStudent,
  route,
} from "@/lib/middleware/errors";

export const runtime = "nodejs";

const studentProfileSchema = z.object({
  full_name: z.string().trim().min(2, "O nome deve ter pelo menos 2 caracteres").max(120).optional(),
  avatar_url: z.string().trim().max(2_000_000).nullable().optional(),
});

export const GET = route(async () => {
  const session = await requireApiStudent();
  return jsonSuccess(getStudentProfile(session.user.id));
});

export const PATCH = route(async (request) => {
  const session = await requireApiStudent();
  const data = studentProfileSchema.parse(await parseJson(request));
  return jsonSuccess(await updateOwnProfile(session.user.id, data));
});
