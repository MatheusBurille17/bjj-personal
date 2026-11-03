import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

/**
 * Gera o hash de uma senha usando scrypt com salt aleatório.
 * Formato armazenado: `scrypt:<salt-hex>:<hash-hex>`.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

/** Verifica uma senha contra o hash armazenado em tempo constante. */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [algorithm, salt, hash] = storedHash.split(":");
    if (algorithm !== "scrypt" || !salt || !hash) return false;
    const derived = scryptSync(password, salt, KEY_LENGTH);
    const expected = Buffer.from(hash, "hex");
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
