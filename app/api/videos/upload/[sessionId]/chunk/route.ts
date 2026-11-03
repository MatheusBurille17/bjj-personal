import {
  ApiError,
  jsonSuccess,
  requireApiUser,
  route,
} from "@/lib/middleware/errors";
import {
  getUploadSession,
  markUploadChunk,
} from "@/lib/services/video-storage.service";

export const runtime = "nodejs";
// 4 MB de corpo + overhead; abaixo do limite de 4,5 MB das Functions.
export const maxDuration = 60;

interface DriveErrorPayload {
  error?: { message?: string };
}

/**
 * Proxy de um chunk para a sessão resumable do Google Drive.
 *
 * O navegador fala apenas com a nossa origem (sem CORS); este Route Handler
 * repassa os bytes ao Google. Cada chunk tem no máximo 4 MB.
 */
export const PUT = route<{ sessionId: string }>(async (request, context) => {
  const session = await requireApiUser();
  const { sessionId } = await context.params;

  const contentRange = request.headers.get("content-range");
  const match = contentRange
    ? /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange)
    : null;
  if (!contentRange || !match) {
    throw ApiError.validation("Header Content-Range inválido ou ausente");
  }

  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = Number(match[3]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    !Number.isSafeInteger(total) ||
    start < 0 ||
    start > end ||
    end >= total
  ) {
    throw ApiError.validation("Intervalo do Content-Range inválido");
  }

  const upload = await getUploadSession(session.user.id, sessionId);
  if (upload.status === "completed" || upload.status === "cancelled") {
    throw ApiError.conflict("Sessão de upload encerrada");
  }
  if (!upload.drive_session_url) {
    throw ApiError.conflict("Sessão de upload sem URL do Google Drive");
  }
  if (total !== upload.total_bytes) {
    throw ApiError.validation("Tamanho total do arquivo divergente");
  }

  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length === 0) {
    throw ApiError.validation("Chunk vazio");
  }
  if (end - start + 1 !== body.length) {
    throw ApiError.validation("O corpo não corresponde ao Content-Range");
  }

  let response: Response;
  try {
    response = await fetch(upload.drive_session_url, {
      method: "PUT",
      headers: {
        "Content-Type": upload.mime_type,
        "Content-Range": contentRange,
      },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    console.error("[google-drive] falha ao enviar chunk", {
      session_id: sessionId,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new ApiError(
      502,
      "SERVICE_UNAVAILABLE",
      "Não foi possível enviar o chunk ao Google Drive. Tente novamente.",
      { drive_error: "network_error" },
    );
  }

  const chunkIndex = Math.floor(start / upload.chunk_size);
  const registerProgress = async () => {
    try {
      await markUploadChunk(session.user.id, sessionId, chunkIndex);
    } catch (error) {
      console.warn("[google-drive] falha ao registrar progresso do chunk", {
        session_id: sessionId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (response.status === 308) {
    await registerProgress();
    return jsonSuccess({
      status: "partial",
      range: response.headers.get("range"),
    });
  }

  if (response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { id?: string }
      | null;
    const fileId = typeof payload?.id === "string" ? payload.id : "";
    if (!fileId) {
      throw new ApiError(
        502,
        "SERVICE_UNAVAILABLE",
        "O Google Drive não retornou o ID do arquivo enviado.",
        { drive_error: "server_error" },
      );
    }
    await registerProgress();
    return jsonSuccess({ status: "completed", file_id: fileId });
  }

  const payload = (await response.json().catch(() => null)) as
    | DriveErrorPayload
    | null;
  console.error("[google-drive] Google recusou o chunk", {
    session_id: sessionId,
    status: response.status,
    message: payload?.error?.message ?? null,
  });
  throw new ApiError(
    response.status === 401 || response.status === 403 ? 401 : 502,
    response.status === 401 || response.status === 403
      ? "UNAUTHORIZED"
      : "SERVICE_UNAVAILABLE",
    payload?.error?.message ??
      "O Google Drive recusou o chunk enviado. Tente novamente.",
    { drive_error: "upload_failed" },
  );
});
