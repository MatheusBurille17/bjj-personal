import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import type {
  GoogleOAuthPublicStatus,
  GoogleOAuthRecord,
} from "@/types/google-oauth";
import type {
  DriveConnectionStatus,
  DriveOAuthTokenRecord,
} from "@/types/google-drive";
import { ApiError } from "@/lib/middleware/errors";
import { createClient } from "@/lib/supabase/server";
import {
  createAdminClient,
  isAdminClientAvailable,
} from "@/lib/supabase/admin";
import { mapPostgrestError } from "@/lib/supabase/errors";
import { GoogleOAuthError, toApiError } from "@/lib/google-oauth-errors";
import { refreshAccessToken, revokeToken } from "@/lib/google-oauth-client";
import { encrypt, decrypt } from "./token-encryption.service";
import { getDriveAbout } from "./google-drive-client";
import { logOAuthAuditSupabase } from "./oauth-audit-supabase.service";

export const DRIVE_TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;
/**
 * O Google normalmente emite access tokens com validade de 1 hora. Usamos uma
 * margem conservadora para renovar antes de o token realmente expirar.
 */
export const PROVIDER_TOKEN_TTL_SECONDS = 55 * 60;

type Client = SupabaseClient<Database>;

export interface StoreProviderTokensInput {
  userId: string;
  accessToken: string;
  refreshToken?: string | null;
  /** Segundos; quando omitido usa 1 hora. */
  expiresIn?: number;
  scope: string;
  googleId: string;
  email: string;
  name: string;
  pictureUrl?: string | null;
}

interface TokenSnapshot {
  accessCipher: string;
  refreshCipher: string;
  tokenIv: string;
  expiresAt: string;
  scope: string;
  email: string;
}

function assertEncryptionKey(): void {
  if (process.env.NODE_ENV !== "production") return;
  const key = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new GoogleOAuthError(
      "configuration_error",
      "Defina GOOGLE_TOKEN_ENCRYPTION_KEY (mín. 32 caracteres) para criptografar os tokens Google em produção.",
    );
  }
}

function splitIvs(tokenIv: string): { access: string; refresh: string } {
  const [access = "", refresh = ""] = (tokenIv ?? "").split(":");
  return { access, refresh };
}

function expiryFromNow(expiresIn: number): string {
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "expires_in inválido");
  }
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

export function shouldRefreshGoogleToken(
  expiresAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!expiresAt) return true;
  const expiry = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiry)) return true;
  return expiry - now <= DRIVE_TOKEN_REFRESH_WINDOW_MS;
}

export function isSupabaseConfiguredForGoogle(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && publicKey);
}

async function getClient(): Promise<Client> {
  if (isAdminClientAvailable()) {
    return createAdminClient();
  }
  if (!isSupabaseConfiguredForGoogle()) {
    throw new GoogleOAuthError(
      "configuration_error",
      "Supabase não está configurado. Defina NEXT_PUBLIC_SUPABASE_URL e a chave pública para usar o login com Google.",
    );
  }
  return createClient();
}

export async function getSupabaseGoogleRecord(
  userId: string,
): Promise<GoogleOAuthRecord | null> {
  const client = await getClient();
  const { data, error } = await client
    .from("user_google_oauth")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw mapPostgrestError(error);
  return (data as GoogleOAuthRecord | null) ?? null;
}

export async function getSupabaseDriveRecord(
  userId: string,
): Promise<DriveOAuthTokenRecord | null> {
  const client = await getClient();
  const { data, error } = await client
    .from("providers_oauth_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw mapPostgrestError(error);
  return (data as DriveOAuthTokenRecord | null) ?? null;
}

/** Indica se já existem tokens Google utilizáveis para o usuário. */
export async function hasExistingGoogleTokens(
  userId: string,
): Promise<boolean> {
  const [social, drive] = await Promise.all([
    getSupabaseGoogleRecord(userId),
    getSupabaseDriveRecord(userId),
  ]);
  return Boolean(
    (social?.is_connected && social.encrypted_access_token) ||
      drive?.encrypted_access_token,
  );
}

/**
 * Persiste os tokens do provider Google devolvidos pelo Supabase Auth nas duas
 * tabelas usadas pela aplicação (login social e Google Drive).
 *
 * O refresh token antigo é preservado quando o Google/Supabase não devolve um
 * novo (reautorizações costumam omitir `refresh_token`).
 */
export async function storeProviderTokens(
  input: StoreProviderTokensInput,
): Promise<void> {
  assertEncryptionKey();

  if (!input.accessToken) {
    throw new GoogleOAuthError(
      "invalid_token",
      "O Google não retornou um access token válido.",
    );
  }

  const client = await getClient();
  const [social, drive] = await Promise.all([
    getSupabaseGoogleRecord(input.userId),
    getSupabaseDriveRecord(input.userId),
  ]);

  const access = await encrypt(input.accessToken);
  const newRefresh = input.refreshToken
    ? await encrypt(input.refreshToken)
    : null;

  const socialRefreshCipher =
    newRefresh?.encrypted || social?.encrypted_refresh_token || "";
  const driveRefreshCipher =
    newRefresh?.encrypted || drive?.encrypted_refresh_token || "";
  const socialRefreshIv =
    newRefresh?.iv || splitIvs(social?.token_iv ?? "").refresh;
  const driveRefreshIv =
    newRefresh?.iv || splitIvs(drive?.token_iv ?? "").refresh;

  const expiresAt = expiryFromNow(
    input.expiresIn ?? PROVIDER_TOKEN_TTL_SECONDS,
  );
  const timestamp = new Date().toISOString();
  const email = input.email.trim().toLowerCase();
  const scopes = input.scope.split(/\s+/).filter(Boolean);

  const socialResult = await client.from("user_google_oauth").upsert(
    {
      user_id: input.userId,
      google_id: input.googleId,
      email,
      name: input.name,
      picture_url: input.pictureUrl ?? null,
      encrypted_access_token: access.encrypted,
      encrypted_refresh_token: socialRefreshCipher,
      token_iv: `${access.iv}:${socialRefreshIv}`,
      token_expiry_at: expiresAt,
      is_connected: true,
      scopes_granted: scopes,
      consent_timestamp: timestamp,
      updated_at: timestamp,
    },
    { onConflict: "user_id" },
  );
  if (socialResult.error) throw mapPostgrestError(socialResult.error);

  const driveResult = await client.from("providers_oauth_tokens").upsert(
    {
      user_id: input.userId,
      provider: "google_drive",
      encrypted_access_token: access.encrypted,
      encrypted_refresh_token: driveRefreshCipher,
      token_iv: `${access.iv}:${driveRefreshIv}`,
      expires_at: expiresAt,
      scope: input.scope,
      drive_id: email,
      google_email: email,
      updated_at: timestamp,
    },
    { onConflict: "user_id" },
  );
  if (driveResult.error) throw mapPostgrestError(driveResult.error);
}

async function getTokenSnapshot(userId: string): Promise<TokenSnapshot | null> {
  const drive = await getSupabaseDriveRecord(userId);
  if (drive) {
    return {
      accessCipher: drive.encrypted_access_token,
      refreshCipher: drive.encrypted_refresh_token,
      tokenIv: drive.token_iv,
      expiresAt: drive.expires_at,
      scope: drive.scope,
      email: drive.google_email,
    };
  }

  const social = await getSupabaseGoogleRecord(userId);
  if (!social) return null;
  return {
    accessCipher: social.encrypted_access_token,
    refreshCipher: social.encrypted_refresh_token,
    tokenIv: social.token_iv,
    expiresAt: social.token_expiry_at,
    scope: social.scopes_granted.join(" "),
    email: social.email,
  };
}

async function decryptAccessToken(record: TokenSnapshot): Promise<string> {
  assertEncryptionKey();
  const { access } = splitIvs(record.tokenIv);
  if (!record.accessCipher || !access) {
    throw new ApiError(401, "UNAUTHORIZED", "Conexão Google ausente", {
      error: "token_refresh_failed",
    });
  }
  return decrypt(record.accessCipher, access);
}

async function decryptRefreshToken(
  record: TokenSnapshot,
): Promise<string | undefined> {
  assertEncryptionKey();
  const { refresh } = splitIvs(record.tokenIv);
  if (!record.refreshCipher || !refresh) return undefined;
  return decrypt(record.refreshCipher, refresh);
}

async function deleteAllTokens(userId: string): Promise<void> {
  const client = await getClient();
  const [social, drive] = await Promise.all([
    client.from("user_google_oauth").delete().eq("user_id", userId),
    client.from("providers_oauth_tokens").delete().eq("user_id", userId),
  ]);
  if (social.error) throw mapPostgrestError(social.error);
  if (drive.error) throw mapPostgrestError(drive.error);
}

export async function getSupabaseGoogleStatus(
  userId: string,
): Promise<GoogleOAuthPublicStatus> {
  const [social, drive] = await Promise.all([
    getSupabaseGoogleRecord(userId),
    getSupabaseDriveRecord(userId),
  ]);

  if (social) {
    return {
      connected: Boolean(social.is_connected && social.encrypted_access_token),
      googleEmail: social.email,
      googleName: social.name,
      picture: social.picture_url ?? null,
      lastTokenRefreshAt: social.last_token_refresh_at ?? null,
      consentTimestamp: social.consent_timestamp ?? null,
      scopesGranted: [...social.scopes_granted],
    };
  }

  if (drive) {
    return {
      connected: Boolean(drive.encrypted_access_token),
      googleEmail: drive.google_email || null,
      googleName: null,
      picture: null,
      lastTokenRefreshAt: null,
      consentTimestamp: drive.updated_at ?? null,
      scopesGranted: drive.scope.split(/\s+/).filter(Boolean),
    };
  }

  return {
    connected: false,
    googleEmail: null,
    googleName: null,
    picture: null,
    lastTokenRefreshAt: null,
    consentTimestamp: null,
    scopesGranted: [],
  };
}

export async function getSupabaseDriveConnectionStatus(
  userId: string,
  options: { includeStorage?: boolean } = {},
): Promise<DriveConnectionStatus> {
  let drive = await getSupabaseDriveRecord(userId);

  if (!drive) {
    // Compatibilidade: usuários que conectaram o Google antes da migração
    // podem ter apenas o registro social. Ele é a fonte dos mesmos tokens.
    const social = await getSupabaseGoogleRecord(userId);
    if (social?.is_connected && social.encrypted_access_token) {
      return {
        connected: true,
        userEmail: social.email,
        driveId: social.email,
        expiresAt: social.token_expiry_at,
        lastSync: social.updated_at,
        scope: social.scopes_granted.join(" "),
        storage: null,
      };
    }

    return {
      connected: false,
      userEmail: null,
      driveId: null,
      expiresAt: null,
      lastSync: null,
      scope: null,
      storage: null,
    };
  }

  let storage = null;
  if (options.includeStorage) {
    try {
      const accessToken = await getValidSupabaseGoogleAccessToken(userId);
      const about = await getDriveAbout(accessToken);
      storage = about.storage;
      // O refresh pode ter atualizado a expiração/token.
      drive = (await getSupabaseDriveRecord(userId)) ?? drive;
    } catch {
      // Se o refresh falhou e os tokens foram removidos, reflete o estado real.
      drive = await getSupabaseDriveRecord(userId);
      if (!drive) {
        return {
          connected: false,
          userEmail: null,
          driveId: null,
          expiresAt: null,
          lastSync: null,
          scope: null,
          storage: null,
        };
      }
      storage = null;
    }
  }

  return {
    connected: Boolean(drive.encrypted_access_token),
    userEmail: drive.google_email || null,
    driveId: drive.drive_id || null,
    expiresAt: drive.expires_at,
    lastSync: drive.updated_at ?? null,
    scope: drive.scope || null,
    storage,
  };
}

async function updateAccessTokenInBothTables(
  userId: string,
  access: { encrypted: string; iv: string },
  expiresAt: string,
  scope?: string,
): Promise<void> {
  const client = await getClient();
  const [social, drive] = await Promise.all([
    getSupabaseGoogleRecord(userId),
    getSupabaseDriveRecord(userId),
  ]);
  const timestamp = new Date().toISOString();
  const scopes = scope?.split(/\s+/).filter(Boolean);

  const operations: Array<PromiseLike<{ error: unknown }>> = [];

  if (social) {
    const refreshIv = splitIvs(social.token_iv).refresh;
    operations.push(
      client
        .from("user_google_oauth")
        .update({
          encrypted_access_token: access.encrypted,
          token_iv: `${access.iv}:${refreshIv}`,
          token_expiry_at: expiresAt,
          last_token_refresh_at: timestamp,
          is_connected: true,
          updated_at: timestamp,
          ...(scopes?.length ? { scopes_granted: scopes } : {}),
        })
        .eq("user_id", userId),
    );
  }

  if (drive) {
    const refreshIv = splitIvs(drive.token_iv).refresh;
    operations.push(
      client
        .from("providers_oauth_tokens")
        .update({
          encrypted_access_token: access.encrypted,
          token_iv: `${access.iv}:${refreshIv}`,
          expires_at: expiresAt,
          updated_at: timestamp,
          ...(scope ? { scope } : {}),
        })
        .eq("user_id", userId),
    );
  } else if (social) {
    operations.push(
      client.from("providers_oauth_tokens").upsert(
        {
          user_id: userId,
          provider: "google_drive",
          encrypted_access_token: access.encrypted,
          encrypted_refresh_token: social.encrypted_refresh_token,
          token_iv: `${access.iv}:${splitIvs(social.token_iv).refresh}`,
          expires_at: expiresAt,
          scope: scope ?? social.scopes_granted.join(" "),
          drive_id: social.email,
          google_email: social.email,
          updated_at: timestamp,
        },
        { onConflict: "user_id" },
      ),
    );
  }

  const results = await Promise.all(operations);
  for (const result of results) {
    if (result.error) {
      throw mapPostgrestError(result.error as never);
    }
  }
}

export async function refreshSupabaseGoogleToken(
  userId: string,
): Promise<{ token_refreshed: boolean; expires_at: string }> {
  const record = await getTokenSnapshot(userId);
  if (!record) {
    throw new ApiError(404, "NOT_FOUND", "Nenhuma conta Google conectada");
  }

  if (!shouldRefreshGoogleToken(record.expiresAt)) {
    return { token_refreshed: false, expires_at: record.expiresAt };
  }

  let refreshToken: string | undefined;
  try {
    refreshToken = await decryptRefreshToken(record);
  } catch {
    await deleteAllTokens(userId);
    throw new ApiError(
      401,
      "UNAUTHORIZED",
      "Sua conexão com o Google expirou. Reconecte sua conta Google.",
      { error: "token_refresh_failed" },
    );
  }

  if (!refreshToken) {
    await deleteAllTokens(userId);
    throw new ApiError(
      401,
      "UNAUTHORIZED",
      "Sua conexão com o Google expirou. Reconecte sua conta Google.",
      { error: "token_refresh_failed" },
    );
  }

  let refreshed: Awaited<ReturnType<typeof refreshAccessToken>>;
  try {
    refreshed = await refreshAccessToken(refreshToken);
  } catch (error) {
    const revoked =
      error instanceof GoogleOAuthError &&
      (error.code === "invalid_grant" ||
        error.code === "invalid_token" ||
        error.httpStatus === 401);

    if (revoked) {
      await deleteAllTokens(userId);
      await logOAuthAuditSupabase({
        event: "google_refresh_failed",
        userId,
        success: false,
        metadata: { reason: error.code },
      });
      throw new ApiError(
        401,
        "UNAUTHORIZED",
        "Sua conexão com o Google expirou. Reconecte sua conta Google.",
        { error: "token_refresh_failed" },
      );
    }

    await logOAuthAuditSupabase({
      event: "google_refresh_failed",
      userId,
      success: false,
      metadata: {
        reason: error instanceof GoogleOAuthError ? error.code : "unknown",
      },
    });
    throw toApiError(error);
  }

  const access = await encrypt(refreshed.access_token);
  const expiresAt = expiryFromNow(refreshed.expires_in);
  await updateAccessTokenInBothTables(
    userId,
    access,
    expiresAt,
    refreshed.scope,
  );

  await logOAuthAuditSupabase({
    event: "google_token_refreshed",
    userId,
    success: true,
    metadata: { expires_at: expiresAt },
  });

  return { token_refreshed: true, expires_at: expiresAt };
}

export async function getValidSupabaseGoogleAccessToken(
  userId: string,
): Promise<string> {
  let record = await getTokenSnapshot(userId);
  if (!record) {
    throw new ApiError(404, "NOT_FOUND", "Nenhuma conta Google conectada");
  }

  if (shouldRefreshGoogleToken(record.expiresAt)) {
    await refreshSupabaseGoogleToken(userId);
    record = await getTokenSnapshot(userId);
  }

  if (!record) {
    throw new ApiError(401, "UNAUTHORIZED", "Reconecte sua conta Google");
  }
  return decryptAccessToken(record);
}

export async function disconnectSupabaseGoogleAccount(
  userId: string,
  context?: { ip?: string | null; userAgent?: string | null },
): Promise<GoogleOAuthPublicStatus & { revocation_succeeded: boolean }> {
  const record = await getTokenSnapshot(userId);
  if (!record) {
    throw new ApiError(404, "NOT_FOUND", "Nenhuma conta Google conectada");
  }

  let revocationSucceeded = true;
  let revocationAttempted = false;

  if (record.refreshCipher) {
    revocationAttempted = true;
    try {
      const refreshToken = await decryptRefreshToken(record);
      if (refreshToken) {
        await revokeToken(refreshToken);
      }
    } catch (error) {
      revocationSucceeded = false;
      await logOAuthAuditSupabase({
        event: "google_revocation_failed",
        userId,
        success: false,
        ip: context?.ip,
        userAgent: context?.userAgent,
        metadata: {
          reason:
            error instanceof GoogleOAuthError ? error.code : "decryption_error",
        },
      });
    }
  }

  await deleteAllTokens(userId);

  await logOAuthAuditSupabase({
    event: "google_disconnected",
    userId,
    success: true,
    ip: context?.ip,
    userAgent: context?.userAgent,
    metadata: {
      revocation_attempted: revocationAttempted,
      revocation_succeeded: revocationSucceeded,
    },
  });

  return {
    ...(await getSupabaseGoogleStatus(userId)),
    revocation_succeeded: revocationSucceeded,
  };
}
