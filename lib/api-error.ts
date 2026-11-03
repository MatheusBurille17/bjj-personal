import type { ErrorCode } from "@/types/api";

/**
 * Erro de domínio/API. Fica em um módulo sem dependências para evitar ciclos
 * de importação entre a camada HTTP e os clientes de banco.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static unauthorized(message = "Autenticação necessária") {
    return new ApiError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message = "Acesso negado") {
    return new ApiError(403, "FORBIDDEN", message);
  }

  static notFound(message = "Recurso não encontrado") {
    return new ApiError(404, "NOT_FOUND", message);
  }

  static conflict(message = "Operação em conflito com o estado atual") {
    return new ApiError(409, "CONFLICT", message);
  }

  static validation(message = "Dados inválidos", details?: unknown) {
    return new ApiError(400, "VALIDATION_ERROR", message, details);
  }
}
