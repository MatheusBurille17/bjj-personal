import {
  ApiError,
  jsonSuccess,
  parseJson,
  requireApiUser,
  route,
} from "@/lib/middleware/errors";
import {
  getMigrationJob,
  runMigrationJob,
} from "@/lib/services/video-storage.service";

export const runtime = "nodejs";
// Cada execução processa um lote pequeno para caber no limite serverless.
export const maxDuration = 60;

export const GET = route<{ jobId: string }>(async (_request, context) => {
  const session = await requireApiUser();
  const { jobId } = await context.params;
  return jsonSuccess(await getMigrationJob(session.user.id, jobId));
});

/**
 * Executa o próximo lote do job sob demanda. O cliente deve chamar este
 * endpoint repetidamente até `status` ser `completed`/`failed` (a fila externa
 * é opcional). Isso substitui o `queueMicrotask`, que não sobrevive ao
 * serverless.
 */
export const POST = route<{ jobId: string }>(async (request, context) => {
  const session = await requireApiUser();
  if (!session.roles.is_teacher) {
    throw ApiError.forbidden("Somente instrutores podem migrar vídeos");
  }
  const { jobId } = await context.params;
  const body = (await parseJson(request).catch(() => ({}))) as {
    limit?: unknown;
  };
  const limit = Number(body.limit ?? 1);
  const job = await runMigrationJob(session.user.id, jobId, {
    limit: Number.isFinite(limit) && limit > 0 ? limit : 1,
  });
  return jsonSuccess(job);
});
