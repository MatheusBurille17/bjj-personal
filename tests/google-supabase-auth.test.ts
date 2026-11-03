import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const client = {
    auth: {
      signInWithOAuth: vi.fn(),
      exchangeCodeForSession: vi.fn(),
      updateUser: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(),
  };
  return { client, cookieJar: new Map<string, string>() };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      state.cookieJar.has(name)
        ? { name, value: state.cookieJar.get(name) as string }
        : undefined,
    set: (name: string, value: string) => {
      state.cookieJar.set(name, value);
    },
    delete: (name: string) => {
      state.cookieJar.delete(name);
    },
  }),
}));

const sessionMocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getUserRoles: vi.fn(),
  createSessionCookie: vi.fn(),
}));

const tokenMocks = vi.hoisted(() => ({
  storeProviderTokens: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => state.client,
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentSession: sessionMocks.getCurrentSession,
  getUserRoles: sessionMocks.getUserRoles,
  createSessionCookie: sessionMocks.createSessionCookie,
}));

vi.mock("@/lib/services/google-supabase-token.service", () => ({
  PROVIDER_TOKEN_TTL_SECONDS: 3600,
  isSupabaseConfiguredForGoogle: () => true,
  hasExistingGoogleTokens: async () => false,
  storeProviderTokens: tokenMocks.storeProviderTokens,
}));

vi.mock("@/lib/services/oauth-audit-supabase.service", () => ({
  logOAuthAuditSupabase: vi.fn(async () => undefined),
}));

import {
  beginSupabaseGoogleAuthorization,
  buildGoogleCallbackUrl,
  completeSupabaseGoogleAuthorization,
  consumeGoogleOAuthIntent,
  getSupabaseGoogleScopes,
} from "@/lib/services/google-supabase-auth.service";

function queryBuilder() {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  builder.upsert = vi.fn(async () => ({ data: null, error: null }));
  builder.update = vi.fn(() => builder);
  builder.delete = vi.fn(() => builder);
  return builder;
}

function request(url = "https://app.example.com/api/auth/google/authorize") {
  return new Request(url);
}

describe("Supabase Google Auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    process.env.GOOGLE_OAUTH_SCOPES = "";
    state.client.from.mockImplementation(() => queryBuilder());
    state.client.auth.signInWithOAuth.mockResolvedValue({
      data: { url: "https://project.supabase.co/auth/v1/authorize?provider=google" },
      error: null,
    });
    state.client.auth.updateUser.mockResolvedValue({ data: { user: {} }, error: null });
    state.client.auth.signOut.mockResolvedValue({ error: null });
    sessionMocks.getCurrentSession.mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
    });
    sessionMocks.getUserRoles.mockResolvedValue({
      is_teacher: true,
      is_student: false,
    });
    sessionMocks.createSessionCookie.mockResolvedValue(0);
    tokenMocks.storeProviderTokens.mockResolvedValue(undefined);
  });

  it("usa drive.file por padrão e respeita GOOGLE_OAUTH_SCOPES", () => {
    const scopes = getSupabaseGoogleScopes();
    expect(scopes).toContain("https://www.googleapis.com/auth/drive.file");
    expect(scopes).not.toContain("https://www.googleapis.com/auth/drive");

    process.env.GOOGLE_OAUTH_SCOPES = "openid email";
    expect(getSupabaseGoogleScopes()).toEqual(["openid", "email"]);
  });

  it("monta um callback limpo, sem query string", () => {
    const url = new URL(
      buildGoogleCallbackUrl({
        request: request(),
        callbackPath: "/api/auth/google/callback",
      }),
    );
    expect(url.origin).toBe("https://app.example.com");
    expect(url.pathname).toBe("/api/auth/google/callback");
    expect(url.search).toBe("");
  });

  it("guarda e consome o intent em cookie de uso único", async () => {
    await beginSupabaseGoogleAuthorization({
      request: request(),
      redirectPath: "/portal/profile",
      connectMode: true,
    });

    const intent = await consumeGoogleOAuthIntent();
    expect(intent).toMatchObject({
      next: "/portal/profile",
      connect: true,
    });
    expect(await consumeGoogleOAuthIntent()).toBeNull();
  });

  it("inicia login com signInWithOAuth e escopos offline", async () => {
    const url = await beginSupabaseGoogleAuthorization({
      request: request(),
      redirectPath: "/dashboard",
    });

    expect(url).toContain("supabase.co/auth/v1/authorize");
    expect(state.client.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
    const call = state.client.auth.signInWithOAuth.mock.calls[0][0];
    expect(call.provider).toBe("google");
    expect(call.options.scopes).toContain(
      "https://www.googleapis.com/auth/drive.file",
    );
    expect(call.options.queryParams).toMatchObject({
      access_type: "offline",
      prompt: "consent",
    });
    expect(call.options.redirectTo).toBe(
      "https://app.example.com/api/auth/google/callback",
    );
  });

  it("conecta via signInWithOAuth, guarda o e-mail e exige sessão", async () => {
    await beginSupabaseGoogleAuthorization({
      request: request(),
      connectMode: true,
      redirectPath: "/settings",
    });
    expect(state.client.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(await consumeGoogleOAuthIntent()).toMatchObject({
      connect: true,
      email: "user@example.com",
      userId: "user-1",
    });

    sessionMocks.getCurrentSession.mockResolvedValue(null);
    await expect(
      beginSupabaseGoogleAuthorization({
        request: request(),
        connectMode: true,
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("rejeita connect quando o e-mail do Google é diferente", async () => {
    state.client.auth.exchangeCodeForSession.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "outra@example.com",
          created_at: "2026-01-01T00:00:00.000Z",
          last_sign_in_at: "2026-11-01T00:00:00.000Z",
          user_metadata: {},
          identities: [],
        },
        session: null,
      },
      error: null,
    });

    await expect(
      completeSupabaseGoogleAuthorization({
        code: "code-x",
        connectMode: true,
        connectEmail: "user@example.com",
      }),
    ).rejects.toMatchObject({
      status: 409,
      details: { error: "email_mismatch_on_connect" },
    });
    expect(state.client.auth.signOut).toHaveBeenCalled();
  });

  it("conclui o callback, cria professor e persiste tokens do provider", async () => {
    const now = new Date().toISOString();
    state.client.auth.exchangeCodeForSession.mockResolvedValue({
      data: {
        user: {
          id: "user-new",
          email: "novo@example.com",
          created_at: now,
          last_sign_in_at: now,
          user_metadata: {
            full_name: "Novo Professor",
            avatar_url: "https://example.com/a.png",
            sub: "google-123",
          },
          identities: [{ provider: "google", identity_data: { sub: "google-123" } }],
        },
        session: {
          provider_token: "ya29.access",
          provider_refresh_token: "1//refresh",
        },
      },
      error: null,
    });

    const result = await completeSupabaseGoogleAuthorization({
      code: "code-1",
    });

    expect(result).toMatchObject({
      userId: "user-new",
      isNewUser: true,
      activeRole: "teacher",
    });
    expect(sessionMocks.createSessionCookie).toHaveBeenCalledWith(
      "user-new",
      "teacher",
    );
    expect(tokenMocks.storeProviderTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-new",
        accessToken: "ya29.access",
        refreshToken: "1//refresh",
        email: "novo@example.com",
      }),
    );
  });

  it("mantém o papel de aluno para usuário existente", async () => {
    state.client.from.mockImplementation(() => {
      const builder = queryBuilder();
      builder.maybeSingle = vi.fn(async () => ({
        data: { id: "user-student" },
        error: null,
      }));
      return builder;
    });
    sessionMocks.getUserRoles.mockResolvedValue({
      is_teacher: false,
      is_student: true,
    });
    state.client.auth.exchangeCodeForSession.mockResolvedValue({
      data: {
        user: {
          id: "user-student",
          email: "aluno@example.com",
          created_at: "2026-01-01T00:00:00.000Z",
          last_sign_in_at: "2026-11-01T00:00:00.000Z",
          user_metadata: {},
          identities: [],
        },
        session: null,
      },
      error: null,
    });

    const result = await completeSupabaseGoogleAuthorization({ code: "code-2" });
    expect(result.activeRole).toBe("student");
    expect(result.isNewUser).toBe(false);
    expect(sessionMocks.createSessionCookie).toHaveBeenCalledWith(
      "user-student",
      "student",
    );
  });
});
