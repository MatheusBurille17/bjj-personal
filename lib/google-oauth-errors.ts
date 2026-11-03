import { ApiError } from "@/lib/middleware/errors";
import type { ErrorCode } from "@/types/api";
import type { GoogleOAuthErrorCode } from "@/types/google-oauth";

const ERROR_MAPPING: Record<
  GoogleOAuthErrorCode,
  { status: number; apiCode: ErrorCode; message: string }
> = {
  access_denied: {
    status: 400,
    apiCode: "VALIDATION_ERROR",
    message:
      "Você recusou a autorização do Google. Tente novamente se quiser continuar com o Google.",
  },
  authorization_pending: {
    status: 400,
    apiCode: "VALIDATION_ERROR",
    message: "A autorização do Google ainda está pendente. Tente novamente.",
  },
  configuration_error: {
    status: 503,
    apiCode: "SERVICE_UNAVAILABLE",
    message:
      "O login com Google não está configurado neste ambiente. Use e-mail e senha ou contate o suporte.",
  },
  invalid_client: {
    status: 503,
    apiCode: "SERVICE_UNAVAILABLE",
    message: "A configuração do cliente Google é inválida. Contate o suporte.",
  },
  invalid_code: {
    status: 400,
    apiCode: "VALIDATION_ERROR",
    message: "O código de autorização do Google é inválido ou expirou. Comece novamente.",
  },
  invalid_grant: {
    status: 401,
    apiCode: "UNAUTHORIZED",
    message:
      "Sua conexão com o Google expirou ou foi revogada. Reconecte sua conta Google.",
  },
  invalid_request: {
    status: 400,
    apiCode: "VALIDATION_ERROR",
    message: "A solicitação de autenticação Google é inválida. Comece novamente.",
  },
  invalid_scope: {
    status: 400,
    apiCode: "VALIDATION_ERROR",
    message: "Uma permissão solicitada ao Google é inválida. Contate o suporte.",
  },
  invalid_token: {
    status: 401,
    apiCode: "UNAUTHORIZED",
    message: "O token do Google é inválido ou expirou. Reconecte sua conta Google.",
  },
  network_error: {
    status: 503,
    apiCode: "SERVICE_UNAVAILABLE",
    message: "Não foi possível conectar ao Google. Verifique sua conexão e tente novamente.",
  },
  revocation_failed: {
    status: 503,
    apiCode: "SERVICE_UNAVAILABLE",
    message: "Não foi possível revogar a autorização no Google. Tente novamente.",
  },
  server_error: {
    status: 503,
    apiCode: "SERVICE_UNAVAILABLE",
    message: "O Google está temporariamente indisponível. Tente novamente mais tarde.",
  },
};

export class GoogleOAuthError extends Error {
  readonly code: GoogleOAuthErrorCode;
  readonly status: number;
  readonly httpStatus?: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: GoogleOAuthErrorCode,
    message?: string,
    options?: { httpStatus?: number; details?: Record<string, unknown> },
  ) {
    const mapping = ERROR_MAPPING[code];
    super(message ?? mapping.message);
    this.name = "GoogleOAuthError";
    this.code = code;
    this.status = mapping.status;
    this.httpStatus = options?.httpStatus;
    this.details = options?.details;
  }
}

export function isGoogleOAuthError(error: unknown): error is GoogleOAuthError {
  return error instanceof GoogleOAuthError;
}

/** Converte erros do cliente Google no formato padrão da API. */
export function toApiError(error: unknown): unknown {
  if (!(error instanceof GoogleOAuthError)) return error;
  const mapping = ERROR_MAPPING[error.code];
  return new ApiError(mapping.status, mapping.apiCode, mapping.message, {
    google_error: error.code,
    ...(error.httpStatus ? { google_http_status: error.httpStatus } : {}),
    ...(error.details ?? {}),
  });
}
