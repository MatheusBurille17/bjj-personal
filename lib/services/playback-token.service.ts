import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  GoogleDriveProvider,
  PlaybackUrlResult,
  VideoPlaybackTokenPayload,
} from "@/types/google-drive";

const DEFAULT_EXPIRES_IN = 3600;

function base64Url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(
    normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="),
    "base64",
  );
}

function getSecret(): string {
  return (
    process.env.PLAYBACK_TOKEN_SECRET ||
    process.env.AUTH_SECRET ||
    "dev-only-playback-secret-change-me-in-production-1234567890"
  );
}

function signature(body: string): Buffer {
  return createHmac("sha256", getSecret()).update(body).digest();
}

export interface CreatePlaybackTokenInput {
  videoId: string;
  userId: string;
  provider: GoogleDriveProvider;
  driveFileId: string;
  expiresIn?: number;
  now?: number;
}

export interface PlaybackTokenResult {
  token: string;
  payload: VideoPlaybackTokenPayload;
  expiresAt: string;
  expiresIn: number;
}

/** Cria um token HMAC de reprodução com expiração (padrão: 1 hora). */
export function createPlaybackToken(
  input: CreatePlaybackTokenInput,
): PlaybackTokenResult {
  const expiresIn = input.expiresIn ?? DEFAULT_EXPIRES_IN;
  const now = Math.floor((input.now ?? Date.now()) / 1000);
  const payload: VideoPlaybackTokenPayload = {
    videoId: input.videoId,
    userId: input.userId,
    provider: input.provider,
    driveFileId: input.driveFileId,
    iat: now,
    exp: now + expiresIn,
  };
  const header = base64Url(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  );
  const body = base64Url(JSON.stringify(payload));
  const token = `${header}.${body}.${base64Url(signature(`${header}.${body}`))}`;
  return {
    token,
    payload,
    expiresAt: new Date((now + expiresIn) * 1000).toISOString(),
    expiresIn,
  };
}

/** Valida assinatura e expiração do token; retorna null se inválido. */
export function verifyPlaybackToken(
  token: string,
  now = Date.now(),
): VideoPlaybackTokenPayload | null {
  const [header, body, received] = token.split(".");
  if (!header || !body || !received) return null;

  try {
    const expected = signature(`${header}.${body}`);
    const actual = fromBase64Url(received);
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      return null;
    }
    const payload = JSON.parse(
      fromBase64Url(body).toString("utf8"),
    ) as VideoPlaybackTokenPayload;
    if (
      !payload?.videoId ||
      !payload?.userId ||
      !payload?.provider ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    if (payload.exp * 1000 <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildDrivePreviewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
}

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

/**
 * Gera a URL de reprodução sob demanda. Para Google Drive, a URL aponta para
 * um endpoint próprio que valida o token e redireciona para o preview do Drive;
 * assim a expiração é realmente aplicada pelo servidor.
 */
export function buildPlaybackUrl(input: {
  videoId: string;
  userId: string;
  provider: GoogleDriveProvider;
  driveFileId: string;
  expiresIn?: number;
  now?: number;
}): PlaybackUrlResult {
  const created = createPlaybackToken(input);
  const path =
    input.provider === "google_drive"
      ? `/api/google-drive/embed/${created.token}`
      : `/api/videos/${input.videoId}/embed?token=${created.token}`;

  return {
    playback_url: `${appBaseUrl()}${path}`,
    expires_at: created.expiresAt,
    expires_in: created.expiresIn,
    provider: input.provider,
    video_id: input.videoId,
  };
}

/** Reconstrói o destino final a partir de um token válido. */
export function resolvePlaybackTarget(
  payload: VideoPlaybackTokenPayload,
): string {
  if (payload.provider === "google_drive") {
    return buildDrivePreviewUrl(payload.driveFileId);
  }
  return buildDrivePreviewUrl(payload.driveFileId);
}
