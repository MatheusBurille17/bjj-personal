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
  /** Backend usado (útil em logs/testes). */
  backend?: "memory" | "upstash";
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

function checkMemory(
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): RateLimitResult {
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
      backend: "memory",
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
    backend: "memory",
  };
}

async function upstashPipeline(
  url: string,
  token: string,
  commands: string[][],
): Promise<Array<{ result?: unknown; error?: string }>> {
  const response = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(2_000),
  });
  if (!response.ok) {
    throw new Error(`Upstash respondeu ${response.status}`);
  }
  return (await response.json()) as Array<{ result?: unknown; error?: string }>;
}

async function checkUpstash(
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): Promise<RateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return checkMemory(key, limit, windowMs, now);
  }

  const results = await upstashPipeline(url, token, [
    ["INCR", key],
    ["PEXPIRE", key, String(windowMs), "NX"],
  ]);
  const failed = results.find((item) => item.error);
  if (failed) throw new Error(failed.error);

  const count = Number(results[0]?.result ?? 0);
  if (!Number.isFinite(count) || count <= 0) {
    throw new Error("Upstash retornou contador inválido");
  }

  const allowed = count <= limit;
  // O TTL exato não é retornado pelo pipeline; usamos a janela configurada.
  const resetAt = now + windowMs;
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt,
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil(windowMs / 1000)),
    backend: "upstash",
  };
}

/**
 * Rate limit por chave (normalmente IP + rota).
 *
 * Usa Upstash Redis quando `UPSTASH_REDIS_REST_URL` e
 * `UPSTASH_REDIS_REST_TOKEN` estão definidos; caso contrário, mantém o
 * fallback em memória por instância.
 */
export async function checkRateLimit(
  key: string,
  options: RateLimitOptions = {},
): Promise<RateLimitResult> {
  const config = getRateLimitConfig();
  const limit = options.limit ?? config.limit;
  const windowMs = options.windowMs ?? config.windowMs;
  const now = options.now ?? Date.now();

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      return await checkUpstash(key, limit, windowMs, now);
    } catch (error) {
      console.warn("[rate-limit] Upstash indisponível; usando memória", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return checkMemory(key, limit, windowMs, now);
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
