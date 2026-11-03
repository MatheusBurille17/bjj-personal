/**
 * Tipos da API e contratos de resposta.
 *
 * Todas as rotas de API retornam o formato `{ data, error, meta }`.
 */

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "GONE"
  | "RATE_LIMITED"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface ApiErrorDetail {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiErrorDetail | null;
  meta?: {
    timestamp?: string;
    request_id?: string;
    [key: string]: unknown;
  };
}

export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface ValidationErrorDetails {
  fields: Record<string, string>;
}

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "Dados inválidos",
  UNAUTHORIZED: "Autenticação necessária",
  FORBIDDEN: "Você não tem permissão para acessar este recurso",
  NOT_FOUND: "Recurso não encontrado",
  CONFLICT: "A operação entra em conflito com o estado atual do recurso",
  GONE: "O recurso não está mais disponível",
  RATE_LIMITED: "Muitas tentativas. Aguarde e tente novamente.",
  FILE_TOO_LARGE: "O arquivo excede o tamanho máximo permitido",
  UNSUPPORTED_MEDIA_TYPE: "Formato de arquivo não suportado",
  SERVICE_UNAVAILABLE: "Serviço temporariamente indisponível",
  INTERNAL_ERROR: "Ocorreu um erro inesperado. Tente novamente mais tarde.",
};
