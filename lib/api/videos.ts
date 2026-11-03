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

/** Cria a sessão resumable no Drive (o arquivo não passa pela Vercel). */
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
 * Envia o arquivo diretamente para a URL resumable do Google (CORS), em chunks
 * de 8 MiB com `Content-Range`. O corpo não passa pelas Functions da Vercel,
 * então não há limite de 4,5 MB.
 */
export function uploadFileToDrive(
  uploadUrl: string,
  file: File,
  onProgress: (progress: {
    loaded: number;
    total: number;
    percentage: number;
  }) => void,
  mimeTypeOverride?: string,
): UploadHandle {
  const CHUNK_SIZE = 8 * 1024 * 1024;
  const controller = new AbortController();
  const mimeType = mimeTypeOverride || file.type || "application/octet-stream";

  const promise = (async () => {
    let offset = 0;
    let fileId: string | null = null;

    while (offset < file.size) {
      const end = Math.min(offset + CHUNK_SIZE, file.size);
      const chunk = file.slice(offset, end);
      const isLast = end >= file.size;

      let response: Response;
      try {
        response = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": mimeType,
            "Content-Range": `bytes ${offset}-${end - 1}/${file.size}`,
          },
          body: chunk,
          signal: controller.signal,
        });
      } catch {
        if (controller.signal.aborted) {
          throw new ApiClientError(0, {
            code: "INTERNAL_ERROR",
            message: "Upload cancelado",
          });
        }
        throw new ApiClientError(0, {
          code: "INTERNAL_ERROR",
          message:
            "Falha de rede ao enviar para o Google Drive. Verifique sua conexão.",
        });
      }

      // 308 Resume Incomplete: o Google recebeu o chunk e espera o próximo.
      if (response.status !== 308 && !response.ok) {
        let message = "Não foi possível enviar o arquivo para o Google Drive.";
        try {
          const payload = (await response.json()) as {
            error?: { message?: string };
          };
          if (payload?.error?.message) message = payload.error.message;
        } catch {
          // resposta sem JSON
        }
        throw new ApiClientError(response.status, {
          code: response.status === 401 ? "UNAUTHORIZED" : "INTERNAL_ERROR",
          message,
        });
      }

      if (isLast && response.status !== 308) {
        const payload = (await response.json().catch(() => null)) as
          | { id?: string }
          | null;
        fileId = typeof payload?.id === "string" ? payload.id : null;
      }

      // O Google pode confirmar menos bytes do que enviamos; usa o Range.
      if (response.status === 308) {
        const range = response.headers.get("Range");
        const match = range ? /bytes=(\d+)-(\d+)/.exec(range) : null;
        offset = match ? Number(match[2]) + 1 : end;
      } else {
        offset = end;
      }
      onProgress({
        loaded: offset,
        total: file.size,
        percentage: Math.min(100, Math.round((offset / file.size) * 100)),
      });
    }

    if (!fileId) {
      throw new ApiClientError(500, {
        code: "INTERNAL_ERROR",
        message: "O Google Drive não retornou o ID do arquivo enviado.",
      });
    }
    return { fileId };
  })();

  return {
    promise,
    abort: () => controller.abort(),
  };
}

/**
 * Fluxo completo: cria a sessão no servidor, envia o arquivo direto ao Drive e
 * finaliza criando o registro do vídeo no Supabase.
 */
export function uploadVideoResumable(
  input: CreateUploadSessionInput,
  onProgress: (progress: {
    loaded: number;
    total: number;
    percentage: number;
  }) => void,
): UploadHandle {
  let abortDrive: (() => void) | null = null;
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

    const driveHandle = uploadFileToDrive(
      session.upload_url,
      input.file,
      onProgress,
      session.mime_type,
    );
    abortDrive = driveHandle.abort;

    try {
      const { fileId } = (await driveHandle.promise) as { fileId: string };
      return await completeUploadSession(session.session_id, fileId, input.file.size);
    } catch (error) {
      await cancelUploadSession(session.session_id).catch(() => undefined);
      throw error;
    }
  })();

  return {
    promise,
    abort: () => {
      aborted = true;
      abortDrive?.();
    },
  };
}

/**
 * Upload multipart com progresso real via XMLHttpRequest (fetch não expõe
 * progresso de upload em todos os navegadores).
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
