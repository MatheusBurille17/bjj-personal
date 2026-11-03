import { randomBytes, randomUUID } from "node:crypto";
import type {
  GoogleOAuthCredential,
  GoogleOAuthPublicStatus,
  GoogleOAuthRecord,
  GoogleSignInResult,
  GoogleUserProfile,
} from "@/types/google-oauth";
import { getDb, mutate, nowIso } from "@/lib/db/store";
import { buildAuthResult, getUserRoles } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { ApiError } from "@/lib/middleware/errors";
import { sanitizeRedirectPath } from "@/lib/utils/url";
import {
  buildGoogleAuthorizationUrl,
  exchangeCodeForTokens as exchangeWithGoogle,
  getGoogleUserProfile,
  refreshAccessToken as refreshWithGoogle,
  revokeToken,
} from "@/lib/google-oauth-client";
import {
  GoogleOAuthError,
  toApiError,
} from "@/lib/google-oauth-errors";
import {
  createCodeChallenge,
  generateCodeVerifier,
  generateStateParameter,
  hashAuthorizationCode,
} from "./oauth-state.service";
import { encrypt, decrypt } from "./token-encryption.service";
import { logOAuthAudit } from "./oauth-audit.service";
import {
  clearDriveTokenRecord,
  storeDriveTokens,
  syncDriveAccessToken,
} from "./google-drive-token.service";

export const TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;
export const DEFAULT_GOOGLE_REDIRECT_PATH = "/dashboard";
const USED_CODE_TTL_MS = 10 * 60 * 1000;

export interface GenerateAuthorizationUrlOptions {
  redirectPath?: string;
  connectMode?: boolean;
  state?: string;
  codeVerifier?: string;
  redirectUri?: string;
  clientId?: string;
  scopes?: string[];
}

export interface GenerateAuthorizationUrlResult {
  url: string;
  state: string;
  codeVerifier: string;
}

export interface EncryptedTokenFields {
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  iv: string;
}

export interface DecryptedTokenFields {
  access_token: string;
  refresh_token?: string;
}

export interface RefreshTokenResult {
  token_refreshed: boolean;
  expires_at: string;
}

export interface DisconnectResult extends GoogleOAuthPublicStatus {
  revocation_succeeded: boolean;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function splitTokenIv(tokenIv: string): { accessIv: string; refreshIv: string } {
  const [accessIv = "", refreshIv = ""] = (tokenIv ?? "").split(":");
  return { accessIv, refreshIv };
}

function expiryFromNow(expiresIn: number): string {
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "expires_in inválido");
  }
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function parseScopes(scope: string | undefined, fallback: string[] = []): string[] {
  if (!scope?.trim()) return [...fallback];
  return scope.split(/\s+/).filter(Boolean);
}

/**
 * Gera a URL de autorização e os parâmetros de segurança (state + PKCE).
 * Se state/codeVerifier não forem fornecidos, novos valores aleatórios são
 * gerados a cada chamada (Propriedade 1).
 */
export async function generateAuthorizationUrl(
  options: GenerateAuthorizationUrlOptions = {},
): Promise<GenerateAuthorizationUrlResult> {
  if (options.redirectPath !== undefined) {
    const safe = sanitizeRedirectPath(options.redirectPath);
    if (safe === undefined) {
      throw ApiError.validation("redirect_path inválido", {
        error: "invalid_redirect_path",
      });
    }
  }

  const state = options.state ?? generateStateParameter();
  const codeVerifier = options.codeVerifier ?? generateCodeVerifier();
  const codeChallenge = await createCodeChallenge(codeVerifier);

  const url = buildGoogleAuthorizationUrl({
    state,
    codeChallenge,
    redirectUri: options.redirectUri,
    clientId: options.clientId,
    scopes: options.scopes,
  });

  return { url, state, codeVerifier };
}

function isUsedCode(codeHash: string): boolean {
  const now = Date.now();
  return getDb().oauth_used_codes.some(
    (record) =>
      record.code_hash === codeHash && new Date(record.expires_at).getTime() > now,
  );
}

function registerUsedCode(codeHash: string): void {
  const timestamp = nowIso();
  mutate((db) => {
    const now = Date.now();
    db.oauth_used_codes = db.oauth_used_codes.filter(
      (record) => new Date(record.expires_at).getTime() > now,
    );
    db.oauth_used_codes.push({
      id: randomUUID(),
      code_hash: codeHash,
      expires_at: new Date(now + USED_CODE_TTL_MS).toISOString(),
      created_at: timestamp,
    });
  });
}

/**
 * Troca o authorization code e aplica proteção contra replay local, além da
 * garantia de uso único já imposta pelo Google (Propriedade 3).
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
): Promise<GoogleOAuthCredential> {
  if (!code || !codeVerifier) {
    throw new GoogleOAuthError(
      "invalid_request",
      "Código de autorização e code_verifier são obrigatórios.",
    );
  }

  const codeHash = hashAuthorizationCode(code);
  if (isUsedCode(codeHash)) {
    throw new GoogleOAuthError(
      "invalid_code",
      "Este código de autorização já foi utilizado.",
    );
  }

  const credential = await exchangeWithGoogle(code, codeVerifier);
  registerUsedCode(codeHash);
  return credential;
}

/** Criptografa access + refresh tokens com IVs independentes. */
export async function encryptTokens(
  credential: GoogleOAuthCredential,
): Promise<EncryptedTokenFields> {
  if (!credential.access_token) {
    throw new ApiError(400, "VALIDATION_ERROR", "Access token ausente");
  }

  const access = await encrypt(credential.access_token);
  const refresh = credential.refresh_token
    ? await encrypt(credential.refresh_token)
    : { encrypted: "", iv: "" };

  return {
    encrypted_access_token: access.encrypted,
    encrypted_refresh_token: refresh.encrypted,
    iv: `${access.iv}:${refresh.iv}`,
  };
}

export async function decryptTokens(
  record: Pick<GoogleOAuthRecord, "encrypted_access_token" | "encrypted_refresh_token" | "token_iv">,
): Promise<DecryptedTokenFields> {
  const { accessIv, refreshIv } = splitTokenIv(record.token_iv);
  if (!record.encrypted_access_token || !accessIv) {
    throw new ApiError(400, "VALIDATION_ERROR", "Tokens Google ausentes");
  }

  const access_token = await decrypt(record.encrypted_access_token, accessIv);
  const refresh_token =
    record.encrypted_refresh_token && refreshIv
      ? await decrypt(record.encrypted_refresh_token, refreshIv)
      : undefined;

  return {
    access_token,
    ...(refresh_token ? { refresh_token } : {}),
  };
}

export interface StoreGoogleOAuthInput {
  googleProfile: GoogleUserProfile;
  credential: GoogleOAuthCredential;
  scopes: string[];
}

/** Cria ou atualiza o registro `user_google_oauth` do usuário. */
export async function storeGoogleOAuth(
  userId: string,
  data: StoreGoogleOAuthInput,
): Promise<GoogleOAuthRecord> {
  const encrypted = await encryptTokens(data.credential);
  const tokenExpiryAt = expiryFromNow(data.credential.expires_in);
  const timestamp = nowIso();
  const scopes = data.scopes.length
    ? data.scopes
    : parseScopes(data.credential.scope);

  const saved = mutate((db) => {
    const existing = db.user_google_oauth.find(
      (record) => record.user_id === userId,
    );

    const accessIv = splitTokenIv(encrypted.iv).accessIv;
    let refreshCipher = encrypted.encrypted_refresh_token;
    let refreshIv = splitTokenIv(encrypted.iv).refreshIv;

    // O Google pode omitir refresh_token em reautorizações; preservamos o
    // refresh token anterior para não perder a conexão offline.
    if (!refreshCipher && existing) {
      refreshCipher = existing.encrypted_refresh_token;
      refreshIv = splitTokenIv(existing.token_iv).refreshIv;
    }

    const tokenIv = `${accessIv}:${refreshIv}`;

    if (existing) {
      existing.google_id = data.googleProfile.id;
      existing.email = normalizeEmail(data.googleProfile.email);
      existing.name = data.googleProfile.name;
      existing.picture_url = data.googleProfile.picture ?? null;
      existing.encrypted_access_token = encrypted.encrypted_access_token;
      existing.encrypted_refresh_token = refreshCipher;
      existing.token_iv = tokenIv;
      existing.token_expiry_at = tokenExpiryAt;
      existing.is_connected = true;
      existing.scopes_granted = scopes;
      existing.consent_timestamp = timestamp;
      existing.updated_at = timestamp;
      return existing;
    }

    const record: GoogleOAuthRecord = {
      id: randomUUID(),
      user_id: userId,
      google_id: data.googleProfile.id,
      email: normalizeEmail(data.googleProfile.email),
      name: data.googleProfile.name,
      picture_url: data.googleProfile.picture ?? null,
      encrypted_access_token: encrypted.encrypted_access_token,
      encrypted_refresh_token: refreshCipher,
      token_iv: tokenIv,
      token_expiry_at: tokenExpiryAt,
      is_connected: true,
      scopes_granted: scopes,
      consent_timestamp: timestamp,
      last_token_refresh_at: null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    db.user_google_oauth.push(record);
    return record;
  });

  logOAuthAudit({
    event: "google_connected",
    userId,
    success: true,
    metadata: {
      google_id: data.googleProfile.id,
      scopes_count: scopes.length,
    },
  });

  return saved;
}

export function getUserGoogleOAuth(userId: string): GoogleOAuthRecord | null {
  return getDb().user_google_oauth.find((record) => record.user_id === userId) ?? null;
}

/** Visão segura (sem tokens) para API e componentes. */
export function getGoogleOAuthStatus(userId: string): GoogleOAuthPublicStatus {
  // O login social/Drive ainda usa o repositório local; não exponha estado
  // antigo quando o runtime é Supabase.
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
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

  const record = getUserGoogleOAuth(userId);
  if (!record) {
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

  return {
    connected: Boolean(record.is_connected && record.encrypted_access_token),
    googleEmail: record.email,
    googleName: record.name,
    picture: record.picture_url ?? null,
    lastTokenRefreshAt: record.last_token_refresh_at ?? null,
    consentTimestamp: record.consent_timestamp ?? null,
    scopesGranted: [...record.scopes_granted],
  };
}

/** Verdadeiro quando o token expira em até 5 minutos (ou já expirou). */
export function shouldRefreshToken(expiryAt: string | Date, now = Date.now()): boolean {
  const timestamp =
    expiryAt instanceof Date ? expiryAt.getTime() : new Date(expiryAt).getTime();
  if (!Number.isFinite(timestamp)) return true;
  return timestamp - now <= TOKEN_REFRESH_WINDOW_MS;
}

export async function refreshAccessToken(refreshToken: string) {
  return refreshWithGoogle(refreshToken);
}

export async function revokeGoogleAuth(refreshToken: string): Promise<boolean> {
  try {
    await revokeToken(refreshToken);
    return true;
  } catch (error) {
    logOAuthAudit({
      event: "google_revocation_failed",
      success: false,
      metadata: {
        reason: error instanceof GoogleOAuthError ? error.code : "unknown",
      },
    });
    return false;
  }
}

function clearGoogleTokens(userId: string): void {
  mutate((db) => {
    const record = db.user_google_oauth.find((item) => item.user_id === userId);
    if (!record) return;
    record.encrypted_access_token = "";
    record.encrypted_refresh_token = "";
    record.token_iv = "";
    record.is_connected = false;
    record.updated_at = nowIso();
  });
}

function markDisconnectedAfterRefreshFailure(userId: string, reason: string): void {
  clearGoogleTokens(userId);
  logOAuthAudit({
    event: "google_refresh_failed",
    userId,
    success: false,
    metadata: { reason },
  });
}

/** Renova o access token se estiver dentro da janela de 5 minutos. */
export async function refreshUserGoogleToken(
  userId: string,
): Promise<RefreshTokenResult> {
  const record = getUserGoogleOAuth(userId);
  if (!record || !record.is_connected) {
    throw new ApiError(404, "NOT_FOUND", "Nenhuma conta Google conectada");
  }

  if (!shouldRefreshToken(record.token_expiry_at)) {
    return { token_refreshed: false, expires_at: record.token_expiry_at };
  }

  let refreshToken: string | undefined;
  try {
    refreshToken = (await decryptTokens(record)).refresh_token;
  } catch {
    markDisconnectedAfterRefreshFailure(userId, "decryption_error");
    throw new ApiError(
      401,
      "UNAUTHORIZED",
      "Sua conexão com o Google expirou. Reconecte sua conta Google.",
      { error: "token_refresh_failed" },
    );
  }

  if (!refreshToken) {
    markDisconnectedAfterRefreshFailure(userId, "missing_refresh_token");
    throw new ApiError(
      401,
      "UNAUTHORIZED",
      "Sua conexão com o Google expirou. Reconecte sua conta Google.",
      { error: "token_refresh_failed" },
    );
  }

  let refreshed: Awaited<ReturnType<typeof refreshWithGoogle>>;
  try {
    refreshed = await refreshWithGoogle(refreshToken);
  } catch (error) {
    const revoked =
      error instanceof GoogleOAuthError &&
      (error.code === "invalid_grant" ||
        error.code === "invalid_token" ||
        error.httpStatus === 401);

    if (revoked) {
      markDisconnectedAfterRefreshFailure(userId, error.code);
      throw new ApiError(
        401,
        "UNAUTHORIZED",
        "Sua conexão com o Google expirou. Reconecte sua conta Google.",
        { error: "token_refresh_failed" },
      );
    }

    logOAuthAudit({
      event: "google_refresh_failed",
      userId,
      success: false,
      metadata: {
        reason: error instanceof GoogleOAuthError ? error.code : "unknown",
      },
    });
    throw toApiError(error);
  }

  const newAccess = await encrypt(refreshed.access_token);
  const { refreshIv } = splitTokenIv(record.token_iv);
  const expiresAt = expiryFromNow(refreshed.expires_in);
  const timestamp = nowIso();

  mutate((db) => {
    const current = db.user_google_oauth.find((item) => item.user_id === userId);
    if (!current) return;
    current.encrypted_access_token = newAccess.encrypted;
    current.token_iv = `${newAccess.iv}:${refreshIv}`;
    current.token_expiry_at = expiresAt;
    current.last_token_refresh_at = timestamp;
    current.is_connected = true;
    current.updated_at = timestamp;
    if (refreshed.scope) {
      current.scopes_granted = parseScopes(refreshed.scope, current.scopes_granted);
    }
  });
  syncDriveAccessToken(userId, newAccess.encrypted, newAccess.iv, expiresAt);

  logOAuthAudit({
    event: "google_token_refreshed",
    userId,
    success: true,
    metadata: { expires_at: expiresAt },
  });

  return { token_refreshed: true, expires_at: expiresAt };
}

/**
 * Obtém um access token válido para chamadas ao Google Drive.
 * Renova de forma lazy quando faltam menos de 5 minutos para expirar.
 */
export async function getValidGoogleAccessToken(userId: string): Promise<string> {
  const record = getUserGoogleOAuth(userId);
  if (!record || !record.is_connected) {
    throw new ApiError(404, "NOT_FOUND", "Nenhuma conta Google conectada");
  }

  if (shouldRefreshToken(record.token_expiry_at)) {
    await refreshUserGoogleToken(userId);
  }

  const current = getUserGoogleOAuth(userId);
  if (!current || !current.is_connected) {
    throw new ApiError(401, "UNAUTHORIZED", "Reconecte sua conta Google");
  }
  return (await decryptTokens(current)).access_token;
}

/** Desconecta a conta, revoga no Google (best effort) e limpa os tokens. */
export async function disconnectGoogleAccount(
  userId: string,
  context?: { ip?: string | null; userAgent?: string | null },
): Promise<DisconnectResult> {
  const record = getUserGoogleOAuth(userId);
  if (!record) {
    throw new ApiError(404, "NOT_FOUND", "Nenhuma conta Google conectada");
  }

  let revocationSucceeded = true;
  let revocationAttempted = false;

  if (record.encrypted_refresh_token) {
    revocationAttempted = true;
    try {
      const { refresh_token } = await decryptTokens(record);
      if (refresh_token) {
        revocationSucceeded = await revokeGoogleAuth(refresh_token);
      }
    } catch (error) {
      revocationSucceeded = false;
      logOAuthAudit({
        event: "google_revocation_failed",
        userId,
        success: false,
        ip: context?.ip,
        userAgent: context?.userAgent,
        metadata: {
          reason: error instanceof GoogleOAuthError ? error.code : "decryption_error",
        },
      });
    }
  }

  clearGoogleTokens(userId);
  clearDriveTokenRecord(userId);

  logOAuthAudit({
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
    ...getGoogleOAuthStatus(userId),
    revocation_succeeded: revocationSucceeded,
  };
}

export interface SignInWithGoogleProfileInput {
  profile: GoogleUserProfile;
  credential: GoogleOAuthCredential;
  connectMode?: boolean;
  currentUserId?: string | null;
  scopes?: string[];
  context?: { ip?: string | null; userAgent?: string | null };
}

/**
 * Login/cadastro/vinculação a partir do perfil Google já validado.
 * - Modo connect exige sessão e e-mail idêntico ao da conta.
 * - Sem conta existente, cria usuário + perfil + professor (papel padrão).
 */
export async function signInWithGoogleProfile(
  input: SignInWithGoogleProfileInput,
): Promise<GoogleSignInResult> {
  const email = normalizeEmail(input.profile.email);
  if (!isValidEmail(email) || !input.profile.id) {
    throw new ApiError(400, "VALIDATION_ERROR", "Perfil Google inválido");
  }

  const db = getDb();
  const connectMode = input.connectMode === true;
  let userId: string;
  let isNewUser = false;

  const conflictingGoogleLink = db.user_google_oauth.find(
    (record) => record.google_id === input.profile.id,
  );
  if (
    conflictingGoogleLink &&
    (!connectMode || conflictingGoogleLink.user_id !== input.currentUserId)
  ) {
    logOAuthAudit({
      event: "google_identity_conflict",
      userId: conflictingGoogleLink.user_id,
      success: false,
      metadata: { reason: "google_id_already_linked" },
    });
    throw new ApiError(
      409,
      "CONFLICT",
      "Esta conta Google já está vinculada a outro usuário.",
      { error: "email_already_exists" },
    );
  }

  if (connectMode) {
    if (!input.currentUserId) {
      throw ApiError.unauthorized();
    }
    const currentUser = db.users.find((user) => user.id === input.currentUserId);
    if (!currentUser) throw ApiError.notFound("Conta não encontrada");
    if (normalizeEmail(currentUser.email) !== email) {
      logOAuthAudit({
        event: "google_identity_conflict",
        userId: currentUser.id,
        success: false,
        metadata: { reason: "email_mismatch_on_connect" },
      });
      throw new ApiError(
        409,
        "CONFLICT",
        "O e-mail da conta Google não corresponde ao e-mail da sua conta.",
        { error: "email_mismatch_on_connect" },
      );
    }
    userId = currentUser.id;
  } else {
    const existingUser = db.users.find(
      (user) => normalizeEmail(user.email) === email,
    );

    if (existingUser) {
      userId = existingUser.id;
    } else {
      userId = randomUUID();
      isNewUser = true;
      const timestamp = nowIso();
      const displayName =
        input.profile.name?.trim() || email.split("@")[0] || "Usuário Google";
      const unusablePassword = randomBytes(32).toString("hex");

      mutate((database) => {
        database.users.push({
          id: userId,
          email,
          // Senha aleatória: o usuário entra via Google ou redefine a senha.
          password_hash: hashPassword(unusablePassword),
          email_confirmed_at: timestamp,
          created_at: timestamp,
          updated_at: timestamp,
        });
        database.profiles.push({
          id: userId,
          full_name: displayName,
          email,
          avatar_url: input.profile.picture ?? null,
          created_at: timestamp,
          updated_at: timestamp,
        });
        database.teachers.push({
          id: userId,
          display_name: displayName,
          timezone: "America/Sao_Paulo",
          bio: null,
          created_at: timestamp,
          updated_at: timestamp,
        });
      });
    }

    // Perfil ausente em usuário antigo (ex.: convite não aceito) é criado.
    if (!db.profiles.some((profile) => profile.id === userId)) {
      const timestamp = nowIso();
      mutate((database) => {
        database.profiles.push({
          id: userId,
          full_name: input.profile.name?.trim() || email.split("@")[0],
          email,
          avatar_url: input.profile.picture ?? null,
          created_at: timestamp,
          updated_at: timestamp,
        });
      });
    }
  }

  const scopes = input.scopes?.length
    ? input.scopes
    : parseScopes(input.credential.scope);

  try {
    await storeGoogleOAuth(userId, {
      googleProfile: input.profile,
      credential: input.credential,
      scopes,
    });
  } catch {
    // Requisito 8.6: se os tokens não puderem ser persistidos, desfaz a
    // criação da conta para não deixar um usuário sem integração funcional.
    if (isNewUser) {
      mutate((database) => {
        database.users = database.users.filter((user) => user.id !== userId);
        database.profiles = database.profiles.filter(
          (profile) => profile.id !== userId,
        );
        database.teachers = database.teachers.filter(
          (teacher) => teacher.id !== userId,
        );
        database.user_google_oauth = database.user_google_oauth.filter(
          (record) => record.user_id !== userId,
        );
      });
    }
    logOAuthAudit({
      event: isNewUser ? "google_signup" : "google_login",
      userId,
      success: false,
      ip: input.context?.ip,
      userAgent: input.context?.userAgent,
      metadata: { reason: "token_storage_failed", connect_mode: connectMode },
    });
    throw new ApiError(
      500,
      "INTERNAL_ERROR",
      "Não foi possível concluir a conexão com o Google. Tente novamente.",
      { error: "token_storage_failed" },
    );
  }

  // Um único consentimento Google conecta também o Google Drive. Se o
  // espelhamento falhar, o login social continua válido e o usuário pode
  // reconectar depois.
  try {
    await storeDriveTokens(userId, {
      accessToken: input.credential.access_token,
      refreshToken: input.credential.refresh_token,
      expiresIn: input.credential.expires_in,
      scope: input.credential.scope,
      driveId: input.profile.email,
      googleEmail: input.profile.email,
    });
  } catch (error) {
    console.warn("[google-auth] falha ao conectar o Google Drive", {
      user_id: userId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const roles = await getUserRoles(userId);
  if (!roles.is_teacher && !roles.is_student) {
    throw ApiError.forbidden("Sua conta ainda não possui um vínculo ativo");
  }
  const role = roles.is_teacher ? "teacher" : "student";
  const auth = await buildAuthResult(userId, role);

  logOAuthAudit({
    event: connectMode
      ? "google_connected"
      : isNewUser
        ? "google_signup"
        : "google_login",
    userId,
    success: true,
    ip: input.context?.ip,
    userAgent: input.context?.userAgent,
    metadata: {
      is_new_user: isNewUser,
      connect_mode: connectMode,
    },
  });

  return {
    auth,
    isNewUser,
    isConnectMode: connectMode,
    userId,
  };
}

/** Executa exchange + userinfo + login/vinculação. */
export async function completeGoogleAuthorization(input: {
  code: string;
  codeVerifier: string;
  connectMode?: boolean;
  currentUserId?: string | null;
  context?: { ip?: string | null; userAgent?: string | null };
}): Promise<GoogleSignInResult> {
  const credential = await exchangeCodeForTokens(
    input.code,
    input.codeVerifier,
  );
  const profile = await getGoogleUserProfile(credential.access_token);
  return signInWithGoogleProfile({
    profile,
    credential,
    connectMode: input.connectMode,
    currentUserId: input.currentUserId,
    scopes: parseScopes(credential.scope),
    context: input.context,
  });
}

/** Limpa o registro local de códigos usados (uso em testes). */
export function resetUsedAuthorizationCodes(): void {
  mutate((db) => {
    db.oauth_used_codes = [];
  });
}
