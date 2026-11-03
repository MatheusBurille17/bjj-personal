import { createSign } from "node:crypto";

function base64Url(value: Buffer | string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Assina um token JWT RS256 para reprodução segura na Mux.
 * Retorna `null` quando a chave de assinatura não está configurada.
 */
export function signMuxPlaybackToken(playbackId: string, expiresInSeconds = 86_400): string | null {
  const signingKeyId = process.env.MUX_SIGNING_KEY_ID;
  const signingKey = process.env.MUX_SIGNING_PRIVATE_KEY;
  if (!signingKeyId || !signingKey) return null;

  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: signingKeyId }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64Url(
    JSON.stringify({
      sub: playbackId,
      aud: "v",
      exp: now + expiresInSeconds,
      iat: now,
    }),
  );
  const unsigned = `${header}.${payload}`;

  try {
    const signer = createSign("RSA-SHA256");
    signer.update(unsigned);
    const signature = signer.sign(signingKey.replace(/\\n/g, "\n"));
    return `${unsigned}.${base64Url(signature)}`;
  } catch {
    return null;
  }
}

export function buildSignedPlaybackUrl(playbackId: string): string | null {
  const token = signMuxPlaybackToken(playbackId);
  if (!token) return null;
  return `https://stream.mux.com/${playbackId}.m3u8?token=${token}`;
}
