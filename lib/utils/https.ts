import { ApiError } from "@/lib/middleware/errors";
import { getRequestProtocol } from "./url";

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Em produção, todo endpoint OAuth exige HTTPS. Proxies (Vercel/Cloudflare)
 * informam o protocolo original em `x-forwarded-proto`.
 */
export function enforceHttpsInProduction(request: Request): void {
  if (!isProductionRuntime()) return;
  if (getRequestProtocol(request) !== "https") {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Conexão insegura. Use HTTPS para concluir a autenticação.",
      { error: "https_required" },
    );
  }
}

/** Garante que a redirect_uri configurada usa HTTPS em produção. */
export function assertHttpsUrlInProduction(url: string): void {
  if (!isProductionRuntime()) return;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ApiError(500, "INTERNAL_ERROR", "redirect_uri inválida");
  }
  if (parsed.protocol !== "https:") {
    throw new ApiError(
      500,
      "INTERNAL_ERROR",
      "A redirect_uri do Google deve usar HTTPS em produção.",
      { error: "https_required" },
    );
  }
}
