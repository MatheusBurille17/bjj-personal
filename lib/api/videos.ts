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
