import type {
  GoogleAuthorizationUrlOptions,
  GoogleOAuthConfig,
  GoogleOAuthCredential,
  GoogleUserProfile,
} from "@/types/google-oauth";
import { GOOGLE_OAUTH_SCOPES } from "@/types/google-oauth";
import { GoogleOAuthError } from "@/lib/google-oauth-errors";
import { assertHttpsUrlInProduction } from "@/lib/utils/https";

export const GOOGLE_AUTHORIZATION_ENDPOINT =
  "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_USERINFO_ENDPOINT =
  "https://openidconnect.googleapis.com/v1/userinfo";

const DEFAULT_TIMEOUT_MS = 15_000;

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function getGoogleOAuthConfig(): GoogleOAuthConfig {
  const scopes = process.env.GOOGLE_OAUTH_SCOPES?.trim()
    ? process.env.GOOGLE_OAUTH_SCOPES.trim().split(/\s+/)
    : [...GOOGLE_OAUTH_SCOPES];

  return {
    clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirectUri:
      process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI ??
      `${appBaseUrl()}/api/auth/google/callback`,
    scopes,
  };
}

export function isGoogleOAuthConfigured(): boolean {
  const config = getGoogleOAuthConfig();
  return Boolean(config.clientId && config.clientSecret);
}

export function requireGoogleOAuthConfig(): GoogleOAuthConfig {
  const config = getGoogleOAuthConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new GoogleOAuthError(
      "configuration_error",
      "Google OAuth não configurado. Defina NEXT_PUBLIC_GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.",
    );
  }
  assertHttpsUrlInProduction(config.redirectUri);
  return config;
}

/** Monta a URL do Google Consent Screen com state + PKCE. */
export function buildGoogleAuthorizationUrl(
  options: GoogleAuthorizationUrlOptions,
): string {
  if (!options.state || !options.codeChallenge) {
    throw new GoogleOAuthError(
      "invalid_request",
      "state e code_challenge são obrigatórios",
    );
  }

  const config = getGoogleOAuthConfig();
  const clientId = options.clientId ?? config.clientId;
  if (!clientId) {
    throw new GoogleOAuthError(
      "configuration_error",
      "NEXT_PUBLIC_GOOGLE_CLIENT_ID não configurado",
    );
  }

  const redirectUri = options.redirectUri ?? config.redirectUri;
  assertHttpsUrlInProduction(redirectUri);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: (options.scopes ?? config.scopes).join(" "),
    state: options.state,
    code_challenge: options.codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    // "consent" garante refresh_token mesmo em logins repetidos.
    prompt: options.prompt ?? "consent",
    include_granted_scopes: "true",
  });
  if (options.loginHint) params.set("login_hint", options.loginHint);

  return `${GOOGLE_AUTHORIZATION_ENDPOINT}?${params.toString()}`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      headers: {
        accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new GoogleOAuthError(
      "network_error",
      "Não foi possível conectar aos servidores do Google.",
    );
  }
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function errorFromResponse(
  status: number,
  payload: Record<string, unknown>,
  fallback: "invalid_code" | "invalid_grant" | "invalid_token",
): GoogleOAuthError {
  const raw = typeof payload.error === "string" ? payload.error : "";
  const map: Record<string, GoogleOAuthError["code"]> = {
    access_denied: "access_denied",
    invalid_client: "invalid_client",
    unauthorized_client: "invalid_client",
    invalid_grant: "invalid_grant",
    invalid_request: "invalid_request",
    invalid_scope: "invalid_scope",
    invalid_token: "invalid_token",
  };
  const code = map[raw] ?? (status >= 500 ? "server_error" : fallback);
  return new GoogleOAuthError(code, undefined, {
    httpStatus: status,
    details: raw ? { google_error: raw } : undefined,
  });
}

/** Troca o authorization code por tokens usando PKCE. */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  options?: { redirectUri?: string },
): Promise<GoogleOAuthCredential> {
  if (!code || !codeVerifier) {
    throw new GoogleOAuthError(
      "invalid_request",
      "Código de autorização e code_verifier são obrigatórios",
    );
  }

  const config = requireGoogleOAuthConfig();
  const body = new URLSearchParams({
    code,
    code_verifier: codeVerifier,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: options?.redirectUri ?? config.redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetchWithTimeout(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const payload = await parseJson(response);

  if (!response.ok) {
    throw errorFromResponse(response.status, payload, "invalid_code");
  }

  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  const expiresIn = Number(payload.expires_in);
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new GoogleOAuthError(
      "invalid_code",
      "O Google não retornou um access_token válido.",
      { httpStatus: response.status },
    );
  }

  return {
    access_token: accessToken,
    refresh_token:
      typeof payload.refresh_token === "string" ? payload.refresh_token : "",
    expires_in: expiresIn,
    token_type:
      typeof payload.token_type === "string" ? payload.token_type : "Bearer",
    scope:
      typeof payload.scope === "string"
        ? payload.scope
        : config.scopes.join(" "),
    ...(typeof payload.id_token === "string"
      ? { id_token: payload.id_token }
      : {}),
  };
}

export interface RefreshedGoogleToken {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

/** Renova o access token usando o refresh token. */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<RefreshedGoogleToken> {
  if (!refreshToken) {
    throw new GoogleOAuthError(
      "invalid_grant",
      "Refresh token ausente ou inválido.",
    );
  }

  const config = requireGoogleOAuthConfig();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetchWithTimeout(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const payload = await parseJson(response);

  if (!response.ok) {
    throw errorFromResponse(response.status, payload, "invalid_grant");
  }

  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  const expiresIn = Number(payload.expires_in);
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new GoogleOAuthError(
      "invalid_grant",
      "O Google não retornou um access_token renovado.",
      { httpStatus: response.status },
    );
  }

  return {
    access_token: accessToken,
    expires_in: expiresIn,
    token_type:
      typeof payload.token_type === "string" ? payload.token_type : "Bearer",
    scope: typeof payload.scope === "string" ? payload.scope : undefined,
  };
}

/** Revoga o refresh token no Google (idempotente). */
export async function revokeToken(token: string): Promise<void> {
  if (!token) {
    throw new GoogleOAuthError("revocation_failed", "Token ausente para revogação.");
  }

  const body = new URLSearchParams({ token });
  const response = await fetchWithTimeout(GOOGLE_REVOKE_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok && response.status !== 400) {
    throw new GoogleOAuthError(
      "revocation_failed",
      "O Google recusou a revogação da autorização.",
      { httpStatus: response.status },
    );
  }
  // 400 invalid_token significa que o token já não era válido: tratamos como
  // revogação concluída para que o usuário possa se desconectar localmente.
}

/** Obtém o perfil do usuário a partir do access token. */
export async function getGoogleUserProfile(
  accessToken: string,
): Promise<GoogleUserProfile> {
  if (!accessToken) {
    throw new GoogleOAuthError("invalid_token", "Access token ausente.");
  }

  const response = await fetchWithTimeout(GOOGLE_USERINFO_ENDPOINT, {
    method: "GET",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload = await parseJson(response);

  if (!response.ok) {
    throw errorFromResponse(response.status, payload, "invalid_token");
  }

  const id = typeof payload.sub === "string" ? payload.sub : "";
  const email = typeof payload.email === "string" ? payload.email : "";
  if (!id || !email) {
    throw new GoogleOAuthError(
      "invalid_token",
      "O Google não retornou um perfil de usuário válido.",
      { httpStatus: response.status },
    );
  }

  const name =
    typeof payload.name === "string" && payload.name.trim()
      ? payload.name.trim()
      : email.split("@")[0];

  return {
    id,
    email: email.toLowerCase(),
    name,
    ...(typeof payload.picture === "string" ? { picture: payload.picture } : {}),
  };
}
