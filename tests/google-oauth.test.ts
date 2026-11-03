import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sessionState = vi.hoisted(() => ({ jar: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      sessionState.jar.has(name)
        ? { name, value: sessionState.jar.get(name) as string }
        : undefined,
    set: (name: string, value: string) => {
      sessionState.jar.set(name, value);
    },
    delete: (name: string) => {
      sessionState.jar.delete(name);
    },
    getAll: () =>
      [...sessionState.jar.entries()].map(([name, value]) => ({ name, value })),
  }),
}));

import { createDemoDatabase, DEMO_IDS } from "@/lib/db/seed";
import { getDb, resetDb } from "@/lib/db/store";
import {
  decrypt,
  encrypt,
  resetTokenEncryptionCache,
} from "@/lib/services/token-encryption.service";
import {
  OAUTH_STATE_COOKIE,
  consumeOAuthState,
  createCodeChallenge,
  createOAuthState,
  generateCodeVerifier,
  generateStateParameter,
  readOAuthState,
  storeOAuthState,
  validateOAuthStateRecord,
} from "@/lib/services/oauth-state.service";
import {
  GoogleOAuthError,
} from "@/lib/google-oauth-errors";
import {
  buildGoogleAuthorizationUrl,
  exchangeCodeForTokens as clientExchange,
  getGoogleUserProfile,
  refreshAccessToken as clientRefresh,
  revokeToken,
} from "@/lib/google-oauth-client";
import {
  disconnectGoogleAccount,
  decryptTokens,
  encryptTokens,
  exchangeCodeForTokens,
  generateAuthorizationUrl,
  getGoogleOAuthStatus,
  getUserGoogleOAuth,
  getValidGoogleAccessToken,
  refreshUserGoogleToken,
  resetUsedAuthorizationCodes,
  shouldRefreshToken,
  signInWithGoogleProfile,
  storeGoogleOAuth,
} from "@/lib/services/google-auth.service";
import {
  getOAuthAuditLogs,
} from "@/lib/services/oauth-audit.service";
import { resetRateLimitStore } from "@/lib/middleware/rate-limit";
import {
  assertHttpsUrlInProduction,
  enforceHttpsInProduction,
} from "@/lib/utils/https";
import { signSession, SESSION_COOKIE } from "@/lib/auth/token";
import { POST as authorizePost, GET as authorizeGet } from "@/app/api/auth/google/authorize/route";
import { GET as callbackGet } from "@/app/api/auth/google/callback/route";
import { POST as disconnectPost } from "@/app/api/auth/google/disconnect/route";
import { POST as refreshPost } from "@/app/api/auth/google/token/refresh/route";
import type { GoogleOAuthCredential } from "@/types/google-oauth";

const SCOPES = [
  "openid",
  "profile",
  "email",
  "https://www.googleapis.com/auth/drive",
];

function uniqueEmail(prefix = "google"): string {
  return `${prefix}.${Math.random().toString(36).slice(2)}@example.com`;
}

function makeCredential(
  overrides: Partial<GoogleOAuthCredential> = {},
): GoogleOAuthCredential {
  return {
    access_token: "ya29.access-token-for-tests-1234567890",
    refresh_token: "1//refresh-token-for-tests-1234567890",
    expires_in: 3600,
    token_type: "Bearer",
    scope: SCOPES.join(" "),
    ...overrides,
  };
}

function makeUserInfoBody(overrides: Record<string, unknown> = {}) {
  return {
    sub: "google-user-1",
    email: uniqueEmail("google.user"),
    name: "Google User",
    picture: "https://example.com/picture.png",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface MockGoogleOptions {
  tokenStatus?: number;
  tokenBody?: Record<string, unknown>;
  userInfoStatus?: number;
  userInfoBody?: Record<string, unknown>;
  revokeStatus?: number;
  failNetwork?: boolean;
}

function mockGoogleFetch(options: MockGoogleOptions = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });
    if (options.failNetwork) throw new TypeError("fetch failed");

    if (url.includes("oauth2.googleapis.com/token")) {
      return jsonResponse(
        options.tokenBody ?? {
          access_token: "ya29.exchanged-access-token",
          refresh_token: "1//exchanged-refresh-token",
          expires_in: 3600,
          token_type: "Bearer",
          scope: SCOPES.join(" "),
        },
        options.tokenStatus ?? 200,
      );
    }
    if (url.includes("openidconnect.googleapis.com")) {
      return jsonResponse(
        options.userInfoBody ?? makeUserInfoBody(),
        options.userInfoStatus ?? 200,
      );
    }
    if (url.includes("oauth2.googleapis.com/revoke")) {
      return new Response(
        options.revokeStatus === 200 || options.revokeStatus === undefined
          ? ""
          : JSON.stringify({ error: "invalid_token" }),
        { status: options.revokeStatus ?? 200 },
      );
    }
    throw new Error(`URL inesperada no mock: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

function apiRequest(
  path: string,
  init: RequestInit = {},
): Request {
  return new Request(`http://localhost${path}`, init);
}

async function json(response: Response): Promise<any> {
  return (await response.json()) as any;
}

async function authenticate(
  userId: string = DEMO_IDS.teacher,
  role: "teacher" | "student" = "teacher",
) {
  const token = await signSession({
    sub: userId,
    role,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  sessionState.jar.set(SESSION_COOKIE, token);
}

async function primeOAuthState(options?: {
  redirectPath?: string;
  connectMode?: boolean;
  now?: number;
}) {
  const state = createOAuthState({
    redirectPath: options?.redirectPath ?? "/dashboard",
    connectMode: options?.connectMode ?? false,
    now: options?.now,
  });
  await storeOAuthState(state);
  return state;
}

async function connectUser(
  userId: string,
  email: string,
  credential = makeCredential(),
  googleId = `google-${userId}`,
) {
  return storeGoogleOAuth(userId, {
    googleProfile: {
      id: googleId,
      email,
      name: "Usuário Google",
      picture: "https://example.com/p.png",
    },
    credential,
    scopes: SCOPES,
  });
}

beforeEach(() => {
  sessionState.jar.clear();
  resetDb(createDemoDatabase());
  resetRateLimitStore();
  resetUsedAuthorizationCodes();
  resetTokenEncryptionCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("unit — HTTPS em produção", () => {
  it("rejeita HTTP e aceita HTTPS/proxy seguro em produção", () => {
    const original = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    try {
      expect(() =>
        enforceHttpsInProduction(new Request("http://app.test/api")),
      ).toThrow(/HTTPS/i);

      expect(() =>
        enforceHttpsInProduction(
          new Request("http://app.test/api", {
            headers: { "x-forwarded-proto": "https" },
          }),
        ),
      ).not.toThrow();

      expect(() =>
        assertHttpsUrlInProduction("http://app.test/api/auth/google/callback"),
      ).toThrow(/HTTPS/i);
      expect(() =>
        assertHttpsUrlInProduction("https://app.test/api/auth/google/callback"),
      ).not.toThrow();
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = original;
    }
  });
});

describe("unit — criptografia de tokens", () => {
  it("faz round-trip e gera IV aleatório por operação", async () => {
    const token = "ya29.token-com-acentuação-e-símbolos-✓-1234567890";
    const first = await encrypt(token);
    const second = await encrypt(token);

    expect(first.iv).not.toBe(second.iv);
    expect(first.encrypted).not.toBe(second.encrypted);
    expect(await decrypt(first.encrypted, first.iv)).toBe(token);
    expect(await decrypt(second.encrypted, second.iv)).toBe(token);
    expect(() => Buffer.from(first.encrypted, "base64")).not.toThrow();
    expect(Buffer.from(first.iv, "base64")).toHaveLength(12);
  });

  it("falha ao descriptografar com a chave errada", async () => {
    const original = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    const { encrypted, iv } = await encrypt("token-secreto-123");
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY =
      "outra-chave-de-teste-com-mais-de-32-caracteres-abcdef";
    resetTokenEncryptionCache();
    await expect(decrypt(encrypted, iv)).rejects.toThrow();
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = original;
    resetTokenEncryptionCache();
  });
});

describe("unit — state e PKCE", () => {
  it("gera state e verifier aleatórios com tamanho adequado", () => {
    const states = new Set(Array.from({ length: 50 }, () => generateStateParameter()));
    const verifiers = new Set(Array.from({ length: 50 }, () => generateCodeVerifier()));
    expect(states.size).toBe(50);
    expect(verifiers.size).toBe(50);
    for (const state of states) expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    for (const verifier of verifiers) {
      expect(verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    }
  });

  it("gera code_challenge S256 conforme RFC 7636", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(await createCodeChallenge(verifier)).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("persiste, valida, expira e consome o state uma única vez", async () => {
    const state = createOAuthState({
      redirectPath: "/settings",
      connectMode: true,
    });
    await storeOAuthState(state);

    const stored = await readOAuthState();
    expect(stored).toMatchObject({
      state: state.state,
      codeVerifier: state.codeVerifier,
      redirectPath: "/settings",
      connectMode: true,
    });

    const valid = await consumeOAuthState(state.state);
    expect(valid.valid).toBe(true);
    expect(sessionState.jar.get(OAUTH_STATE_COOKIE)).toBe("");
    expect((await consumeOAuthState(state.state)).valid).toBe(false);
  });

  it("rejeita state divergente, expirado e inexistente", () => {
    const stored = createOAuthState({ now: Date.now() });
    expect(validateOAuthStateRecord(stored, "outro-state").reason).toBe(
      "state_mismatch",
    );
    expect(validateOAuthStateRecord(null, stored.state).reason).toBe(
      "state_not_found",
    );

    const expired = createOAuthState({ now: Date.now() - 11 * 60 * 1000 });
    expect(
      validateOAuthStateRecord(expired, expired.state, Date.now()).reason,
    ).toBe("state_expired");
  });

  it("rejeita redirect_path aberto ao criar state", () => {
    const state = createOAuthState({ redirectPath: "//evil.example.com" });
    expect(state.redirectPath).toBeUndefined();
  });
});

describe("unit — cliente Google OAuth", () => {
  it("troca code por tokens enviando PKCE e parâmetros corretos", async () => {
    const { calls } = mockGoogleFetch();
    const credential = await clientExchange("auth-code", "verifier-123");
    expect(credential.access_token).toBe("ya29.exchanged-access-token");
    expect(credential.refresh_token).toBe("1//exchanged-refresh-token");
    expect(credential.expires_in).toBe(3600);

    const body = String(calls[0].init?.body);
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code_verifier=verifier-123");
    expect(body).toContain("code=auth-code");
  });

  it("mapeia invalid_grant ao trocar código", async () => {
    mockGoogleFetch({
      tokenStatus: 400,
      tokenBody: { error: "invalid_grant", error_description: "Bad Request" },
    });
    await expect(clientExchange("code", "verifier")).rejects.toMatchObject({
      name: "GoogleOAuthError",
      code: "invalid_grant",
    });
  });

  it("renova access token e revoga refresh token", async () => {
    mockGoogleFetch({
      tokenBody: {
        access_token: "ya29.refreshed",
        expires_in: 1800,
        token_type: "Bearer",
      },
    });
    const refreshed = await clientRefresh("refresh-token");
    expect(refreshed.access_token).toBe("ya29.refreshed");
    expect(refreshed.expires_in).toBe(1800);

    mockGoogleFetch({ revokeStatus: 200 });
    await expect(revokeToken("refresh-token")).resolves.toBeUndefined();
  });

  it("mapeia falhas de revogação e de rede", async () => {
    mockGoogleFetch({ revokeStatus: 500 });
    await expect(revokeToken("refresh-token")).rejects.toMatchObject({
      code: "revocation_failed",
    });

    mockGoogleFetch({ failNetwork: true });
    await expect(clientExchange("code", "verifier")).rejects.toMatchObject({
      code: "network_error",
    });
  });

  it("valida perfil retornado pelo userinfo e exige e-mail", async () => {
    mockGoogleFetch({ userInfoBody: makeUserInfoBody({ email: "A@B.com" }) });
    const profile = await getGoogleUserProfile("access-token");
    expect(profile.email).toBe("a@b.com");
    expect(profile.id).toBe("google-user-1");

    mockGoogleFetch({ userInfoBody: { sub: "x" } });
    await expect(getGoogleUserProfile("access-token")).rejects.toMatchObject({
      code: "invalid_token",
    });
  });

  it("monta URL com client_id, redirect_uri, scope e PKCE", () => {
    const url = new URL(
      buildGoogleAuthorizationUrl({ state: "state", codeChallenge: "challenge" }),
    );
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state");
    expect(url.searchParams.get("code_challenge")).toBe("challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toBe(SCOPES.join(" "));
  });

  it("falha com erro de configuração quando credenciais ausentes", () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const secret = process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(() =>
      buildGoogleAuthorizationUrl({ state: "s", codeChallenge: "c" }),
    ).toThrow(GoogleOAuthError);
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = clientId;
    process.env.GOOGLE_CLIENT_SECRET = secret;
  });
});

describe("unit — serviço Google Auth", () => {
  it("gera URL de autorização com parâmetros obrigatórios e state único", async () => {
    const a = await generateAuthorizationUrl({ redirectPath: "/dashboard" });
    const b = await generateAuthorizationUrl({ redirectPath: "/portal" });
    expect(a.state).not.toBe(b.state);

    const url = new URL(a.url);
    expect(url.searchParams.get("client_id")).toBe(
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    );
    expect(url.searchParams.get("redirect_uri")).toBe(
      process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI,
    );
    expect(url.searchParams.get("scope")).toBe(SCOPES.join(" "));
    expect(url.searchParams.get("state")).toBe(a.state);
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
  });

  it("rejeita redirect_path inválido", async () => {
    await expect(
      generateAuthorizationUrl({ redirectPath: "https://evil.example.com" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("criptografa e descriptografa os dois tokens", async () => {
    const credential = makeCredential();
    const fields = await encryptTokens(credential);
    expect(fields.iv).toBeTruthy();
    const decrypted = await decryptTokens({
      encrypted_access_token: fields.encrypted_access_token,
      encrypted_refresh_token: fields.encrypted_refresh_token,
      token_iv: fields.iv,
    });
    expect(decrypted.access_token).toBe(credential.access_token);
    expect(decrypted.refresh_token).toBe(credential.refresh_token);
  });

  it("armazena conexão, expõe status sem tokens e atualiza registro", async () => {
    const email = uniqueEmail("stored");
    const record = await connectUser(DEMO_IDS.teacher, email);
    expect(record.is_connected).toBe(true);
    expect(record.scopes_granted).toEqual(SCOPES);
    expect(getUserGoogleOAuth(DEMO_IDS.teacher)?.id).toBe(record.id);

    const status = getGoogleOAuthStatus(DEMO_IDS.teacher);
    expect(status.connected).toBe(true);
    expect(status.googleEmail).toBe(email);
    expect(JSON.stringify(status)).not.toContain("ya29.");
    expect(JSON.stringify(status)).not.toContain("refresh-token");
    expect(status).not.toHaveProperty("encrypted_access_token");
  });

  it("identifica quando o token precisa de renovação", () => {
    expect(shouldRefreshToken(new Date(Date.now() + 4 * 60 * 1000))).toBe(true);
    expect(shouldRefreshToken(new Date(Date.now() + 6 * 60 * 1000))).toBe(false);
    expect(shouldRefreshToken(new Date(Date.now() - 1000))).toBe(true);
    expect(shouldRefreshToken("data-inválida")).toBe(true);
  });

  it("cria exatamente um usuário, perfil e professor no primeiro login Google", async () => {
    const email = uniqueEmail("new");
    const result = await signInWithGoogleProfile({
      profile: {
        id: "google-new-user",
        email,
        name: "Novo Aluno Google",
        picture: "https://example.com/new.png",
      },
      credential: makeCredential(),
    });

    expect(result.isNewUser).toBe(true);
    expect(result.auth.active_role).toBe("teacher");
    expect(result.auth.session.access_token).toBeTruthy();

    const db = getDb();
    const users = db.users.filter((user) => user.email === email);
    expect(users).toHaveLength(1);
    expect(db.profiles.find((profile) => profile.id === users[0].id)?.full_name).toBe(
      "Novo Aluno Google",
    );
    expect(db.teachers.some((teacher) => teacher.id === users[0].id)).toBe(true);
    expect(getUserGoogleOAuth(users[0].id)?.is_connected).toBe(true);
  });

  it("reverte o novo usuário quando o armazenamento dos tokens falha", async () => {
    const original = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "chave-curta";
    resetTokenEncryptionCache();
    const email = uniqueEmail("rollback");

    try {
      await expect(
        signInWithGoogleProfile({
          profile: {
            id: "google-rollback",
            email,
            name: "Rollback",
          },
          credential: makeCredential(),
        }),
      ).rejects.toMatchObject({
        status: 500,
        details: { error: "token_storage_failed" },
      });

      const db = getDb();
      expect(db.users.some((user) => user.email === email)).toBe(false);
      expect(db.profiles.some((profile) => profile.email === email)).toBe(false);
      expect(db.user_google_oauth.some((record) => record.email === email)).toBe(false);
    } finally {
      process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = original;
      resetTokenEncryptionCache();
    }
  });

  it("faz login de usuário existente sem duplicar conta", async () => {
    const before = getDb().users.length;
    const result = await signInWithGoogleProfile({
      profile: {
        id: "google-teacher",
        email: "professor@bjj.app",
        name: "Prof. Rafael",
      },
      credential: makeCredential(),
    });
    expect(result.isNewUser).toBe(false);
    expect(result.userId).toBe(DEMO_IDS.teacher);
    expect(getDb().users).toHaveLength(before);
    expect(getUserGoogleOAuth(DEMO_IDS.teacher)?.email).toBe("professor@bjj.app");
  });

  it("valida e-mail no modo connect", async () => {
    await expect(
      signInWithGoogleProfile({
        profile: {
          id: "google-mismatch",
          email: "outra.pessoa@example.com",
          name: "Outra Pessoa",
        },
        credential: makeCredential(),
        connectMode: true,
        currentUserId: DEMO_IDS.teacher,
      }),
    ).rejects.toMatchObject({
      status: 409,
      details: { error: "email_mismatch_on_connect" },
    });

    const connected = await signInWithGoogleProfile({
      profile: {
        id: "google-match",
        email: "professor@bjj.app",
        name: "Prof. Rafael",
      },
      credential: makeCredential(),
      connectMode: true,
      currentUserId: DEMO_IDS.teacher,
    });
    expect(connected.isConnectMode).toBe(true);
    expect(getUserGoogleOAuth(DEMO_IDS.teacher)?.is_connected).toBe(true);
  });

  it("impede vincular a mesma identidade Google a outro usuário", async () => {
    await connectUser(DEMO_IDS.teacher, "professor@bjj.app", makeCredential(), "google-same");
    await expect(
      signInWithGoogleProfile({
        profile: {
          id: "google-same",
          email: "outro@example.com",
          name: "Outro",
        },
        credential: makeCredential(),
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("não renova token fora da janela de 5 minutos", async () => {
    await connectUser(DEMO_IDS.teacher, "professor@bjj.app");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await refreshUserGoogleToken(DEMO_IDS.teacher);
    expect(result.token_refreshed).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renova token próximo da expiração e atualiza o registro", async () => {
    await connectUser(
      DEMO_IDS.teacher,
      "professor@bjj.app",
      makeCredential({ expires_in: 60 }),
    );
    mockGoogleFetch({
      tokenBody: {
        access_token: "ya29.refreshed-access",
        expires_in: 3600,
        token_type: "Bearer",
      },
    });

    const result = await refreshUserGoogleToken(DEMO_IDS.teacher);
    expect(result.token_refreshed).toBe(true);
    const record = getUserGoogleOAuth(DEMO_IDS.teacher)!;
    expect(new Date(result.expires_at).getTime()).toBeGreaterThan(Date.now());
    expect(record.last_token_refresh_at).toBeTruthy();
    const tokens = await decryptTokens(record);
    expect(tokens.access_token).toBe("ya29.refreshed-access");
    expect(tokens.refresh_token).toBe("1//refresh-token-for-tests-1234567890");
  });

  it("desconecta ao falhar refresh com invalid_grant", async () => {
    await connectUser(
      DEMO_IDS.teacher,
      "professor@bjj.app",
      makeCredential({ expires_in: 60 }),
    );
    mockGoogleFetch({
      tokenStatus: 400,
      tokenBody: { error: "invalid_grant" },
    });
    await expect(refreshUserGoogleToken(DEMO_IDS.teacher)).rejects.toMatchObject({
      status: 401,
      details: { error: "token_refresh_failed" },
    });
    const record = getUserGoogleOAuth(DEMO_IDS.teacher)!;
    expect(record.is_connected).toBe(false);
    expect(record.encrypted_access_token).toBe("");
    expect(record.encrypted_refresh_token).toBe("");
  });

  it("desconecta, revoga no Google e limpa tokens", async () => {
    await connectUser(DEMO_IDS.teacher, "professor@bjj.app");
    const { fetchMock } = mockGoogleFetch({ revokeStatus: 200 });
    const result = await disconnectGoogleAccount(DEMO_IDS.teacher);
    expect(result.connected).toBe(false);
    expect(result.revocation_succeeded).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const record = getUserGoogleOAuth(DEMO_IDS.teacher)!;
    expect(record.encrypted_access_token).toBe("");
    expect(record.encrypted_refresh_token).toBe("");
    expect(record.is_connected).toBe(false);
    const audit = getOAuthAuditLogs(DEMO_IDS.teacher);
    expect(audit.some((log) => log.event === "google_disconnected")).toBe(true);
  });

  it("obtém access token válido e renova quando necessário", async () => {
    await connectUser(DEMO_IDS.teacher, "professor@bjj.app");
    await expect(getValidGoogleAccessToken(DEMO_IDS.teacher)).resolves.toBe(
      "ya29.access-token-for-tests-1234567890",
    );

    resetDb(createDemoDatabase());
    await connectUser(
      DEMO_IDS.teacher,
      "professor@bjj.app",
      makeCredential({ expires_in: 60 }),
    );
    mockGoogleFetch({
      tokenBody: {
        access_token: "ya29.valid-after-refresh",
        expires_in: 3600,
        token_type: "Bearer",
      },
    });
    await expect(getValidGoogleAccessToken(DEMO_IDS.teacher)).resolves.toBe(
      "ya29.valid-after-refresh",
    );
  });

  it("rejeita a troca repetida do mesmo authorization code", async () => {
    mockGoogleFetch();
    const verifier = generateCodeVerifier();
    await expect(exchangeCodeForTokens("single-use-code", verifier)).resolves.toBeTruthy();
    await expect(
      exchangeCodeForTokens("single-use-code", verifier),
    ).rejects.toMatchObject({ code: "invalid_code" });
  });
});

describe("api — /api/auth/google/authorize", () => {
  it("retorna URL e persiste state/PKCE no cookie", async () => {
    const response = await authorizePost(
      apiRequest("/api/auth/google/authorize?redirect_path=%2Fdashboard", {
        method: "POST",
        headers: { "x-forwarded-for": "10.0.0.1" },
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("X-RateLimit-Limit")).toBe("10");
    const payload = await json(response);
    const url = new URL(payload.data.authorization_url);
    expect(url.searchParams.get("client_id")).toBeTruthy();
    expect(url.searchParams.get("scope")).toBe(SCOPES.join(" "));
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("code_challenge")).toBeTruthy();

    const stored = await readOAuthState();
    expect(stored?.state).toBe(url.searchParams.get("state"));
    expect(stored?.redirectPath).toBe("/dashboard");
  });

  it("GET redireciona para o Google", async () => {
    const response = await authorizeGet(
      apiRequest("/api/auth/google/authorize", {
        headers: { "x-forwarded-for": "10.0.0.2" },
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain(
      "accounts.google.com/o/oauth2/v2/auth",
    );
  });

  it("rejeita redirect_path externo", async () => {
    const response = await authorizePost(
      apiRequest("/api/auth/google/authorize?redirect_path=%2F%2Fevil.com", {
        method: "POST",
        headers: { "x-forwarded-for": "10.0.0.3" },
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(400);
  });

  it("exige sessão para connect_mode", async () => {
    const response = await authorizePost(
      apiRequest("/api/auth/google/authorize?connect_mode=true", {
        method: "POST",
        headers: { "x-forwarded-for": "10.0.0.4" },
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(401);
  });

  it("retorna 503 quando credenciais Google não estão configuradas", async () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const secret = process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;

    const response = await authorizePost(
      apiRequest("/api/auth/google/authorize", {
        method: "POST",
        headers: { "x-forwarded-for": "10.0.0.5" },
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(503);

    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = clientId;
    process.env.GOOGLE_CLIENT_SECRET = secret;
  });

  it("aplica rate limit por IP e expõe Retry-After", async () => {
    resetRateLimitStore();
    for (let index = 0; index < 10; index += 1) {
      const response = await authorizePost(
        apiRequest("/api/auth/google/authorize", {
          method: "POST",
          headers: { "x-forwarded-for": "10.0.0.9" },
        }),
        { params: Promise.resolve({}) },
      );
      expect(response.status).toBe(200);
    }

    const limited = await authorizePost(
      apiRequest("/api/auth/google/authorize", {
        method: "POST",
        headers: { "x-forwarded-for": "10.0.0.9" },
      }),
      { params: Promise.resolve({}) },
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
    expect(limited.headers.get("X-RateLimit-Remaining")).toBe("0");

    const otherIp = await authorizePost(
      apiRequest("/api/auth/google/authorize", {
        method: "POST",
        headers: { "x-forwarded-for": "10.0.0.10" },
      }),
      { params: Promise.resolve({}) },
    );
    expect(otherIp.status).toBe(200);
  });
});

describe("api — /api/auth/google/callback", () => {
  it("cria novo usuário, armazena tokens criptografados e cria sessão", async () => {
    const state = await primeOAuthState({ redirectPath: "/dashboard" });
    const email = uniqueEmail("callback.new");
    mockGoogleFetch({
      userInfoBody: makeUserInfoBody({ email, name: "Callback Novo" }),
    });

    const response = await callbackGet(
      apiRequest(
        `/api/auth/google/callback?code=code-1&state=${encodeURIComponent(state.state)}`,
        { headers: { "x-forwarded-for": "11.0.0.1" } },
      ),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/dashboard");
    expect(sessionState.jar.get(SESSION_COOKIE)).toBeTruthy();

    const db = getDb();
    const user = db.users.find((item) => item.email === email);
    expect(user).toBeTruthy();
    expect(db.users.filter((item) => item.email === email)).toHaveLength(1);
    const record = getUserGoogleOAuth(user!.id)!;
    expect(record.is_connected).toBe(true);
    expect(record.encrypted_access_token).not.toContain("exchanged-access-token");
    const tokens = await decryptTokens(record);
    expect(tokens.access_token).toBe("ya29.exchanged-access-token");
    expect(tokens.refresh_token).toBe("1//exchanged-refresh-token");
  });

  it("faz login de usuário existente sem criar outro", async () => {
    const state = await primeOAuthState({ redirectPath: "/dashboard" });
    const before = getDb().users.length;
    mockGoogleFetch({
      userInfoBody: makeUserInfoBody({
        email: "professor@bjj.app",
        name: "Prof. Rafael",
      }),
    });

    const response = await callbackGet(
      apiRequest(
        `/api/auth/google/callback?code=code-existing&state=${encodeURIComponent(state.state)}`,
        { headers: { "x-forwarded-for": "11.0.0.2" } },
      ),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(303);
    expect(getDb().users).toHaveLength(before);
    expect(getUserGoogleOAuth(DEMO_IDS.teacher)?.email).toBe("professor@bjj.app");
  });

  it("conecta Google à conta autenticada quando o e-mail coincide", async () => {
    await authenticate(DEMO_IDS.teacher);
    const state = await primeOAuthState({
      redirectPath: "/settings",
      connectMode: true,
    });
    mockGoogleFetch({
      userInfoBody: makeUserInfoBody({ email: "professor@bjj.app" }),
    });

    const response = await callbackGet(
      apiRequest(
        `/api/auth/google/callback?code=code-connect&state=${encodeURIComponent(state.state)}`,
        { headers: { "x-forwarded-for": "11.0.0.3" } },
      ),
      { params: Promise.resolve({}) },
    );

    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/settings");
    expect(location.searchParams.get("google")).toBe("connected");
    expect(getUserGoogleOAuth(DEMO_IDS.teacher)?.is_connected).toBe(true);
  });

  it("rejeita connect com e-mail diferente", async () => {
    await authenticate(DEMO_IDS.teacher);
    const state = await primeOAuthState({
      redirectPath: "/settings",
      connectMode: true,
    });
    mockGoogleFetch({
      userInfoBody: makeUserInfoBody({ email: "outro@example.com" }),
    });

    const response = await callbackGet(
      apiRequest(
        `/api/auth/google/callback?code=code-mismatch&state=${encodeURIComponent(state.state)}`,
        { headers: { "x-forwarded-for": "11.0.0.4" } },
      ),
      { params: Promise.resolve({}) },
    );

    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/settings");
    expect(location.searchParams.get("error")).toBe("email_mismatch_on_connect");
    expect(getUserGoogleOAuth(DEMO_IDS.teacher)).toBeNull();
  });

  it("rejeita state divergente e expirado (CSRF)", async () => {
    const mismatchState = await primeOAuthState();
    const mismatch = await callbackGet(
      apiRequest(
        `/api/auth/google/callback?code=x&state=state-adulterado`,
        { headers: { "x-forwarded-for": "11.0.0.5" } },
      ),
      { params: Promise.resolve({}) },
    );
    expect(new URL(mismatch.headers.get("location")!).searchParams.get("error")).toBe(
      "state_mismatch",
    );
    expect(mismatchState.state).toBeTruthy();

    const expiredState = await primeOAuthState({
      now: Date.now() - 11 * 60 * 1000,
    });
    const expired = await callbackGet(
      apiRequest(
        `/api/auth/google/callback?code=x&state=${encodeURIComponent(expiredState.state)}`,
        { headers: { "x-forwarded-for": "11.0.0.6" } },
      ),
      { params: Promise.resolve({}) },
    );
    expect(new URL(expired.headers.get("location")!).searchParams.get("error")).toBe(
      "state_expired",
    );
  });

  it("trata recusa do usuário e código ausente", async () => {
    const denied = await callbackGet(
      apiRequest("/api/auth/google/callback?error=access_denied", {
        headers: { "x-forwarded-for": "11.0.0.7" },
      }),
      { params: Promise.resolve({}) },
    );
    expect(new URL(denied.headers.get("location")!).pathname).toBe("/login");
    expect(new URL(denied.headers.get("location")!).searchParams.get("error")).toBe(
      "access_denied",
    );

    const state = await primeOAuthState();
    const missing = await callbackGet(
      apiRequest(
        `/api/auth/google/callback?state=${encodeURIComponent(state.state)}`,
        { headers: { "x-forwarded-for": "11.0.0.8" } },
      ),
      { params: Promise.resolve({}) },
    );
    expect(new URL(missing.headers.get("location")!).searchParams.get("error")).toBe(
      "invalid_request",
    );
  });

  it("redireciona com erro quando Google recusa o código ou fica indisponível", async () => {
    const state = await primeOAuthState();
    mockGoogleFetch({
      tokenStatus: 400,
      tokenBody: { error: "invalid_grant" },
    });
    const invalid = await callbackGet(
      apiRequest(
        `/api/auth/google/callback?code=bad&state=${encodeURIComponent(state.state)}`,
        { headers: { "x-forwarded-for": "11.0.0.9" } },
      ),
      { params: Promise.resolve({}) },
    );
    expect(new URL(invalid.headers.get("location")!).searchParams.get("error")).toBe(
      "invalid_grant",
    );

    const networkState = await primeOAuthState();
    mockGoogleFetch({ failNetwork: true });
    const network = await callbackGet(
      apiRequest(
        `/api/auth/google/callback?code=any&state=${encodeURIComponent(networkState.state)}`,
        { headers: { "x-forwarded-for": "11.0.0.10" } },
      ),
      { params: Promise.resolve({}) },
    );
    expect(new URL(network.headers.get("location")!).searchParams.get("error")).toBe(
      "network_error",
    );
  });
});

describe("api — desconexão e refresh", () => {
  it("desconecta usuário autenticado e cria auditoria sem tokens", async () => {
    await authenticate(DEMO_IDS.teacher);
    await connectUser(DEMO_IDS.teacher, "professor@bjj.app");
    mockGoogleFetch({ revokeStatus: 200 });

    const response = await disconnectPost(
      apiRequest("/api/auth/google/disconnect", {
        method: "POST",
        headers: { "x-forwarded-for": "12.0.0.1" },
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(200);
    const payload = await json(response);
    expect(payload.data.success).toBe(true);
    expect(JSON.stringify(payload)).not.toContain("ya29.");
    expect(JSON.stringify(payload)).not.toContain("refresh-token");

    const record = getUserGoogleOAuth(DEMO_IDS.teacher)!;
    expect(record.is_connected).toBe(false);
    expect(record.encrypted_access_token).toBe("");
    expect(
      getOAuthAuditLogs(DEMO_IDS.teacher).some(
        (log) => log.event === "google_disconnected" && log.success,
      ),
    ).toBe(true);
  });

  it("retorna 401 sem sessão e 404 sem conexão Google", async () => {
    const unauthorized = await disconnectPost(
      apiRequest("/api/auth/google/disconnect", {
        method: "POST",
        headers: { "x-forwarded-for": "12.0.0.2" },
      }),
      { params: Promise.resolve({}) },
    );
    expect(unauthorized.status).toBe(401);

    await authenticate(DEMO_IDS.teacher);
    const missing = await disconnectPost(
      apiRequest("/api/auth/google/disconnect", {
        method: "POST",
        headers: { "x-forwarded-for": "12.0.0.3" },
      }),
      { params: Promise.resolve({}) },
    );
    expect(missing.status).toBe(404);
  });

  it("limpa tokens mesmo se a revogação no Google falhar", async () => {
    await authenticate(DEMO_IDS.teacher);
    await connectUser(DEMO_IDS.teacher, "professor@bjj.app");
    mockGoogleFetch({ revokeStatus: 500 });

    const response = await disconnectPost(
      apiRequest("/api/auth/google/disconnect", {
        method: "POST",
        headers: { "x-forwarded-for": "12.0.0.4" },
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(200);
    expect((await json(response)).data.revocation_succeeded).toBe(false);
    expect(getUserGoogleOAuth(DEMO_IDS.teacher)?.is_connected).toBe(false);
    expect(getUserGoogleOAuth(DEMO_IDS.teacher)?.encrypted_access_token).toBe("");
  });

  it("não renova token válido e renova token prestes a expirar", async () => {
    await authenticate(DEMO_IDS.teacher);
    await connectUser(DEMO_IDS.teacher, "professor@bjj.app");
    vi.stubGlobal("fetch", vi.fn());

    const first = await refreshPost(
      apiRequest("/api/auth/google/token/refresh", {
        method: "POST",
        headers: { "x-forwarded-for": "13.0.0.1" },
      }),
      { params: Promise.resolve({}) },
    );
    expect(first.status).toBe(200);
    expect((await json(first)).data.token_refreshed).toBe(false);

    resetDb(createDemoDatabase());
    await authenticate(DEMO_IDS.teacher);
    await connectUser(
      DEMO_IDS.teacher,
      "professor@bjj.app",
      makeCredential({ expires_in: 60 }),
    );
    mockGoogleFetch({
      tokenBody: {
        access_token: "ya29.endpoint-refreshed",
        expires_in: 3600,
        token_type: "Bearer",
      },
    });

    const second = await refreshPost(
      apiRequest("/api/auth/google/token/refresh", {
        method: "POST",
        headers: { "x-forwarded-for": "13.0.0.2" },
      }),
      { params: Promise.resolve({}) },
    );
    expect(second.status).toBe(200);
    const payload = await json(second);
    expect(payload.data.token_refreshed).toBe(true);
    expect(new Date(payload.data.expires_at).getTime()).toBeGreaterThan(Date.now());
    expect(
      (await decryptTokens(getUserGoogleOAuth(DEMO_IDS.teacher)!)).access_token,
    ).toBe("ya29.endpoint-refreshed");
  });

  it("retorna 401 sem sessão e 404 sem conexão no refresh", async () => {
    const unauthorized = await refreshPost(
      apiRequest("/api/auth/google/token/refresh", {
        method: "POST",
        headers: { "x-forwarded-for": "13.0.0.3" },
      }),
      { params: Promise.resolve({}) },
    );
    expect(unauthorized.status).toBe(401);

    await authenticate(DEMO_IDS.teacher);
    const missing = await refreshPost(
      apiRequest("/api/auth/google/token/refresh", {
        method: "POST",
        headers: { "x-forwarded-for": "13.0.0.4" },
      }),
      { params: Promise.resolve({}) },
    );
    expect(missing.status).toBe(404);
  });
});

describe("integração — fluxos completos com Google mockado", () => {
  it("7.1 login de novo usuário via Google", async () => {
    const authorize = await authorizePost(
      apiRequest("/api/auth/google/authorize?redirect_path=%2Fdashboard", {
        method: "POST",
        headers: { "x-forwarded-for": "20.0.0.1" },
      }),
      { params: Promise.resolve({}) },
    );
    const googleUrl = new URL((await json(authorize)).data.authorization_url);
    const state = googleUrl.searchParams.get("state")!;

    mockGoogleFetch({
      userInfoBody: makeUserInfoBody({ email: uniqueEmail("e2e") }),
    });
    const callback = await callbackGet(
      apiRequest(
        `/api/auth/google/callback?code=e2e-login&state=${encodeURIComponent(state)}`,
        { headers: { "x-forwarded-for": "20.0.0.1" } },
      ),
      { params: Promise.resolve({}) },
    );
    expect(callback.status).toBe(303);
    expect(new URL(callback.headers.get("location")!).pathname).toBe("/dashboard");
    expect(sessionState.jar.get(SESSION_COOKIE)).toBeTruthy();
  });

  it("7.2 cadastro via Google cria conta e redireciona", async () => {
    const state = await primeOAuthState({ redirectPath: "/dashboard" });
    const email = uniqueEmail("e2e.signup");
    mockGoogleFetch({
      userInfoBody: makeUserInfoBody({ email, name: "Cadastro E2E" }),
    });
    const callback = await callbackGet(
      apiRequest(
        `/api/auth/google/callback?code=e2e-signup&state=${encodeURIComponent(state.state)}`,
        { headers: { "x-forwarded-for": "20.0.0.2" } },
      ),
      { params: Promise.resolve({}) },
    );
    expect(callback.status).toBe(303);
    expect(getDb().users.some((user) => user.email === email)).toBe(true);
  });

  it("7.3 conecta Google a conta existente", async () => {
    await authenticate(DEMO_IDS.teacher);
    const state = await primeOAuthState({
      redirectPath: "/settings",
      connectMode: true,
    });
    mockGoogleFetch({
      userInfoBody: makeUserInfoBody({ email: "professor@bjj.app" }),
    });
    const callback = await callbackGet(
      apiRequest(
        `/api/auth/google/callback?code=e2e-connect&state=${encodeURIComponent(state.state)}`,
        { headers: { "x-forwarded-for": "20.0.0.3" } },
      ),
      { params: Promise.resolve({}) },
    );
    expect(callback.status).toBe(303);
    expect(getGoogleOAuthStatus(DEMO_IDS.teacher).connected).toBe(true);
  });

  it("7.4 desconecta mantendo login por e-mail", async () => {
    await authenticate(DEMO_IDS.teacher);
    await connectUser(DEMO_IDS.teacher, "professor@bjj.app");
    mockGoogleFetch({ revokeStatus: 200 });
    const response = await disconnectPost(
      apiRequest("/api/auth/google/disconnect", {
        method: "POST",
        headers: { "x-forwarded-for": "20.0.0.4" },
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(200);
    expect(getGoogleOAuthStatus(DEMO_IDS.teacher).connected).toBe(false);
    expect(getDb().users.some((user) => user.id === DEMO_IDS.teacher)).toBe(true);
  });

  it("7.5 renova token automaticamente antes de usar o Google", async () => {
    await connectUser(
      DEMO_IDS.teacher,
      "professor@bjj.app",
      makeCredential({ expires_in: 180 }),
    );
    mockGoogleFetch({
      tokenBody: {
        access_token: "ya29.e2e-refresh",
        expires_in: 3600,
        token_type: "Bearer",
      },
    });
    const token = await getValidGoogleAccessToken(DEMO_IDS.teacher);
    expect(token).toBe("ya29.e2e-refresh");
    expect(getUserGoogleOAuth(DEMO_IDS.teacher)?.last_token_refresh_at).toBeTruthy();
  });

  it("7.6 trata indisponibilidade do Google sem quebrar o login por e-mail", async () => {
    const state = await primeOAuthState();
    mockGoogleFetch({ tokenStatus: 503, tokenBody: { error: "server_error" } });
    const callback = await callbackGet(
      apiRequest(
        `/api/auth/google/callback?code=e2e-down&state=${encodeURIComponent(state.state)}`,
        { headers: { "x-forwarded-for": "20.0.0.5" } },
      ),
      { params: Promise.resolve({}) },
    );
    const location = new URL(callback.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("server_error");
  });
});
