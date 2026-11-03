import { ApiError } from "@/lib/middleware/errors";
import type { ErrorCode } from "@/types/api";
import type { GoogleDriveErrorCode } from "@/types/google-drive";

const ERROR_MAP: Record<
  GoogleDriveErrorCode,
  { status: number; apiCode: ErrorCode; userMessage: string }
> = {
  token_expired: {
    status: 401,
    apiCode: "UNAUTHORIZED",
    userMessage: "Sua conexão com o Google Drive expirou. Reconecte sua conta.",
  },
  permission_denied: {
    status: 403,
    apiCode: "FORBIDDEN",
    userMessage: "Você não tem permissão para acessar este vídeo.",
  },
  not_found: {
    status: 404,
    apiCode: "NOT_FOUND",
    userMessage: "Arquivo ou pasta não encontrado no Google Drive.",
  },
  quota_exceeded: {
    status: 413,
    apiCode: "FILE_TOO_LARGE",
    userMessage: "Espaço insuficiente no Google Drive.",
  },
  rate_limited: {
    status: 429,
    apiCode: "RATE_LIMITED",
    userMessage: "O Google Drive está ocupado. Tente novamente em alguns minutos.",
  },
  timeout: {
    status: 504,
    apiCode: "SERVICE_UNAVAILABLE",
    userMessage: "Conexão lenta com o Google Drive. Tente novamente.",
  },
  invalid_file: {
    status: 400,
    apiCode: "VALIDATION_ERROR",
    userMessage: "Arquivo de vídeo inválido.",
  },
  file_too_large: {
    status: 413,
    apiCode: "FILE_TOO_LARGE",
    userMessage: "O arquivo excede o limite de 5GB.",
  },
  configuration_error: {
    status: 503,
    apiCode: "SERVICE_UNAVAILABLE",
    userMessage:
      "O Google Drive não está configurado neste ambiente. Contate o suporte.",
  },
  network_error: {
    status: 503,
    apiCode: "SERVICE_UNAVAILABLE",
    userMessage: "Não foi possível conectar ao Google Drive. Tente novamente.",
  },
  circuit_open: {
    status: 503,
    apiCode: "SERVICE_UNAVAILABLE",
    userMessage:
      "O Google Drive está temporariamente pausado por excesso de erros. Tente novamente em alguns minutos.",
  },
  server_error: {
    status: 503,
    apiCode: "SERVICE_UNAVAILABLE",
    userMessage: "O Google Drive está temporariamente indisponível.",
  },
};

export class GoogleDriveError extends Error {
  readonly code: GoogleDriveErrorCode;
  readonly statusCode: number;
  readonly userMessage: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: GoogleDriveErrorCode,
    options?: {
      message?: string;
      statusCode?: number;
      details?: Record<string, unknown>;
    },
  ) {
    const mapping = ERROR_MAP[code];
    super(options?.message ?? mapping.userMessage);
    this.name = "GoogleDriveError";
    this.code = code;
    this.statusCode = options?.statusCode ?? mapping.status;
    this.userMessage = mapping.userMessage;
    this.details = options?.details;
  }
}

export function isGoogleDriveError(error: unknown): error is GoogleDriveError {
  return error instanceof GoogleDriveError;
}

/** Converte erros do Drive no formato padrão da API, sem expor detalhes técnicos. */
export function toApiError(error: unknown): unknown {
  if (!(error instanceof GoogleDriveError)) return error;
  const mapping = ERROR_MAP[error.code];
  return new ApiError(mapping.status, mapping.apiCode, mapping.userMessage, {
    drive_error: error.code,
    ...(error.details ?? {}),
  });
}

/** Loga detalhes técnicos no servidor e retorna mensagem amigável ao usuário. */
export function logGoogleDriveError(error: unknown, operation: string): void {
  if (error instanceof GoogleDriveError) {
    console.error("[google-drive]", {
      operation,
      code: error.code,
      status: error.statusCode,
      details: error.details,
    });
    return;
  }
  console.error("[google-drive]", {
    operation,
    error: error instanceof Error ? error.message : String(error),
  });
}
