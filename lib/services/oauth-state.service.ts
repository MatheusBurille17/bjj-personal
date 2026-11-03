import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import type {
  OAuthState,
  OAuthStateValidation,
} from "@/types/google-oauth";
import { sanitizeRedirectPath } from "@/lib/utils/url";

export const OAUTH_STATE_COOKIE = "bjj_oauth_state";
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const OAUTH_STATE_TTL_SECONDS = OAUTH_STATE_TTL_MS / 1000;

function toBase64Url(value: Buffer): string {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

/** 32 bytes aleatórios em Base64URL (43 caracteres). */
export function generateStateParameter(): string {
  return toBase64Url(randomBytes(32));
}

/** PKCE code_verifier: 32 bytes aleatórios em Base64URL (43 caracteres). */
export function generateCodeVerifier(): string {
  return toBase64Url(randomBytes(32));
}

/**
 * PKCE S256: BASE64URL(SHA256(ASCII(code_verifier))), conforme RFC 7636.
 */
export async function createCodeChallenge(verifier: string): Promise<string> {
  if (!verifier || !/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) {
    throw new Error("code_verifier inválido");
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return toBase64Url(Buffer.from(new Uint8Array(digest)));
}

export function createOAuthState(options?: {
  redirectPath?: string;
  connectMode?: boolean;
  purpose?: "social" | "drive";
  state?: string;
  codeVerifier?: string;
  now?: number;
}): OAuthState {
  return {
    state: options?.state ?? generateStateParameter(),
    codeVerifier: options?.codeVerifier ?? generateCodeVerifier(),
    redirectPath: sanitizeRedirectPath(options?.redirectPath),
    connectMode: options?.connectMode === true,
    purpose: options?.purpose ?? "social",
    created_at: options?.now ?? Date.now(),
  };
}

function serialize(state: OAuthState): string {
  return toBase64Url(Buffer.from(JSON.stringify(state), "utf8"));
}

function deserialize(value: string): OAuthState | null {
  try {
    const parsed = JSON.parse(fromBase64Url(value).toString("utf8")) as OAuthState;
    if (
      !parsed ||
      typeof parsed.state !== "string" ||
      typeof parsed.codeVerifier !== "string" ||
      typeof parsed.created_at !== "number"
    ) {
      return null;
    }
    return {
      state: parsed.state,
      codeVerifier: parsed.codeVerifier,
      redirectPath: sanitizeRedirectPath(parsed.redirectPath),
      connectMode: parsed.connectMode === true,
      purpose: parsed.purpose === "drive" ? "drive" : "social",
      created_at: parsed.created_at,
    };
  } catch {
    return null;
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    // SameSite=Lax é necessário para que o cookie seja enviado no redirect
    // top-level de volta do Google. Strict bloquearia o callback OAuth.
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OAUTH_STATE_TTL_SECONDS,
  };
}

/** Persiste state + code_verifier no cookie de sessão do OAuth. */
export async function storeOAuthState(state: OAuthState): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, serialize(state), cookieOptions());
}

export async function readOAuthState(): Promise<OAuthState | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  if (!raw) return null;
  return deserialize(raw);
}

export async function clearOAuthState(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, "", {
    ...cookieOptions(),
    maxAge: 0,
  });
}

/** Validação pura, útil para testes de propriedade. */
export function validateOAuthStateRecord(
  stored: OAuthState | null,
  received: string | null | undefined,
  now = Date.now(),
): OAuthStateValidation {
  if (!stored) return { valid: false, reason: "state_not_found" };
  if (!received || received !== stored.state) {
    return { valid: false, reason: "state_mismatch" };
  }
  if (now - stored.created_at > OAUTH_STATE_TTL_MS) {
    return { valid: false, reason: "state_expired" };
  }
  return { valid: true, state: stored };
}

/**
 * Lê o state do cookie, valida contra o parâmetro recebido e sempre limpa o
 * cookie (uso único), mesmo em caso de falha.
 */
export async function consumeOAuthState(
  received: string | null | undefined,
  now = Date.now(),
): Promise<OAuthStateValidation> {
  const stored = await readOAuthState();
  const result = validateOAuthStateRecord(stored, received, now);
  await clearOAuthState();
  return result;
}

/** SHA-256 do código de autorização — nunca armazenamos o código em claro. */
export function hashAuthorizationCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}
