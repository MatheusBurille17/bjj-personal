import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { ApiResponse, ErrorCode, PaginationMeta } from "@/types/api";
import type { CurrentSession } from "@/lib/auth/session";
import { getCurrentSession } from "@/lib/auth/session";
import { ApiError } from "@/lib/api-error";

export { ApiError };

export function jsonSuccess<T>(data: T, meta?: Record<string, unknown>) {
  return NextResponse.json<ApiResponse<T>>(
    {
      data,
      error: null,
      ...(meta ? { meta: { timestamp: new Date().toISOString(), ...meta } } : {}),
    },
    { status: 200 },
  );
}

export function jsonCreated<T>(data: T, meta?: Record<string, unknown>) {
  return NextResponse.json<ApiResponse<T>>(
    {
      data,
      error: null,
      ...(meta ? { meta: { timestamp: new Date().toISOString(), ...meta } } : {}),
    },
    { status: 201 },
  );
}

export function jsonError(
  status: number,
  code: ErrorCode,
  message: string,
  details?: unknown,
) {
  return NextResponse.json<ApiResponse<never>>(
    {
      data: null,
      error: { code, message, ...(details !== undefined ? { details } : {}) },
      meta: { timestamp: new Date().toISOString() },
    },
    { status },
  );
}

function zodDetails(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export function handleApiError(error: unknown) {
  if (error instanceof ApiError) {
    return jsonError(error.status, error.code, error.message, error.details);
  }
  if (error instanceof ZodError) {
    return jsonError(400, "VALIDATION_ERROR", "Dados inválidos", {
      fields: zodDetails(error),
    });
  }
  if (error instanceof Error) {
    if (error.message === "UNAUTHORIZED") return jsonError(401, "UNAUTHORIZED", "Autenticação necessária");
    if (error.message === "FORBIDDEN") return jsonError(403, "FORBIDDEN", "Acesso negado");
    if (error.message === "NOT_FOUND") return jsonError(404, "NOT_FOUND", "Recurso não encontrado");
  }
  console.error("[api] erro inesperado", error);
  return jsonError(500, "INTERNAL_ERROR", "Ocorreu um erro inesperado. Tente novamente mais tarde.");
}

/** Envolve um handler de rota e converte erros para o formato padrão. */
export function route<P extends Record<string, string> = Record<string, string>>(
  handler: (request: Request, context: { params: Promise<P> }) => Promise<Response>,
) {
  return async (request: Request, context: { params: Promise<P> }) => {
    try {
      return await handler(request, context);
    } catch (error) {
      return handleApiError(error);
    }
  };
}

export async function requireApiTeacher(): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) throw ApiError.unauthorized();
  if (!session.roles.is_teacher || !session.teacher) throw ApiError.forbidden();
  return session;
}

export async function requireApiStudent(): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) throw ApiError.unauthorized();
  if (!session.roles.is_student) throw ApiError.forbidden();
  return session;
}

export async function requireApiUser(): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) throw ApiError.unauthorized();
  return session;
}

export function parseQueryInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Lê e valida o corpo JSON, convertendo erros de sintaxe em 400. */
export async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw ApiError.validation("Corpo da requisição inválido");
  }
}

export function buildPagination(total: number, page: number, pageSize: number): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    total,
    page,
    pageSize,
    totalPages: total === 0 ? 0 : totalPages,
    hasNext: page < totalPages && total > 0,
    hasPrevious: page > 1,
  };
}

export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(Math.max(1, pageSize), 100);
  return items.slice((safePage - 1) * safeSize, safePage * safeSize);
}

/** Resposta padrão de exclusão. */
export function jsonDeleted(message = "Registro removido") {
  return jsonSuccess({ success: true, message });
}
