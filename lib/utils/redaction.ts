/**
 * Utilitários para evitar vazamento de segredos em logs, erros e respostas.
 *
 * Regra da feature: tokens, códigos de autorização, segredos de cliente e
 * chaves de criptografia NUNCA aparecem em texto claro fora do processo que
 * os utiliza.
 */

export const TOKEN_REDACTED = "[TOKEN REDACTED]";

const SENSITIVE_KEY_PATTERN =
  /(access_token|refresh_token|id_token|encrypted_.*token|token_iv|authorization|client_secret|code_verifier|^code$|password|encryption_key)/i;

export function redactToken(token: string | null | undefined): string {
  return token ? TOKEN_REDACTED : "";
}

/** Redige recursivamente valores cujas chaves indicam segredo. */
export function redactSensitive<T>(value: T): T {
  return redactValue(value) as T;
}

function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return TOKEN_REDACTED;
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? TOKEN_REDACTED
        : redactValue(item, depth + 1);
    }
    return result;
  }

  return value;
}

/** Indica se uma string contém um token com aparência de segredo. */
export function looksLikeSecret(value: string): boolean {
  return (
    /^(ya29\.|1\/\/|oauth2\/|AIza)[\w.-]{10,}/.test(value) ||
    /^[A-Za-z0-9_-]{80,}$/.test(value)
  );
}

/** Mensagem de erro segura: nunca inclui o valor original do token. */
export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/[A-Za-z0-9_-]{80,}/g, TOKEN_REDACTED);
  }
  return "Erro desconhecido";
}
