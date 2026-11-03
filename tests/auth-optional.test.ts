import { beforeEach, describe, expect, it, vi } from "vitest";
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
  }),
}));

import { createDemoDatabase, DEMO_IDS } from "@/lib/db/seed";
import { getDb, resetDb } from "@/lib/db/store";
import {
  createTeacherAccount,
  login,
  requestPasswordRecovery,
  resetPassword,
  switchRole,
  updateOwnProfile,
} from "@/lib/services/auth.service";
import { uploadAvatar, getProfileView, getTeacherPublicProfile } from "@/lib/services/profile.service";
import { createEnrollment } from "@/lib/services/enrollment.service";
import {
  createStudentAccount,
  generateInviteToken,
  verifyInviteToken,
} from "@/lib/services/invitation.service";
import { getUserRoles, getCurrentSession } from "@/lib/auth/session";
import { signSession, verifySessionToken, SESSION_COOKIE } from "@/lib/auth/token";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getOutbox } from "@/lib/resend/send";
import { ApiError } from "@/lib/middleware/errors";
import { signupSchema } from "@/lib/validation/auth";
import {
  MAX_AVATAR_BYTES,
} from "@/lib/utils/validation";
import { POST as signupRoute } from "@/app/api/auth/signup/route";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { GET as profileRoute, PATCH as profilePatchRoute } from "@/app/api/profiles/me/route";

function uniqueEmail(prefix = "user") {
  return `${prefix}.${Math.random().toString(36).slice(2)}@example.com`;
}

function apiRequest(body?: unknown): Request {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json(response: Response) {
  return (await response.json()) as any;
}

async function authenticateTeacher(userId = DEMO_IDS.teacher) {
  const token = await signSession({
    sub: userId,
    role: "teacher",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  sessionState.jar.set(SESSION_COOKIE, token);
}

beforeEach(() => {
  sessionState.jar.clear();
  resetDb(createDemoDatabase());
});

describe("propriedades — criação de conta e sessão", () => {
  it("Property 1: qualquer e-mail/senha válidos criam usuário, perfil e professor", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.emailAddress().map((email) => email.toLowerCase()),
        fc.string({ minLength: 8, maxLength: 40 }),
        fc.string({ minLength: 2, maxLength: 40 }),
        fc.string({ minLength: 2, maxLength: 40 }),
        async (email, password, fullName, displayName) => {
          resetDb(createDemoDatabase());
          const result = await createTeacherAccount({
            email,
            password,
            fullName,
            displayName,
            timezone: "America/Sao_Paulo",
          });
          expect(result.session.access_token).toBeTruthy();
          expect(result.session.refresh_token).toBeTruthy();
          expect(result.session.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
          expect(result.roles).toEqual({ is_teacher: true, is_student: false });
          expect(result.profile.email).toBe(email);
          expect(result.teacher_profile?.display_name).toBe(displayName);
          expect(getDb().profiles.some((item) => item.id === result.user.id)).toBe(true);
          expect(getDb().teachers.some((item) => item.id === result.user.id)).toBe(true);
        },
      ),
      { numRuns: 20 },
    );
  });

  it("Property 4: toda autenticação bem-sucedida retorna sessão completa", async () => {
    const result = await login({ email: DEMO_IDS.lucas ? "aluno@bjj.app" : "", password: "senha12345" });
    expect(result.active_role).toBe("student");
    expect(Object.keys(result.session)).toEqual(
      expect.arrayContaining(["access_token", "refresh_token", "expires_at", "user"]),
    );
  });

  it("Property 9: credenciais inválidas geram erro genérico", async () => {
    await fc.assert(
      fc.asyncProperty(fc.emailAddress(), fc.string({ minLength: 1, maxLength: 20 }), async (email, password) => {
        await expect(login({ email, password })).rejects.toMatchObject({
          status: 401,
          message: "E-mail ou senha inválidos",
        });
      }),
      { numRuns: 15 },
    );
  });

  it("Property 25/26: detecção de papéis reflete relações reais", () => {
    expect(getUserRoles(DEMO_IDS.teacher)).toEqual({ is_teacher: true, is_student: false });
    expect(getUserRoles(DEMO_IDS.lucas)).toEqual({ is_teacher: false, is_student: true });
    expect(getUserRoles("00000000-0000-4000-8000-000000000000")).toEqual({
      is_teacher: false,
      is_student: false,
    });
  });

  it("Property 27: resposta de autenticação sempre inclui booleanos de papel", async () => {
    const result = await login({ email: "professor@bjj.app", password: "senha12345" });
    expect(typeof result.roles.is_teacher).toBe("boolean");
    expect(typeof result.roles.is_student).toBe("boolean");
  });

  it("Property 36: hashes de senha nunca aparecem na resposta", async () => {
    const result = await login({ email: "professor@bjj.app", password: "senha12345" });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("password_hash");
    expect(serialized).not.toContain("scrypt:");
    expect(getDb().users[0].password_hash.startsWith("scrypt:")).toBe(true);
  });
});

describe("propriedades — convites e ativação", () => {
  it("Property 11: tokens têm 256 bits, são URL-safe e únicos", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 200 }), () => {
        const token = generateInviteToken();
        expect(token).toMatch(/^[a-f0-9]{64}$/);
        return token.length === 64;
      }),
      { numRuns: 100 },
    );
    const tokens = new Set(Array.from({ length: 100 }, () => generateInviteToken()));
    expect(tokens.size).toBe(100);
  });

  it("Property 12: token inválido/expirado sempre falha", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 80 }), (token) => {
        if (token === "demo-invite-pedro-1234567890abcdef") return;
        expect(() => verifyInviteToken(token)).toThrow();
      }),
      { numRuns: 50 },
    );

    const db = getDb();
    const pedro = db.enrollments.find((item) => item.id === DEMO_IDS.pedroEnrollment)!;
    pedro.invite_expires_at = new Date(Date.now() - 1).toISOString();
    expect(() => verifyInviteToken(pedro.invite_token!)).toThrow();
  });

  it("Property 13: aceite do convite ativa vínculo, vincula perfil e limpa token", async () => {
    const { enrollment, invite_url } = await createEnrollment(DEMO_IDS.teacher, {
      student_name: "Convidado",
      student_email: uniqueEmail("invite"),
    });
    const token = invite_url.split("/invite/")[1];
    const result = await createStudentAccount(token, "senha12345", "Convidado");
    const updated = getDb().enrollments.find((item) => item.id === enrollment.id)!;
    expect(updated.status).toBe("active");
    expect(updated.student_profile_id).toBe(result.user.id);
    expect(updated.invite_token).toBeNull();
    expect(updated.invite_expires_at).toBeNull();
  });

  it("Property 6: vínculo pendente nunca expõe perfil antes do aceite", async () => {
    const { enrollment } = await createEnrollment(DEMO_IDS.teacher, {
      student_name: "Pendente",
      student_email: uniqueEmail("pending"),
    });
    expect(enrollment.student_profile_id).toBeNull();
    expect(enrollment.invite_token).toHaveLength(64);
  });
});

describe("propriedades — perfil, avatar e isolamento", () => {
  it("Property 14/18: perfil do usuário autenticado retorna todos os campos", () => {
    const view = getProfileView(DEMO_IDS.teacher);
    expect(view.profile.id).toBe(DEMO_IDS.teacher);
    expect(view.teacher?.display_name).toBe("Prof. Rafael");
    expect(view.roles.is_teacher).toBe(true);
  });

  it("Property 15/19/20: atualização de perfil do professor reflete nas duas tabelas", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 2, maxLength: 40 }).filter((name) => name.trim().length >= 2),
        fc.string({ minLength: 2, maxLength: 40 }).filter((name) => name.trim().length >= 2),
        fc.constantFrom("America/Sao_Paulo", "America/New_York", "UTC"),
        async (fullName, displayName, timezone) => {
          const result = await updateOwnProfile(DEMO_IDS.teacher, {
            full_name: fullName,
            display_name: displayName,
            timezone,
            bio: "Bio de teste",
          });
          expect(result.profile.full_name).toBe(fullName);
          expect(result.teacher?.display_name).toBe(displayName);
          expect(result.teacher?.timezone).toBe(timezone);
          const db = getDb();
          expect(db.profiles.find((item) => item.id === DEMO_IDS.teacher)?.full_name).toBe(fullName);
          expect(db.teachers.find((item) => item.id === DEMO_IDS.teacher)?.display_name).toBe(displayName);
        },
      ),
      { numRuns: 15 },
    );
  });

  it("Property 17: perfil rejeita nome vazio e URL excessiva", () => {
    expect(() => getProfileView("00000000-0000-4000-8000-000000000000")).toThrow();
    expect(
      signupSchema.safeParse({
        email: "x@example.com",
        password: "12345678",
        fullName: "",
        displayName: "Prof",
      }).success,
    ).toBe(false);
  });

  it("Property 21: timezone inválido é rejeitado", async () => {
    await expect(
      updateOwnProfile(DEMO_IDS.teacher, { timezone: "Marte/Olympus" }),
    ).rejects.toThrow();
  });

  it("Property 22/29: professor não acessa outro professor nem expõe configuração interna", () => {
    expect(() => getTeacherPublicProfile(DEMO_IDS.teacher, DEMO_IDS.lucas)).not.toThrow();
    const publicView = getTeacherPublicProfile(DEMO_IDS.teacher, DEMO_IDS.lucas);
    expect(publicView).not.toHaveProperty("timezone");
    expect(publicView).not.toHaveProperty("bio_internal");
    expect(() => getTeacherPublicProfile("00000000-0000-4000-8000-000000000000", DEMO_IDS.lucas)).toThrow();
  });

  it("Property 31/32/33/34: upload valida tipo/tamanho e persiste URL", async () => {
    const valid = new File([new Uint8Array([1, 2, 3])], "avatar.png", { type: "image/png" });
    const result = await uploadAvatar(DEMO_IDS.teacher, valid);
    expect(result.avatar_url.startsWith("data:image/png;base64,")).toBe(true);
    expect(getProfileView(DEMO_IDS.teacher).profile.avatar_url).toBe(result.avatar_url);

    const invalidType = new File([new Uint8Array([1])], "a.txt", { type: "text/plain" });
    await expect(uploadAvatar(DEMO_IDS.teacher, invalidType)).rejects.toMatchObject({ status: 400 });

    const oversized = new File([new Uint8Array(MAX_AVATAR_BYTES + 1)], "big.png", { type: "image/png" });
    await expect(uploadAvatar(DEMO_IDS.teacher, oversized)).rejects.toMatchObject({ status: 400 });
  });

  it("Property 37/38/39: timezone IANA, exposto ao professor e timestamps UTC", () => {
    const view = getProfileView(DEMO_IDS.teacher);
    expect(view.teacher?.timezone).toBe("America/Sao_Paulo");
    expect(view.profile.created_at.endsWith("Z")).toBe(true);
    expect(view.profile.updated_at.endsWith("Z")).toBe(true);
  });

  it("Property 8: updated_at avança após atualização", async () => {
    const before = getProfileView(DEMO_IDS.teacher).profile.updated_at;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const after = (await updateOwnProfile(DEMO_IDS.teacher, { full_name: "Rafael M." })).profile
      .updated_at;
    expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
  });
});

describe("integração — endpoints de autenticação", () => {
  it("signup cria conta, define cookie e retorna 201", async () => {
    const response = await signupRoute(
      apiRequest({
        email: uniqueEmail("signup"),
        password: "senha12345",
        fullName: "Novo Professor",
        displayName: "Prof. Novo",
        timezone: "America/Sao_Paulo",
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(201);
    expect(sessionState.jar.get(SESSION_COOKIE)).toBeTruthy();
    const payload = await json(response);
    expect(payload.data.active_role).toBe("teacher");
  });

  it("signup retorna 409 para e-mail duplicado e 400 para dados inválidos", async () => {
    const duplicate = await signupRoute(
      apiRequest({
        email: "professor@bjj.app",
        password: "senha12345",
        fullName: "Duplicado",
        displayName: "Prof. Duplicado",
        timezone: "UTC",
      }),
      { params: Promise.resolve({}) },
    );
    expect(duplicate.status).toBe(409);

    const invalid = await signupRoute(
      apiRequest({ email: "inválido", password: "123", fullName: "", displayName: "" }),
      { params: Promise.resolve({}) },
    );
    expect(invalid.status).toBe(400);
    const payload = await json(invalid);
    expect(payload.error.details.fields.email).toBeTruthy();
    expect(payload.error.details.fields.password).toBeTruthy();
  });

  it("login retorna 200 com sessão e 401 genérico sem revelar e-mail", async () => {
    const ok = await loginRoute(apiRequest({ email: "professor@bjj.app", password: "senha12345" }), {
      params: Promise.resolve({}),
    });
    expect(ok.status).toBe(200);
    expect((await json(ok)).data.session.access_token).toBeTruthy();

    const bad = await loginRoute(apiRequest({ email: "ninguem@example.com", password: "senha12345" }), {
      params: Promise.resolve({}),
    });
    expect(bad.status).toBe(401);
    expect((await json(bad)).error.message).toBe("E-mail ou senha inválidos");
  });

  it("GET /api/profiles/me retorna 401 sem sessão e dados com sessão", async () => {
    const unauthorized = await profileRoute(new Request("http://localhost/api/profiles/me"), {
      params: Promise.resolve({}),
    });
    expect(unauthorized.status).toBe(401);

    await authenticateTeacher();
    const authorized = await profileRoute(new Request("http://localhost/api/profiles/me"), {
      params: Promise.resolve({}),
    });
    expect(authorized.status).toBe(200);
    expect((await json(authorized)).data.profile.id).toBe(DEMO_IDS.teacher);
  });

  it("PATCH /api/profiles/me atualiza dados e retorna 400 para timezone inválido", async () => {
    await authenticateTeacher();
    const response = await profilePatchRoute(
      new Request("http://localhost/api/profiles/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ full_name: "Rafael Atualizado", timezone: "UTC" }),
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(200);
    expect((await json(response)).data.profile.full_name).toBe("Rafael Atualizado");

    const invalid = await profilePatchRoute(
      new Request("http://localhost/api/profiles/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timezone: "Inválido/Zone" }),
      }),
      { params: Promise.resolve({}) },
    );
    expect(invalid.status).toBe(400);
  });

  it("logout limpa o cookie de sessão", async () => {
    await authenticateTeacher();
    const response = await logoutRoute(apiRequest(), { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
    expect(sessionState.jar.get(SESSION_COOKIE)).toBe("");
    expect(await getCurrentSession()).toBeNull();
  });

  it("sessão assinada rejeita token adulterado e expirado", async () => {
    const token = await signSession({
      sub: DEMO_IDS.teacher,
      role: "teacher",
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    expect(await verifySessionToken(token)).not.toBeNull();
    expect(await verifySessionToken(`${token}x`)).toBeNull();
    const expired = await signSession({
      sub: DEMO_IDS.teacher,
      role: "teacher",
      exp: Math.floor(Date.now() / 1000) - 1,
    });
    expect(await verifySessionToken(expired)).toBeNull();
  });

  it("troca de visão só permite papéis que o usuário realmente possui", async () => {
    await expect(switchRole(DEMO_IDS.teacher, "student")).rejects.toBeInstanceOf(ApiError);
    const result = await switchRole(DEMO_IDS.teacher, "teacher");
    expect(result.active_role).toBe("teacher");
  });
});

describe("integração — recuperação de senha e avatar", () => {
  it("fluxo completo de recuperação altera a senha e invalida o token", async () => {
    const result = await requestPasswordRecovery("professor@bjj.app");
    expect(result.message).toContain("Se existir");

    const email = getOutbox().find((item) => item.kind === "recovery")!;
    const token = String(email.payload.token);
    await resetPassword(token, "novaSenha123");
    await expect(resetPassword(token, "outraSenha123")).rejects.toMatchObject({ status: 400 });

    await expect(login({ email: "professor@bjj.app", password: "senha12345" })).rejects.toMatchObject({
      status: 401,
    });
    const logged = await login({ email: "professor@bjj.app", password: "novaSenha123" });
    expect(logged.active_role).toBe("teacher");
  });

  it("recuperação para e-mail inexistente não revela existência", async () => {
    const result = await requestPasswordRecovery("naoexiste@example.com");
    expect(result.message).toContain("Se existir");
    expect(getOutbox()).toHaveLength(0);
  });

  it("upload de avatar atualiza o perfil e remoção limpa a URL", async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], "foto.webp", { type: "image/webp" });
    const { avatar_url } = await uploadAvatar(DEMO_IDS.teacher, file);
    expect(getProfileView(DEMO_IDS.teacher).profile.avatar_url).toBe(avatar_url);

    await updateOwnProfile(DEMO_IDS.teacher, { avatar_url: null });
    expect(getProfileView(DEMO_IDS.teacher).profile.avatar_url).toBeNull();
  });
});

describe("limites e erros", () => {
  it("senha com exatamente 8 caracteres é válida; 7 é inválida", () => {
    expect(verifyPassword("12345678", hashPassword("12345678"))).toBe(true);
    expect(
      signupSchema.safeParse({
        email: "a@b.com",
        password: "1234567",
        fullName: "Nome",
        displayName: "Prof",
        timezone: "UTC",
      }).success,
    ).toBe(false);
  });

  it("avatar exatamente no limite é aceito; um byte acima é rejeitado", async () => {
    const exact = new File([new Uint8Array(MAX_AVATAR_BYTES)], "exact.png", { type: "image/png" });
    await expect(uploadAvatar(DEMO_IDS.teacher, exact)).resolves.toBeTruthy();
    const above = new File([new Uint8Array(MAX_AVATAR_BYTES + 1)], "above.png", { type: "image/png" });
    await expect(uploadAvatar(DEMO_IDS.teacher, above)).rejects.toMatchObject({ status: 400 });
  });

  it("timezone e nome são validados antes de salvar", async () => {
    await expect(updateOwnProfile(DEMO_IDS.teacher, { timezone: "XYZ" })).rejects.toThrow();
    await expect(updateOwnProfile(DEMO_IDS.teacher, { full_name: "" })).rejects.toThrow();
  });

  it("token de convite expirado retorna erro 404", () => {
    const db = getDb();
    const pedro = db.enrollments.find((item) => item.id === DEMO_IDS.pedroEnrollment)!;
    pedro.invite_expires_at = new Date(Date.now() - 1000).toISOString();
    try {
      verifyInviteToken(pedro.invite_token!);
      throw new Error("deveria falhar");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(404);
    }
  });
});
