import type { ApiErrorDetail } from "@/types/api";

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, error: ApiErrorDetail) {
    super(error.message);
    this.name = "ApiClientError";
    this.code = error.code;
    this.status = status;
    this.details = error.details;
  }
}

export function fieldErrorsFrom(error: unknown): Record<string, string> {
  if (!(error instanceof ApiClientError)) return {};
  const details = error.details as { fields?: Record<string, string> } | undefined;
  return details?.fields ?? {};
}

function extractError(payload: unknown, status: number): ApiClientError {
  const parsed = payload as { error?: ApiErrorDetail } | null;
  const detail =
    parsed?.error ??
    ({
      code: status === 401 ? "UNAUTHORIZED" : "INTERNAL_ERROR",
      message:
        status === 401
          ? "Sua sessão expirou. Entre novamente."
          : "Ocorreu um erro inesperado. Tente novamente.",
    } as ApiErrorDetail);
  return new ApiClientError(status, detail);
}

/** Cliente HTTP tipado para as rotas internas. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiClientError(0, {
      code: "INTERNAL_ERROR",
      message: "Não foi possível conectar ao servidor. Verifique sua conexão.",
    });
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) throw extractError(payload, response.status);
  return (payload as { data: T }).data;
}

export function jsonBody(data: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}
