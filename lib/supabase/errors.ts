import type { PostgrestError } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api-error";

/** Converte erros do PostgREST/SQL em `ApiError` com status HTTP adequado. */
export function mapPostgrestError(error: PostgrestError): ApiError {
  switch (error.code) {
    case "23505":
      return ApiError.conflict("Já existe um registro com estes dados");
    case "23503":
      return ApiError.conflict("Este registro está vinculado a outros dados e não pode ser alterado");
    case "23514":
      return ApiError.validation("Os dados violam uma regra de validação");
    case "42501":
      return ApiError.forbidden("Sem permissão para acessar este registro");
    case "PGRST116":
      return ApiError.notFound();
    default:
      console.error("[supabase] erro inesperado", error);
      return new ApiError(500, "INTERNAL_ERROR", "Erro ao acessar o banco de dados");
  }
}

type QueryLike = { data: unknown; error: PostgrestError | null };

/** Desembrulha o resultado de uma query, lançando `ApiError` em caso de erro. */
export function unwrap<Result extends QueryLike>(
  result: Result,
): NonNullable<Result["data"]> {
  if (result.error) throw mapPostgrestError(result.error);
  if (result.data === null || result.data === undefined) throw ApiError.notFound();
  return result.data as NonNullable<Result["data"]>;
}

/** Como `unwrap`, mas aceita `null` (uso com `.maybeSingle()`). */
export function unwrapMaybe<Result extends QueryLike>(
  result: Result,
): Result["data"] {
  if (result.error) throw mapPostgrestError(result.error);
  return result.data;
}

/** Para comandos que não retornam linhas (insert/update/delete sem select). */
export function unwrapVoid(result: { error: PostgrestError | null }): void {
  if (result.error) throw mapPostgrestError(result.error);
}
