import { NextResponse } from "next/server";
import { jsonError } from "@/lib/middleware/errors";

export interface RateLimitOptions {
  limit?: number;
  windowMs?: number;
  now?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Epoch em milissegundos em que a janela reinicia. */
  resetAt: number;
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export function getRateLimitConfig(): { limit: number; windowMs: number } {
  const parsedLimit = Number(process.env.OAUTH_RATE_LIMIT_MAX);
  const parsedWindow = Number(process.env.OAUTH_RATE_LIMIT_WINDOW_MS);
  return {
    limit:
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 10,
    windowMs:
      Number.isFinite(parsedWindow) && parsedWindow > 0
        ? Math.floor(parsedWindow)
        : 60_000,
  };
}

function pruneIfNeeded(now: number): void {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Rate limit em memória (janela fixa) por chave — normalmente IP + rota.
 * Em produção serverless, substitua por Redis/Upstash para compartilhar estado
 * entre instâncias; a interface pública permanece a mesma.
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions = {},
): RateLimitResult {
  const config = getRateLimitConfig();
  const limit = options.limit ?? config.limit;
  const windowMs = options.windowMs ?? config.windowMs;
  const now = options.now ?? Date.now();

  pruneIfNeeded(now);
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - 1),
      resetAt,
      retryAfterSeconds: 0,
    };
  }

  existing.count += 1;
  const allowed = existing.count <= limit;
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
    retryAfterSeconds: allowed
      ? 0
      : Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

export function resetRateLimitStore(): void {
  buckets.clear();
}

/** IP do cliente considerando proxies usuais (Vercel/Cloudflare). */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  for (const header of ["x-real-ip", "cf-connecting-ip", "x-vercel-forwarded-for"]) {
    const value = request.headers.get(header);
    if (value) return value.trim();
  }
  return "unknown";
}

export function applyRateLimitHeaders(
  response: NextResponse,
  result: RateLimitResult,
): NextResponse {
  response.headers.set("X-RateLimit-Limit", String(result.limit));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  response.headers.set(
    "X-RateLimit-Reset",
    String(Math.ceil(result.resetAt / 1000)),
  );
  if (!result.allowed) {
    response.headers.set("Retry-After", String(result.retryAfterSeconds));
  }
  return response;
}

/** Resposta 429 no formato padrão da API, com headers de rate limit. */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  const response = jsonError(
    429,
    "RATE_LIMITED",
    "Muitas tentativas de autenticação. Aguarde antes de tentar novamente.",
    {
      retry_after_seconds: result.retryAfterSeconds,
      reset_at: new Date(result.resetAt).toISOString(),
    },
  );
  return applyRateLimitHeaders(response, result);
}
