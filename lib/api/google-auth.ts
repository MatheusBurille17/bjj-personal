import { ApiClientError, apiFetch } from "./client";

export interface BeginGoogleAuthorizationOptions {
  redirectPath?: string;
  connectMode?: boolean;
}

export interface GoogleDisconnectResponse {
  success: boolean;
  message: string;
  connected: boolean;
  googleEmail: string | null;
  googleName: string | null;
  picture: string | null;
  lastTokenRefreshAt: string | null;
  consentTimestamp: string | null;
  scopesGranted: string[];
  revocation_succeeded: boolean;
}

export interface GoogleTokenRefreshResponse {
  success: boolean;
  token_refreshed: boolean;
  expires_at: string;
}

/** Inicia o fluxo OAuth no servidor e devolve a URL do Google. */
export async function beginGoogleAuthorization(
  options: BeginGoogleAuthorizationOptions = {},
): Promise<string> {
  const params = new URLSearchParams();
  if (options.redirectPath) params.set("redirect_path", options.redirectPath);
  if (options.connectMode) params.set("connect_mode", "true");

  const result = await apiFetch<{ authorization_url: string }>(
    `/api/auth/google/authorize?${params.toString()}`,
    { method: "POST" },
  );
  if (!result.authorization_url) {
    throw new ApiClientError(500, {
      code: "INTERNAL_ERROR",
      message: "O servidor não retornou a URL de autorização do Google.",
    });
  }
  return result.authorization_url;
}

export async function disconnectGoogleAccount(): Promise<GoogleDisconnectResponse> {
  return apiFetch<GoogleDisconnectResponse>("/api/auth/google/disconnect", {
    method: "POST",
  });
}

export async function refreshGoogleToken(): Promise<GoogleTokenRefreshResponse> {
  return apiFetch<GoogleTokenRefreshResponse>("/api/auth/google/token/refresh", {
    method: "POST",
  });
}

/** Extrai um código estável de erro do Google a partir do erro da API. */
export function googleErrorCodeFrom(error: unknown): string {
  if (!(error instanceof ApiClientError)) return "network_error";
  if (error.status === 0) return "network_error";

  const details = error.details as
    | { google_error?: string; error?: string }
    | undefined;
  if (details?.google_error) return details.google_error;
  if (details?.error) return details.error;

  switch (error.code) {
    case "UNAUTHORIZED":
      return "unauthorized";
    case "CONFLICT":
      return "email_mismatch_on_connect";
    case "NOT_FOUND":
      return "not_found";
    case "RATE_LIMITED":
      return "rate_limited";
    case "SERVICE_UNAVAILABLE":
      return "server_error";
    default:
      return "server_error";
  }
}
