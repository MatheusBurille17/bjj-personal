import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";

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
import { login } from "@/lib/services/auth.service";
import { clearSessionCookie } from "@/lib/auth/session";
import { resetRateLimitStore, checkRateLimit } from "@/lib/middleware/rate-limit";
import { encrypt, decrypt, resetTokenEncryptionCache } from "@/lib/services/token-encryption.service";
import {
  createOAuthState,
  generateCodeVerifier,
  validateOAuthStateRecord,
} from "@/lib/services/oauth-state.service";
import {
  decryptTokens,
  disconnectGoogleAccount,
  exchangeCodeForTokens,
  generateAuthorizationUrl,
  getGoogleOAuthStatus,
  getUserGoogleOAuth,
  refreshUserGoogleToken,
  resetUsedAuthorizationCodes,
  signInWithGoogleProfile,
  storeGoogleOAuth,
} from "@/lib/services/google-auth.service";
import type { GoogleOAuthCredential } from "@/types/google-oauth";

const SCOPES = [
  "openid",
  "profile",
  "email",
  "https://www.googleapis.com/auth/drive",
];

function makeCredential(
  overrides: Partial<GoogleOAuthCredential> = {},
): GoogleOAuthCredential {
  return {
    access_token: "ya29.access-token-property-tests",
    refresh_token: "1//refresh-token-property-tests",
    expires_in: 3600,
    token_type: "Bearer",
    scope: SCOPES.join(" "),
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
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
      name: "Usuário de Propriedade",
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
  // Mantém a saída dos testes de propriedade legível; a Property 12 reutiliza
  // este spy para inspecionar todos os logs.
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("propriedades — Google Social Auth", () => {
  it("Property 1: OAuth Authorization URL Generation", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .webPath()
          .map((path) =>
            !path || path.startsWith("//") || !path.startsWith("/")
              ? "/dashboard"
              : path,
          ),
        fc.boolean(),
        async (redirectPath, connectMode) => {
          const first = await generateAuthorizationUrl({
            redirectPath,
            connectMode,
          });
          const second = await generateAuthorizationUrl({
            redirectPath,
            connectMode,
          });
          expect(first.state).not.toBe(second.state);

          const url = new URL(first.url);
          expect(url.searchParams.get("client_id")).toBeTruthy();
          expect(url.searchParams.get("redirect_uri")).toBe(
            process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI,
          );
          expect(url.searchParams.get("response_type")).toBe("code");
          expect(url.searchParams.get("scope")).toBe(SCOPES.join(" "));
          expect(url.searchParams.get("state")).toBe(first.state);
          expect(url.searchParams.get("code_challenge")).toBeTruthy();
          expect(url.searchParams.get("code_challenge_method")).toBe("S256");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 2: Token Encryption Round Trip", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 50, maxLength: 2000 }),
        async (token) => {
          const { encrypted, iv } = await encrypt(token);
          expect(await decrypt(encrypted, iv)).toBe(token);
          expect(Buffer.from(iv, "base64")).toHaveLength(12);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 3: Authorization Code Validation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (!url.includes("oauth2.googleapis.com/token")) {
          throw new Error(`URL inesperada: ${url}`);
        }
        const body = new URLSearchParams(String(init?.body ?? ""));
        const code = body.get("code") ?? "";
        if (!code.startsWith("valid-")) {
          return jsonResponse({ error: "invalid_grant" }, 400);
        }
        return jsonResponse({
          access_token: `ya29.${code}`,
          refresh_token: `1//${code}`,
          expires_in: 3600,
          token_type: "Bearer",
          scope: SCOPES.join(" "),
        });
      }),
    );

    const verifier = generateCodeVerifier();
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.string({ minLength: 1, maxLength: 30 }).map((value) => `valid-${value}`),
          fc
            .string({ minLength: 1, maxLength: 30 })
            .filter((value) => !value.startsWith("valid-")),
        ),
        async (code) => {
          resetUsedAuthorizationCodes();
          if (code.startsWith("valid-")) {
            const credential = await exchangeCodeForTokens(code, verifier);
            expect(credential.access_token).toBe(`ya29.${code}`);
            expect(credential.refresh_token).toBe(`1//${code}`);
            expect(credential.expires_in).toBe(3600);
          } else {
            await expect(
              exchangeCodeForTokens(code, verifier),
            ).rejects.toMatchObject({ name: "GoogleOAuthError" });
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 4: Automatic Signup for New Google Users", async () => {
    let counter = 0;
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc
          .string({ minLength: 2, maxLength: 40 })
          .filter((name) => name.trim().length >= 2),
        fc.option(fc.webUrl(), { nil: undefined }),
        async (uuid, name, picture) => {
          counter += 1;
          const unique = `${uuid}-${counter}`;
          const email = `new-${unique}@example.com`;
          const result = await signInWithGoogleProfile({
            profile: {
              id: `google-${unique}`,
              email,
              name,
              ...(picture ? { picture } : {}),
            },
            credential: makeCredential(),
          });

          expect(result.isNewUser).toBe(true);
          expect(result.auth.session.access_token).toBeTruthy();
          const db = getDb();
          const users = db.users.filter((user) => user.email === email);
          expect(users).toHaveLength(1);
          const profile = db.profiles.find((item) => item.id === users[0].id);
          expect(profile?.full_name).toBe(name.trim());
          expect(profile?.avatar_url).toBe(picture ?? null);
          expect(db.teachers.some((teacher) => teacher.id === users[0].id)).toBe(true);
          expect(getUserGoogleOAuth(users[0].id)?.is_connected).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 5: Email Matching for Connect Mode", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .emailAddress()
          .map((email) => email.toLowerCase())
          .filter((email) => email !== "professor@bjj.app"),
        async (otherEmail) => {
          await expect(
            signInWithGoogleProfile({
              profile: {
                id: `google-other-${otherEmail}`,
                email: otherEmail,
                name: "Outra Conta",
              },
              credential: makeCredential(),
              connectMode: true,
              currentUserId: DEMO_IDS.teacher,
            }),
          ).rejects.toMatchObject({ status: 409 });

          const connected = await signInWithGoogleProfile({
            profile: {
              id: "google-professor-property",
              email: "professor@bjj.app",
              name: "Prof. Rafael",
            },
            credential: makeCredential(),
            connectMode: true,
            currentUserId: DEMO_IDS.teacher,
          });
          expect(connected.isConnectMode).toBe(true);
          expect(connected.userId).toBe(DEMO_IDS.teacher);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 6: Refresh Token Round Trip", async () => {
    let counter = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (!url.includes("oauth2.googleapis.com/token")) {
          throw new Error(`URL inesperada: ${url}`);
        }
        counter += 1;
        return jsonResponse({
          access_token: `ya29.refreshed-${counter}`,
          expires_in: 3600,
          token_type: "Bearer",
        });
      }),
    );

    await fc.assert(
      fc.asyncProperty(fc.uuid(), fc.integer({ min: -3600, max: 299 }), async (userId, offsetSeconds) => {
        await connectUser(userId, `refresh-${userId}@example.com`);
        const beforeEncrypted = getUserGoogleOAuth(userId)!.encrypted_access_token;
        const previousExpiry = new Date(Date.now() + offsetSeconds * 1000).toISOString();
        // Ajusta a expiração para simular token vencido/próximo de vencer.
        const db = getDb();
        const record = db.user_google_oauth.find((item) => item.user_id === userId)!;
        record.token_expiry_at = previousExpiry;

        const result = await refreshUserGoogleToken(userId);
        expect(result.token_refreshed).toBe(true);
        expect(new Date(result.expires_at).getTime()).toBeGreaterThan(Date.now());
        const updated = getUserGoogleOAuth(userId)!;
        expect(updated.encrypted_access_token).not.toBe(beforeEncrypted);
        const tokens = await decryptTokens(updated);
        expect(tokens.access_token.startsWith("ya29.refreshed-")).toBe(true);
        expect(tokens.refresh_token).toBe("1//refresh-token-property-tests");
      }),
      { numRuns: 100 },
    );
  });

  it("Property 7: Disconnect Token Cleanup", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (!url.includes("oauth2.googleapis.com/revoke")) {
          throw new Error(`URL inesperada: ${url}`);
        }
        return new Response("", { status: 200 });
      }),
    );

    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (userId) => {
        await connectUser(userId, `disconnect-${userId}@example.com`);
        expect(getUserGoogleOAuth(userId)?.is_connected).toBe(true);

        const result = await disconnectGoogleAccount(userId);
        expect(result.connected).toBe(false);
        const record = getUserGoogleOAuth(userId)!;
        expect(record.is_connected).toBe(false);
        expect(record.encrypted_access_token).toBe("");
        expect(record.encrypted_refresh_token).toBe("");
        expect(record.token_iv).toBe("");
      }),
      { numRuns: 100 },
    );
  });

  it("Property 8: CSRF State Parameter Validation", () => {
    fc.assert(
      fc.property(fc.boolean(), (matches) => {
        const stored = createOAuthState({ redirectPath: "/dashboard" });
        const received = matches ? stored.state : `${stored.state}-adulterado`;
        const result = validateOAuthStateRecord(stored, received);
        expect(result.valid).toBe(matches);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 9: Rate Limiting on Authentication Endpoints", () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.integer({ min: 1, max: 25 }),
        (ip, requests) => {
          resetRateLimitStore();
          const results = Array.from({ length: requests }, (_, index) =>
            checkRateLimit(`oauth:${ip}`, {
              limit: 10,
              windowMs: 60_000,
              now: 1_000 + index,
            }),
          );
          results.forEach((result, index) => {
            expect(result.allowed).toBe(index < 10);
          });
        },
      ),
      { numRuns: 50 },
    );
  });

  it("Property 10: Multi-Auth Session Consistency", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (googleId) => {
        const emailLogin = await login({
          email: "professor@bjj.app",
          password: "senha12345",
        });
        expect(emailLogin.session.access_token).toBeTruthy();
        expect(emailLogin.active_role).toBe("teacher");

        await clearSessionCookie();
        const googleLogin = await signInWithGoogleProfile({
          profile: {
            id: `google-${googleId}`,
            email: "professor@bjj.app",
            name: "Prof. Rafael",
          },
          credential: makeCredential(),
        });
        expect(googleLogin.auth.session.access_token).toBeTruthy();
        expect(googleLogin.userId).toBe(DEMO_IDS.teacher);

        // Logout não remove os tokens Google armazenados.
        await clearSessionCookie();
        expect(getUserGoogleOAuth(DEMO_IDS.teacher)?.is_connected).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 11: Refresh Failure Disconnects Account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (!url.includes("oauth2.googleapis.com/token")) {
          throw new Error(`URL inesperada: ${url}`);
        }
        return jsonResponse({ error: "invalid_grant" }, 400);
      }),
    );

    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (userId) => {
        await connectUser(
          userId,
          `revoked-${userId}@example.com`,
          makeCredential({ expires_in: 60 }),
        );
        await expect(refreshUserGoogleToken(userId)).rejects.toMatchObject({
          status: 401,
          details: { error: "token_refresh_failed" },
        });
        const record = getUserGoogleOAuth(userId)!;
        expect(record.is_connected).toBe(false);
        expect(record.encrypted_access_token).toBe("");
        expect(record.encrypted_refresh_token).toBe("");
      }),
      { numRuns: 100 },
    );
  });

  it("Property 12: Token Not Exposed in Logs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (!url.includes("oauth2.googleapis.com/revoke")) {
          throw new Error(`URL inesperada: ${url}`);
        }
        return new Response("", { status: 200 });
      }),
    );

    const consoleSpies = (["log", "info", "warn", "error"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );

    function capturedLogs(): string {
      return consoleSpies
        .flatMap((spy) => spy.mock.calls)
        .map((args) =>
          args
            .map((value) =>
              typeof value === "string" ? value : JSON.stringify(value),
            )
            .join(" "),
        )
        .join("\n");
    }

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 10, maxLength: 60 }).map((value) => `ya29.${value}`),
        fc.string({ minLength: 10, maxLength: 60 }).map((value) => `1//${value}`),
        async (userId, accessToken, refreshToken) => {
          const email = `logs-${userId}@example.com`;
          await storeGoogleOAuth(userId, {
            googleProfile: {
              id: `google-${userId}`,
              email,
              name: "Usuário Logs",
            },
            credential: makeCredential({
              access_token: accessToken,
              refresh_token: refreshToken,
            }),
            scopes: SCOPES,
          });

          const status = getGoogleOAuthStatus(userId);
          expect(JSON.stringify(status)).not.toContain(accessToken);
          expect(JSON.stringify(status)).not.toContain(refreshToken);

          await disconnectGoogleAccount(userId);
          expect(getUserGoogleOAuth(userId)?.is_connected).toBe(false);

          const logs = capturedLogs();
          expect(logs).not.toContain(accessToken);
          expect(logs).not.toContain(refreshToken);
          expect(logs).not.toContain("ya29.");
          expect(logs).not.toContain("1//");
        },
      ),
      { numRuns: 100 },
    );
  });
});
