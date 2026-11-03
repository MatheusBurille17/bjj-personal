import { ApiClientError, apiFetch } from "./client";

export interface PlaybackResponse {
  playback_url: string;
  expires_at: string;
  expires_in: number;
  provider: "google_drive" | "mux" | "demo";
}

export interface DriveStatusResponse {
  connected: boolean;
  userEmail: string | null;
  driveId: string | null;
  lastSync: string | null;
  expiresAt: string | null;
  scope: string | null;
  storage: {
    limit: number | null;
    usage: number | null;
    usageInDrive: number | null;
    usageInDriveTrash: number | null;
  } | null;
}

export async function fetchDriveStatus(): Promise<DriveStatusResponse> {
  return apiFetch<DriveStatusResponse>("/api/google-drive/status");
}

/**
 * Usa o mesmo consentimento OAuth do login social. O callback cria a sessão
 * (quando necessário) e espelha os tokens para o Google Drive.
 */
export async function beginDriveAuthorization(
  redirectPath: string,
): Promise<string> {
  const params = new URLSearchParams({
    connect_mode: "true",
    redirect_path: redirectPath,
  });
  const result = await apiFetch<{ authorization_url: string }>(
    `/api/auth/google/authorize?${params.toString()}`,
    { method: "POST" },
  );
  return result.authorization_url;
}

export async function disconnectDrive(): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>("/api/google-drive/disconnect", {
    method: "DELETE",
  });
}

export async function requestPlayback(videoId: string): Promise<PlaybackResponse> {
  return apiFetch<PlaybackResponse>(`/api/videos/${videoId}/playback-url`);
}

export async function fetchVideoAudit(
  videoId: string,
): Promise<{ logs: Array<Record<string, unknown>> }> {
  return apiFetch(`/api/videos/access-audit?video_id=${encodeURIComponent(videoId)}`);
}

export async function shareVideo(
  videoId: string,
  email: string,
): Promise<{ success: boolean }> {
  return apiFetch(`/api/videos/${videoId}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

export interface UploadHandle {
  promise: Promise<unknown>;
  abort: () => void;
}

export interface CreateUploadSessionInput {
  title: string;
  description?: string | null;
  destination: "library" | "personal";
  moduleId?: string | null;
  file: File;
}

export interface UploadSessionResponse {
  session_id: string;
  upload_url: string;
  chunk_size: number;
  total_chunks: number;
  file_name: string;
  mime_type: string;
  expires_at: string;
}

export interface CompletedUploadResponse {
  video_id: string;
  file_id: string;
  name: string;
  size: number | null;
  url: string | null;
  provider: string;
  status: string;
}

interface UploadChunkResponse {
  status: "partial" | "completed";
  file_id?: string;
  range?: string | null;
}

/** Cria a sessão resumable no Drive. */
export async function createUploadSession(
  input: CreateUploadSessionInput,
): Promise<UploadSessionResponse> {
  return apiFetch<UploadSessionResponse>("/api/videos/upload/initialize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: input.title,
      description: input.description ?? "",
      destination: input.destination,
      module_id: input.moduleId ?? undefined,
      file_name: input.file.name,
      mime_type: input.file.type || "video/mp4",
      total_bytes: input.file.size,
    }),
  });
}

export async function completeUploadSession(
  sessionId: string,
  fileId: string,
  size?: number,
): Promise<CompletedUploadResponse> {
  return apiFetch<CompletedUploadResponse>(
    `/api/videos/upload/${encodeURIComponent(sessionId)}/complete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId, size }),
    },
  );
}

export async function cancelUploadSession(sessionId: string): Promise<void> {
  await apiFetch(`/api/videos/upload/${encodeURIComponent(sessionId)}/cancel`, {
    method: "POST",
  });
}

/**
 * Envia o arquivo em chunks de 4 MB para o proxy da própria aplicação.
 *
 * O Route Handler repassa cada chunk à sessão resumable do Google. O navegador
 * nunca fala com `googleapis.com`, então não há bloqueio de CORS. Cada chunk
 * fica abaixo do limite de 4,5 MB por requisição das Functions da Vercel.
 */
export function uploadVideoResumable(
  input: CreateUploadSessionInput,
  onProgress: (progress: {
    loaded: number;
    total: number;
    percentage: number;
  }) => void,
): UploadHandle {
  const controller = new AbortController();
  let aborted = false;

  const promise = (async () => {
    const session = await createUploadSession(input);
    if (aborted) {
      await cancelUploadSession(session.session_id).catch(() => undefined);
      throw new ApiClientError(0, {
        code: "INTERNAL_ERROR",
        message: "Upload cancelado",
      });
    }

    const chunkSize =
      session.chunk_size > 0 ? session.chunk_size : 4 * 1024 * 1024;
    let offset = 0;
    let fileId: string | null = null;

    try {
      while (offset < input.file.size) {
        const end = Math.min(offset + chunkSize, input.file.size);
        const chunk = input.file.slice(offset, end);

        let response: Response;
        try {
          response = await fetch(
            `/api/videos/upload/${encodeURIComponent(session.session_id)}/chunk`,
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/octet-stream",
                "Content-Range": `bytes ${offset}-${end - 1}/${input.file.size}`,
              },
              body: chunk,
              signal: controller.signal,
            },
          );
        } catch {
          if (aborted) {
            throw new ApiClientError(0, {
              code: "INTERNAL_ERROR",
              message: "Upload cancelado",
            });
          }
          throw new ApiClientError(0, {
            code: "INTERNAL_ERROR",
            message:
              "Falha de rede durante o upload. Verifique sua conexão e tente novamente.",
          });
        }

        const payload = (await response.json().catch(() => null)) as
          | { data?: UploadChunkResponse; error?: unknown }
          | null;
        if (!response.ok) {
          const detail = payload?.error as
            | { code?: string; message?: string }
            | undefined;
          throw new ApiClientError(response.status, {
            code: (detail?.code as never) ?? "INTERNAL_ERROR",
            message:
              detail?.message ??
              "Não foi possível enviar o arquivo para o Google Drive.",
          });
        }

        const data = payload?.data ?? (payload as UploadChunkResponse | null);
        if (data?.status === "completed" && data.file_id) {
          fileId = data.file_id;
        }

        // O Google pode confirmar menos bytes do que enviamos; retoma do ponto
        // informado no header Range.
        if (data?.status === "partial" && data.range) {
          const range = /bytes=(\d+)-(\d+)/.exec(data.range);
          offset = range ? Number(range[2]) + 1 : end;
        } else {
          offset = end;
        }
        onProgress({
          loaded: offset,
          total: input.file.size,
          percentage: Math.min(
            100,
            Math.round((offset / input.file.size) * 100),
          ),
        });
      }

      if (!fileId) {
        throw new ApiClientError(500, {
          code: "INTERNAL_ERROR",
          message: "O Google Drive não retornou o ID do arquivo enviado.",
        });
      }

      return await completeUploadSession(
        session.session_id,
        fileId,
        input.file.size,
      );
    } catch (error) {
      await cancelUploadSession(session.session_id).catch(() => undefined);
      throw error;
    }
  })();

  return {
    promise,
    abort: () => {
      aborted = true;
      controller.abort();
    },
  };
}

/**
 * Legado: upload multipart em uma única requisição (limitado a ~4,5 MB na
 * Vercel). A UI usa `uploadVideoResumable`.
 */
export function uploadVideoWithProgress(
  form: FormData,
  onProgress: (progress: {
    loaded: number;
    total: number;
    percentage: number;
  }) => void,
): UploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = new Promise((resolve, reject) => {
    xhr.open("POST", "/api/videos/upload");
    xhr.responseType = "text";
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress({
        loaded: event.loaded,
        total: event.total,
        percentage: Math.round((event.loaded / event.total) * 100),
      });
    };
    xhr.onload = () => {
      let payload: any = null;
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        payload = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload?.data ?? payload);
        return;
      }
      reject(
        new ApiClientError(
          xhr.status,
          payload?.error ?? {
            code: "INTERNAL_ERROR",
            message: "Não foi possível enviar o vídeo",
          },
        ),
      );
    };
    xhr.onerror = () =>
      reject(
        new ApiClientError(0, {
          code: "INTERNAL_ERROR",
          message: "Erro de conexão durante o upload",
        }),
      );
    xhr.onabort = () =>
      reject(
        new ApiClientError(0, {
          code: "INTERNAL_ERROR",
          message: "Upload cancelado",
        }),
      );
    xhr.send(form);
  });

  return { promise, abort: () => xhr.abort() };
}
