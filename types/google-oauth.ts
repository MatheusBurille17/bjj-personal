/**
 * Tipos da integração Google OAuth.
 *
 * Os tokens nunca trafegam para o cliente: os tipos "públicos" expõem apenas
 * status, e-mail, nome, foto e datas de consentimento/atualização.
 */

export const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "profile",
  "email",
  "https://www.googleapis.com/auth/drive.file",
] as const;

export type GoogleOAuthScope = (typeof GOOGLE_OAUTH_SCOPES)[number];

export interface GoogleOAuthCredential {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: "Bearer" | string;
  scope: string;
  id_token?: string;
}

export interface GoogleUserProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export interface GoogleOAuthRecord {
  id: string;
  user_id: string;
  google_id: string;
  email: string;
  name: string;
  picture_url?: string | null;
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  /**
   * IVs usados na criptografia AES-256-GCM no formato
   * `<iv-access-token>:<iv-refresh-token>`, ambos em Base64.
   * Um IV distinto por token evita reutilização de nonce.
   */
  token_iv: string;
  token_expiry_at: string;
  is_connected: boolean;
  scopes_granted: string[];
  consent_timestamp: string;
  last_token_refresh_at?: string | null;
  created_at: string;
  updated_at: string;
}

/** Visão segura para a interface — nunca contém tokens ou IVs. */
export interface GoogleOAuthPublicStatus {
  connected: boolean;
  googleEmail: string | null;
  googleName: string | null;
  picture: string | null;
  lastTokenRefreshAt: string | null;
  consentTimestamp: string | null;
  scopesGranted: string[];
}

export interface OAuthState {
  state: string;
  codeVerifier: string;
  redirectPath?: string;
  connectMode: boolean;
  purpose?: "social" | "drive";
  created_at: number;
}

export type OAuthStateErrorCode = "state_mismatch" | "state_expired" | "state_not_found";

export interface OAuthStateValidation {
  valid: boolean;
  reason?: OAuthStateErrorCode;
  state?: OAuthState;
}

export type GoogleOAuthErrorCode =
  | "access_denied"
  | "authorization_pending"
  | "configuration_error"
  | "invalid_client"
  | "invalid_code"
  | "invalid_grant"
  | "invalid_request"
  | "invalid_scope"
  | "invalid_token"
  | "network_error"
  | "revocation_failed"
  | "server_error";

export interface GoogleOAuthErrorResponse {
  error: GoogleOAuthErrorCode | string;
  message: string;
  code: number;
  timestamp: string;
  request_id?: string;
}

export type OAuthAuditEventType =
  | "google_login"
  | "google_signup"
  | "google_connected"
  | "google_disconnected"
  | "google_token_refreshed"
  | "google_code_exchange_failed"
  | "google_refresh_failed"
  | "google_revocation_failed"
  | "google_state_validation_failed"
  | "google_identity_conflict";

export interface OAuthAuditLogRecord {
  id: string;
  user_id: string | null;
  event: OAuthAuditEventType;
  success: boolean;
  ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface UsedOAuthCodeRecord {
  id: string;
  code_hash: string;
  expires_at: string;
  created_at: string;
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface GoogleAuthorizationUrlOptions {
  state: string;
  codeChallenge: string;
  redirectUri?: string;
  clientId?: string;
  scopes?: string[];
  loginHint?: string;
  prompt?: string;
}

export interface GoogleSignInResult {
  auth: import("./auth").AuthResult;
  isNewUser: boolean;
  isConnectMode: boolean;
  userId: string;
}
