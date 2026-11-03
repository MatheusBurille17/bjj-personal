import {
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
  randomBytes,
} from "node:crypto";

/**
 * Criptografia de tokens Google com AES-256-GCM.
 *
 * - Chave derivada da variável de ambiente com PBKDF2-SHA256.
 * - IV aleatório de 12 bytes por operação.
 * - Auth tag (16 bytes) concatenada ao ciphertext antes do Base64.
 * - Nenhum token em texto claro é persistido ou retornado por esta camada.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const PBKDF2_ITERATIONS = 120_000;
const PBKDF2_DIGEST = "sha256";
const DEV_FALLBACK_SECRET =
  "dev-only-google-token-key-change-me-in-production-please-1234567890";

const keyCache = new Map<string, Buffer>();

function getSecret(): string {
  return (
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ||
    process.env.AUTH_SECRET ||
    DEV_FALLBACK_SECRET
  );
}

function getSalt(): string {
  return process.env.GOOGLE_TOKEN_ENCRYPTION_SALT || "bjj-google-oauth-salt-v1";
}

function deriveKey(): Buffer {
  const secret = getSecret();
  if (secret.length < 32) {
    throw new Error(
      "GOOGLE_TOKEN_ENCRYPTION_KEY deve ter pelo menos 32 caracteres",
    );
  }
  const cacheKey = `${secret}\u0000${getSalt()}\u0000${PBKDF2_ITERATIONS}`;
  const cached = keyCache.get(cacheKey);
  if (cached) return cached;

  const derived = pbkdf2Sync(
    secret,
    getSalt(),
    PBKDF2_ITERATIONS,
    KEY_BYTES,
    PBKDF2_DIGEST,
  );
  keyCache.set(cacheKey, derived);
  return derived;
}

export interface EncryptedToken {
  /** Base64(ciphertext || auth tag). */
  encrypted: string;
  /** IV aleatório de 12 bytes em Base64. */
  iv: string;
}

/** Criptografa um token arbitrário. */
export async function encrypt(token: string): Promise<EncryptedToken> {
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("Token vazio não pode ser criptografado");
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    encrypted: Buffer.concat([ciphertext, authTag]).toString("base64"),
    iv: iv.toString("base64"),
  };
}

/** Descriptografa um token previamente criptografado. */
export async function decrypt(encrypted: string, iv: string): Promise<string> {
  if (!encrypted || !iv) {
    throw new Error("Token criptografado ou IV ausente");
  }

  const payload = Buffer.from(encrypted, "base64");
  const ivBuffer = Buffer.from(iv, "base64");
  if (ivBuffer.length !== IV_BYTES) {
    throw new Error("IV inválido");
  }
  if (payload.length <= AUTH_TAG_BYTES) {
    throw new Error("Payload criptografado inválido");
  }

  const ciphertext = payload.subarray(0, payload.length - AUTH_TAG_BYTES);
  const authTag = payload.subarray(payload.length - AUTH_TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, deriveKey(), ivBuffer);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8",
  );
}

/** Limpa o cache de chaves (uso em testes e rotação de chave). */
export function resetTokenEncryptionCache(): void {
  keyCache.clear();
}
