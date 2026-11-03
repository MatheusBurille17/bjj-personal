/** Utilitários de URL/redirecionamento usados pelo fluxo OAuth. */

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Aceita apenas caminhos internos absolutos ("/dashboard", "/portal/profile").
 * Rejeita URLs externas, protocol-relative ("//evil.com") e caracteres de
 * controle para evitar open redirect.
 */
export function sanitizeRedirectPath(
  value: string | null | undefined,
  fallback?: string,
): string | undefined {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return fallback;
  if (CONTROL_CHARS.test(trimmed)) return fallback;
  // Normaliza barras repetidas no início.
  if (trimmed.startsWith("///")) return fallback;
  return trimmed;
}

export function isSafeRedirectPath(value: string | null | undefined): boolean {
  return sanitizeRedirectPath(value) !== undefined;
}

export function getRequestProtocol(request: Request): "http" | "https" {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim().toLowerCase();
    if (first === "https" || first === "http") return first;
  }
  try {
    return new URL(request.url).protocol === "https:" ? "https" : "http";
  } catch {
    return "http";
  }
}
