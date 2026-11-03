import { randomUUID } from "node:crypto";
import type { GoogleOAuthCredential } from "@/types/google-oauth";
import type {
  DriveConnectionStatus,
  DriveOAuthTokenInput,
  DriveOAuthTokenRecord,
} from "@/types/google-drive";
import { getDb, mutate, nowIso } from "@/lib/db/store";
import { ApiError } from "@/lib/middleware/errors";
import {
  buildGoogleAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  revokeToken,
} from "@/lib/google-oauth-client";
import { GoogleOAuthError, toApiError } from "@/lib/google-oauth-errors";
import { encrypt, decrypt } from "./token-encryption.service";
import {
  getDriveAbout,
  getFileMetadata,
} from "./google-drive-client";

export const DRIVE_TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;

export const GOOGLE_DRIVE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/drive.file",
];

export interface DriveOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

export function getDriveOAuthConfig(): DriveOAuthConfig {
  const scopes = process.env.GOOGLE_DRIVE_SCOPES?.trim()
    ? process.env.GOOGLE_DRIVE_SCOPES.trim().split(/\s+/)
    : [...GOOGLE_DRIVE_SCOPES];

  return {
    clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirectUri:
      process.env.NEXT_PUBLIC_GOOGLE_DRIVE_REDIRECT_URI ??
      `${appBaseUrl()}/api/google-drive/oauth/callback`,
    scopes,
  };
}

export function isDriveOAuthConfigured(): boolean {
  const config = getDriveOAuthConfig();
  return Boolean(config.clientId && config.clientSecret);
}

export function requireDriveOAuthConfig(): DriveOAuthConfig {
  const config = getDriveOAuthConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new GoogleOAuthError(
      "configuration_error",
      "Google Drive não configurado. Defina NEXT_PUBLIC_GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.",
    );
  }
  return config;
}

/** URL de consentimento específica do Drive (scope drive.file). */
export function buildDriveAuthorizationUrl(input: {
  state: string;
  codeChallenge: string;
  loginHint?: string;
}): string {
  const config = requireDriveOAuthConfig();
  return buildGoogleAuthorizationUrl({
    state: input.state,
    codeChallenge: input.codeChallenge,
    redirectUri: config.redirectUri,
    clientId: config.clientId,
    scopes: config.scopes,
    loginHint: input.loginHint,
  });
}

export async function exchangeDriveCode(
  code: string,
  codeVerifier: string,
): Promise<GoogleOAuthCredential> {
  const config = requireDriveOAuthConfig();
  return exchangeCodeForTokens(code, codeVerifier, {
    redirectUri: config.redirectUri,
  });
}

function splitTokenIv(tokenIv: string): { access: string; refresh: string } {
  const [access = "", refresh = ""] = (tokenIv ?? "").split(":");
  return { access, refresh };
}

function expiryFromNow(expiresIn: number): string {
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "expires_in inválido");
  }
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

/** Armazena tokens criptografados e metadados da conta do Drive. */
export async function storeDriveTokens(
  userId: string,
  input: DriveOAuthTokenInput,
): Promise<DriveOAuthTokenRecord> {
  const access = await encrypt(input.accessToken);
  const refresh = input.refreshToken
    ? await encrypt(input.refreshToken)
    : { encrypted: "", iv: "" };
  const timestamp = nowIso();
  const expiresAt = expiryFromNow(input.expiresIn);

  return mutate((db) => {
    const existing = db.providers_oauth_tokens.find(
      (record) => record.user_id === userId,
    );
    let refreshCipher = refresh.encrypted;
    let refreshIv = refresh.iv;

    if (!refreshCipher && existing) {
      refreshCipher = existing.encrypted_refresh_token;
      refreshIv = splitTokenIv(existing.token_iv).refresh;
    }

    if (existing) {
      existing.encrypted_access_token = access.encrypted;
      existing.encrypted_refresh_token = refreshCipher;
      existing.token_iv = `${access.iv}:${refreshIv}`;
      existing.expires_at = expiresAt;
      existing.scope = input.scope;
      existing.drive_id = input.driveId;
      existing.google_email = input.googleEmail;
      existing.updated_at = timestamp;
      return existing;
    }

    const record: DriveOAuthTokenRecord = {
      id: randomUUID(),
      user_id: userId,
      provider: "google_drive",
      encrypted_access_token: access.encrypted,
      encrypted_refresh_token: refreshCipher,
      token_iv: `${access.iv}:${refreshIv}`,
      expires_at: expiresAt,
      scope: input.scope,
      drive_id: input.driveId,
      google_email: input.googleEmail,
      created_at: timestamp,
      updated_at: timestamp,
    };
    db.providers_oauth_tokens.push(record);
    return record;
  });
}

export function getDriveTokenRecord(
  userId: string,
): DriveOAuthTokenRecord | null {
  return (
    getDb().providers_oauth_tokens.find((record) => record.user_id === userId) ??
    null
  );
}

export function shouldRefreshDriveToken(expiresAt: string, now = Date.now()): boolean {
  const expiry = new Date(expiresAt).getTime();
  return !Number.isFinite(expiry) || expiry - now <= DRIVE_TOKEN_REFRESH_WINDOW_MS;
}

async function decryptDriveTokens(record: DriveOAuthTokenRecord): Promise<{
  accessToken: string;
  refreshToken?: string;
}> {
  const { access, refresh } = splitTokenIv(record.token_iv);
  if (!record.encrypted_access_token || !access) {
    throw new ApiError(401, "UNAUTHORIZED", "Conexão Google Drive ausente");
  }
  return {
    accessToken: await decrypt(record.encrypted_access_token, access),
    ...(record.encrypted_refresh_token && refresh
      ? { refreshToken: await decrypt(record.encrypted_refresh_token, refresh) }
      : {}),
  };
}

function clearDriveTokens(userId: string): void {
  mutate((db) => {
    db.providers_oauth_tokens = db.providers_oauth_tokens.filter(
      (record) => record.user_id !== userId,
    );
  });
}

/**
 * Retorna um access token válido, renovando automaticamente quando faltam
 * menos de 5 minutos para expirar (Propriedade 2).
 */
export async function getValidDriveAccessToken(userId: string): Promise<string> {
  const record = getDriveTokenRecord(userId);
  if (!record) {
    throw new ApiError(
      404,
      "NOT_FOUND",
      "Conecte sua conta do Google Drive para continuar.",
      { drive_error: "token_expired" },
    );
  }

  if (!shouldRefreshDriveToken(record.expires_at)) {
    return (await decryptDriveTokens(record)).accessToken;
  }

  let refreshToken: string | undefined;
  try {
    refreshToken = (await decryptDriveTokens(record)).refreshToken;
  } catch {
    clearDriveTokens(userId);
    throw new ApiError(
      401,
      "UNAUTHORIZED",
      "Sua conexão com o Google Drive expirou. Reconecte sua conta.",
      { drive_error: "token_expired" },
    );
  }

  if (!refreshToken) {
    clearDriveTokens(userId);
    throw new ApiError(
      401,
      "UNAUTHORIZED",
      "Sua conexão com o Google Drive expirou. Reconecte sua conta.",
      { drive_error: "token_expired" },
    );
  }

  try {
    const refreshed = await refreshAccessToken(refreshToken);
    const encrypted = await encrypt(refreshed.access_token);
    const { refresh: refreshIv } = splitTokenIv(record.token_iv);
    const expiresAt = expiryFromNow(refreshed.expires_in);
    mutate((db) => {
      const current = db.providers_oauth_tokens.find(
        (item) => item.user_id === userId,
      );
      if (!current) return;
      current.encrypted_access_token = encrypted.encrypted;
      current.token_iv = `${encrypted.iv}:${refreshIv}`;
      current.expires_at = expiresAt;
      current.updated_at = nowIso();
    });
    return refreshed.access_token;
  } catch (error) {
    if (
      error instanceof GoogleOAuthError &&
      (error.code === "invalid_grant" ||
        error.code === "invalid_token" ||
        error.httpStatus === 401)
    ) {
      clearDriveTokens(userId);
      throw new ApiError(
        401,
        "UNAUTHORIZED",
        "Sua conexão com o Google Drive expirou. Reconecte sua conta.",
        { drive_error: "token_expired" },
      );
    }
    throw toApiError(error);
  }
}

export async function getDecryptedDriveAccessToken(
  userId: string,
): Promise<string> {
  return getValidDriveAccessToken(userId);
}

/** Status seguro (sem tokens) para a UI e endpoints. */
export async function getDriveConnectionStatus(
  userId: string,
  options: { includeStorage?: boolean } = {},
): Promise<DriveConnectionStatus> {
  const record = getDriveTokenRecord(userId);
  const config = getDb().video_storage_config.find(
    (item) => item.user_id === userId,
  );
  if (!record) {
    return {
      connected: false,
      userEmail: null,
      driveId: null,
      expiresAt: null,
      lastSync: config?.last_sync_at ?? null,
      scope: null,
      storage: null,
    };
  }

  let storage = null;
  if (options.includeStorage) {
    try {
      const accessToken = await getValidDriveAccessToken(userId);
      const about = await getDriveAbout(accessToken);
      storage = about.storage;
    } catch {
      storage = null;
    }
  }

  return {
    connected: Boolean(record.encrypted_access_token),
    userEmail: record.google_email || null,
    driveId: record.drive_id || null,
    expiresAt: record.expires_at,
    lastSync: config?.last_sync_at ?? null,
    scope: record.scope,
    storage,
  };
}

/** Desconecta e remove todos os tokens associados (Propriedade 10). */
export async function disconnectDriveAccount(userId: string): Promise<{
  success: boolean;
  revoked: boolean;
}> {
  const record = getDriveTokenRecord(userId);
  if (!record) {
    throw new ApiError(404, "NOT_FOUND", "Nenhuma conta Google Drive conectada");
  }

  let revoked = true;
  if (record.encrypted_refresh_token) {
    try {
      const tokens = await decryptDriveTokens(record);
      if (tokens.refreshToken) await revokeToken(tokens.refreshToken);
    } catch {
      revoked = false;
    }
  }

  clearDriveTokens(userId);
  mutate((db) => {
    const config = db.video_storage_config.find(
      (item) => item.user_id === userId,
    );
    if (config) config.last_sync_at = nowIso();
  });

  console.info("[google-drive] disconnected", { user_id: userId, revoked });
  return { success: true, revoked };
}

export async function markDriveSync(userId: string): Promise<void> {
  mutate((db) => {
    const config = db.video_storage_config.find(
      (item) => item.user_id === userId,
    );
    if (config) {
      config.last_sync_at = nowIso();
      config.updated_at = nowIso();
    }
  });
}

/** Garante que o arquivo ainda existe no Drive antes da reprodução. */
export async function assertDriveFileExists(
  userId: string,
  fileId: string,
): Promise<void> {
  const accessToken = await getValidDriveAccessToken(userId);
  await getFileMetadata(accessToken, fileId);
}
