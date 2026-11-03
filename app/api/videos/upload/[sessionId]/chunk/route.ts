import { ApiError, jsonSuccess, requireApiUser, route } from "@/lib/middleware/errors";
import { appendUploadChunk } from "@/lib/services/video-storage.service";

export const runtime = "nodejs";

export const POST = route<{ sessionId: string }>(async (request, context) => {
  const session = await requireApiUser();
  const { sessionId } = await context.params;
  const url = new URL(request.url);
  const chunkIndex = Number(url.searchParams.get("chunk_index") ?? "-1");
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    throw ApiError.validation("chunk_index inválido");
  }

  const contentType = request.headers.get("content-type") ?? "";
  let data: Uint8Array;
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const chunk = form.get("chunk_data") ?? form.get("file");
    if (!(chunk instanceof Blob)) throw ApiError.validation("chunk_data obrigatório");
    data = new Uint8Array(await chunk.arrayBuffer());
  } else {
    data = new Uint8Array(await request.arrayBuffer());
  }

  if (data.length === 0) throw ApiError.validation("Chunk vazio");
  return jsonSuccess(appendUploadChunk(session.user.id, sessionId, chunkIndex, data));
});
