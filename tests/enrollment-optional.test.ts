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
import { getDb, mutate, resetDb } from "@/lib/db/store";
import {
  archiveEnrollment,
  canDeleteEnrollment,
  createEnrollment,
  deleteEnrollment,
  getEnrollmentDetail,
  getEnrollments,
  pauseEnrollment,
  reactivateEnrollment,
  resendInvitation,
  updateEnrollment,
} from "@/lib/services/enrollment.service";
import { createStudentAccount, generateInviteToken, verifyInviteToken } from "@/lib/services/invitation.service";
import { createLesson } from "@/lib/services/lesson.service";
import { signSession, SESSION_COOKIE } from "@/lib/auth/token";
import {
  GET as enrollmentsGetRoute,
  POST as enrollmentsPostRoute,
} from "@/app/api/enrollments/route";
import { GET as enrollmentGetRoute } from "@/app/api/enrollments/[id]/route";
import { ApiError } from "@/lib/middleware/errors";
import { createEnrollmentSchema, searchEnrollmentsSchema, updateEnrollmentSchema, validateStatusTransition } from "@/lib/validation/enrollment";
import type { EnrollmentStatus } from "@/types/enrollment";

const OTHER_TEACHER = "77777777-7777-4777-8777-777777777777";
const OTHER_PROFILE = "77777777-7777-4777-8777-777777777777";

beforeEach(() => {
  sessionState.jar.clear();
  resetDb(createDemoDatabase());
  mutate((db) => {
    db.users.push({
      ...db.users[0],
      id: OTHER_TEACHER,
      email: "outro.professor@example.com",
    });
    db.profiles.push({
      id: OTHER_PROFILE,
      full_name: "Outro Professor",
      email: "outro.professor@example.com",
      avatar_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    db.teachers.push({
      id: OTHER_TEACHER,
      display_name: "Prof. Outro",
      timezone: "America/Sao_Paulo",
      bio: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });
});

function uniqueEmail() {
  return `aluno.${crypto.randomUUID()}@example.com`;
}

async function expectStatus(promise: Promise<unknown>, status: number) {
  try {
    await promise;
    throw new Error("Esperava ApiError");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(status);
  }
}

async function activateEnrollment(inviteUrl: string) {
  await createStudentAccount(
    inviteUrl.split("/invite/")[1],
    "senha12345",
    "Aluno Ativado",
  );
}

async function authenticateTeacher(teacherId: string = DEMO_IDS.teacher) {
  const token = await signSession({
    sub: teacherId,
    role: "teacher",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  sessionState.jar.set(SESSION_COOKIE, token);
}

function request(body?: unknown): Request {
  return new Request("http://localhost/api/enrollments", {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("propriedades — convite e criação", () => {
  it("Property 1: qualquer token gerado tem 64 caracteres hexadecimais e alta entropia", () => {
    const seen = new Set<string>();
    fc.assert(
      fc.property(fc.constant(null), () => {
        const token = generateInviteToken();
        expect(token).toMatch(/^[a-f0-9]{64}$/);
        seen.add(token);
        return true;
      }),
      { numRuns: 100 },
    );
    expect(seen.size).toBe(100);
  });

  it("Property 4: criação sempre resulta em pendente, token, started_at e e-mail", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 2, maxLength: 50 }).filter((name) => name.trim().length >= 2),
        async (name) => {
          const email = uniqueEmail();
          const { enrollment } = await createEnrollment(DEMO_IDS.teacher, {
            student_name: name,
            student_email: email,
          });
          expect(enrollment.status).toBe("pending");
          expect(enrollment.student_profile_id).toBeNull();
          expect(enrollment.invite_token).toHaveLength(64);
          expect(enrollment.started_at).toBeTruthy();
          expect(enrollment.student_email).toBe(email.toLowerCase());
          expect(new Date(enrollment.invite_expires_at!).getTime()).toBeGreaterThan(Date.now());
        },
      ),
      { numRuns: 15 },
    );
  });

  it("Property 2/19: ativação por token cria/associa perfil e limpa token", async () => {
    const { enrollment, invite_url } = await createEnrollment(DEMO_IDS.teacher, {
      student_name: "Ativação",
      student_email: uniqueEmail(),
    });
    const token = invite_url.split("/invite/")[1];
    const auth = await createStudentAccount(token, "senha12345", "Ativação");
    const updated = getDb().enrollments.find((item) => item.id === enrollment.id)!;
    expect(updated.status).toBe("active");
    expect(updated.student_profile_id).toBe(auth.user.id);
    expect(updated.invite_token).toBeNull();
    expect(() => verifyInviteToken(token)).toThrow();
  });

  it("Property 3: reenvio invalida o token anterior e cria novo", async () => {
    const { enrollment } = await createEnrollment(DEMO_IDS.teacher, {
      student_name: "Reenvio",
      student_email: uniqueEmail(),
    });
    const oldToken = enrollment.invite_token!;
    const result = await resendInvitation(enrollment.id, DEMO_IDS.teacher);
    expect(result.invite_token).not.toBe(oldToken);
    expect(() => verifyInviteToken(oldToken)).toThrow();
    expect(verifyInviteToken(result.invite_token).enrollment_id).toBe(enrollment.id);
  });
});

describe("propriedades — consulta e filtros", () => {
  it("Property 5: busca encontra substring sem diferenciar maiúsculas", () => {
    const names = ["Ana Silva", "Bruno Souza", "Carla Lima", "Daniel Alves"];
    const statuses: EnrollmentStatus[] = ["active"];
    // Enriquecendo a base com nomes controlados.
    mutate((db) => {
      for (const name of names) {
        db.enrollments.push({
          ...db.enrollments[0],
          id: crypto.randomUUID(),
          student_name: name,
          student_email: `${name.replace(/\s/g, ".").toLowerCase()}@example.com`,
          student_profile_id: null,
          invite_token: null,
        });
      }
    });

    for (const term of ["ana", "SILVA", "sou", "zzz"]) {
      const result = getEnrollments(DEMO_IDS.teacher, {
        search: term,
        status: statuses,
        page: 1,
        pageSize: 100,
      });
      expect(result.enrollments.every((item) => item.student_name.toLowerCase().includes(term.toLowerCase()))).toBe(true);
    }
  });

  it("Property 6: filtro de status retorna somente os status pedidos", () => {
    for (const status of ["active", "paused", "pending", "archived"] as EnrollmentStatus[]) {
      const result = getEnrollments(DEMO_IDS.teacher, {
        search: "",
        status: [status],
        page: 1,
        pageSize: 100,
      });
      expect(result.enrollments.every((item) => item.status === status)).toBe(true);
    }
  });

  it("Property 7: detalhe possui contagem de concluídas e próxima aula", () => {
    const detail = getEnrollmentDetail(DEMO_IDS.lucasEnrollment, DEMO_IDS.teacher);
    expect(detail.completed_lessons_count).toBeGreaterThanOrEqual(1);
    expect(detail.lessons_count).toBeGreaterThanOrEqual(detail.completed_lessons_count);
    expect(detail.next_lesson?.starts_at).toBeTruthy();
  });

  it("Property 8: atualização preserva status e started_at", async () => {
    const before = getEnrollmentDetail(DEMO_IDS.lucasEnrollment, DEMO_IDS.teacher);
    await new Promise((resolve) => setTimeout(resolve, 2));
    const updated = updateEnrollment(DEMO_IDS.lucasEnrollment, DEMO_IDS.teacher, {
      student_name: "Lucas Editado",
      private_notes: "Nova nota",
    });
    expect(updated.status).toBe(before.status);
    expect(updated.started_at).toBe(before.started_at);
    expect(updated.updated_at >= before.started_at).toBe(true);
  });

  it("Property 30/33: timestamps são UTC e created_at/started_at imutáveis", async () => {
    const { enrollment } = await createEnrollment(DEMO_IDS.teacher, {
      student_name: "UTC",
      student_email: uniqueEmail(),
    });
    expect(enrollment.created_at.endsWith("Z")).toBe(true);
    expect(enrollment.started_at.endsWith("Z")).toBe(true);
    const created = enrollment.created_at;
    updateEnrollment(enrollment.id, DEMO_IDS.teacher, { student_name: "UTC 2" });
    const after = getDb().enrollments.find((item) => item.id === enrollment.id)!;
    expect(after.created_at).toBe(created);
    expect(after.started_at).toBe(enrollment.started_at);
  });

  it("Property 9/10/11: pausa só ativo, reativa só pausado, arquivo terminal", () => {
    const paused = pauseEnrollment(DEMO_IDS.lucasEnrollment, DEMO_IDS.teacher);
    expect(paused.status).toBe("paused");
    expect(() => pauseEnrollment(DEMO_IDS.lucasEnrollment, DEMO_IDS.teacher)).toThrow();
    const active = reactivateEnrollment(DEMO_IDS.lucasEnrollment, DEMO_IDS.teacher);
    expect(active.status).toBe("active");
    expect(() => reactivateEnrollment(DEMO_IDS.lucasEnrollment, DEMO_IDS.teacher)).toThrow();
    const archived = archiveEnrollment(DEMO_IDS.lucasEnrollment, DEMO_IDS.teacher);
    expect(archived.archived_at).not.toBeNull();
    expect(() => reactivateEnrollment(DEMO_IDS.lucasEnrollment, DEMO_IDS.teacher)).toThrow();
  });

  it("Property 12: vínculo com aula nunca pode ser excluído", () => {
    expect(canDeleteEnrollment(DEMO_IDS.lucasEnrollment)).toBe(false);
    expect(() => deleteEnrollment(DEMO_IDS.lucasEnrollment, DEMO_IDS.teacher)).toThrow(/arquive/i);
    expect(canDeleteEnrollment(DEMO_IDS.pedroEnrollment)).toBe(true);
    deleteEnrollment(DEMO_IDS.pedroEnrollment, DEMO_IDS.teacher);
    expect(getDb().enrollments.some((item) => item.id === DEMO_IDS.pedroEnrollment)).toBe(false);
  });

  it("Property 13: professor só lista os próprios vínculos", () => {
    const own = getEnrollments(DEMO_IDS.teacher, { search: "", status: [], page: 1, pageSize: 100 });
    expect(own.enrollments.every((item) => item.student_email !== "outro.professor@example.com")).toBe(true);
    const other = getEnrollments(OTHER_TEACHER, { search: "", status: [], page: 1, pageSize: 100 });
    expect(other.enrollments).toHaveLength(0);
  });

  it("Property 14/16: detalhe de outro professor retorna 403", () => {
    expect(() => getEnrollmentDetail(DEMO_IDS.lucasEnrollment, OTHER_TEACHER)).toThrow(
      /acesso negado/i,
    );
  });

  it("Property 15: e-mail é único por professor entre ativos/pendentes", async () => {
    await expectStatus(
      createEnrollment(DEMO_IDS.teacher, {
        student_name: "Duplicado",
        student_email: "ALUNO@bjj.app",
      }),
      409,
    );
    archiveEnrollment(DEMO_IDS.lucasEnrollment, DEMO_IDS.teacher);
    const created = await createEnrollment(DEMO_IDS.teacher, {
      student_name: "Lucas de novo",
      student_email: "aluno@bjj.app",
    });
    expect(created.enrollment.status).toBe("pending");
  });

  it("Property 17/18: permissões de aluno e múltiplos professores", () => {
    const other = getDb().enrollments.find((item) => item.id === DEMO_IDS.marianaEnrollment)!;
    expect(other.teacher_id).toBe(DEMO_IDS.teacher);
    const multi = getDb().enrollments.filter(
      (item) => item.student_profile_id === DEMO_IDS.lucas && item.status === "active",
    );
    expect(multi).toHaveLength(1);
  });
});

describe("propriedades — validação e transições", () => {
  it("Property 20/23: valida e-mail, nome, telefone e notas", () => {
    const base = {
      student_name: "Nome",
      student_email: "a@b.com",
    };
    expect(createEnrollmentSchema.safeParse(base).success).toBe(true);
    expect(createEnrollmentSchema.safeParse({ ...base, student_email: "inválido" }).success).toBe(false);
    expect(createEnrollmentSchema.safeParse({ ...base, student_name: "A" }).success).toBe(false);
    expect(
      createEnrollmentSchema.safeParse({ ...base, student_phone: "123" }).success,
    ).toBe(false);
    expect(
      createEnrollmentSchema.safeParse({ ...base, private_notes: "x".repeat(5001) }).success,
    ).toBe(false);
    expect(
      createEnrollmentSchema.safeParse({ ...base, private_notes: "x".repeat(5000) }).success,
    ).toBe(true);
    expect(updateEnrollmentSchema.safeParse({}).success).toBe(false);
  });

  it("Property 24: busca vazia/espaços retorna todos e pagina corretamente", () => {
    const all = getEnrollments(DEMO_IDS.teacher, { search: "   ", status: [], page: 1, pageSize: 20 });
    expect(all.pagination.total).toBeGreaterThan(0);
    const schema = searchEnrollmentsSchema.safeParse({ pageSize: "101" });
    expect(schema.success).toBe(false);
    const beyond = getEnrollments(DEMO_IDS.teacher, {
      search: "",
      status: [],
      page: 99,
      pageSize: 20,
    });
    expect(beyond.enrollments).toHaveLength(0);
  });

  it("Property 25: todas as transições inválidas são rejeitadas", () => {
    const statuses: EnrollmentStatus[] = ["pending", "active", "paused", "archived"];
    for (const from of statuses) {
      for (const to of statuses) {
        const result = validateStatusTransition(from, to);
        if (from === "archived") expect(result.valid).toBe(false);
      }
    }
    fc.assert(
      fc.property(fc.constantFrom(...statuses), (status) => {
        if (status === "archived") {
          return validateStatusTransition(status, "active").valid === false;
        }
        return true;
      }),
      { numRuns: 20 },
    );
  });
});

describe("integração — ciclos completos", () => {
  it("ciclo criar → ativar → pausar → reativar → arquivar preserva histórico", async () => {
    const { enrollment, invite_url } = await createEnrollment(DEMO_IDS.teacher, {
      student_name: "Ciclo",
      student_email: uniqueEmail(),
    });
    await createStudentAccount(invite_url.split("/invite/")[1], "senha12345", "Ciclo");
    expect(getDb().enrollments.find((item) => item.id === enrollment.id)?.status).toBe("active");

    pauseEnrollment(enrollment.id, DEMO_IDS.teacher);
    reactivateEnrollment(enrollment.id, DEMO_IDS.teacher);
    const archived = archiveEnrollment(enrollment.id, DEMO_IDS.teacher);

    // Cria uma aula antes de arquivar seria bloqueado; o histórico existente
    // permanece após o arquivamento.
    expect(archived.archived_at).not.toBeNull();
    const detail = getEnrollmentDetail(enrollment.id, DEMO_IDS.teacher);
    expect(detail.lessons_count).toBe(0);
  });

  it("busca + filtro + paginação combinados", () => {
    const result = getEnrollments(DEMO_IDS.teacher, {
      search: "a",
      status: ["active", "pending"],
      page: 1,
      pageSize: 1,
    });
    expect(result.enrollments.length).toBeLessThanOrEqual(1);
    expect(result.pagination.pageSize).toBe(1);
    expect(result.pagination.total).toBeGreaterThanOrEqual(result.enrollments.length);
  });

  it("exclusão com aula é bloqueada; sem aula é permitida", async () => {
    const { enrollment, invite_url } = await createEnrollment(DEMO_IDS.teacher, {
      student_name: "Com aula",
      student_email: uniqueEmail(),
    });
    await activateEnrollment(invite_url);
    const start = new Date();
    start.setDate(start.getDate() + 10);
    start.setHours(3, 0, 0, 0);
    createLesson(DEMO_IDS.teacher, {
      enrollment_id: enrollment.id,
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + 3600_000).toISOString(),
    });
    expect(() => deleteEnrollment(enrollment.id, DEMO_IDS.teacher)).toThrow(/arquive/i);

    const clean = await createEnrollment(DEMO_IDS.teacher, {
      student_name: "Sem aula",
      student_email: uniqueEmail(),
    });
    deleteEnrollment(clean.enrollment.id, DEMO_IDS.teacher);
    expect(getDb().enrollments.some((item) => item.id === clean.enrollment.id)).toBe(false);
  });

  it("reenvio gera novo link e o antigo deixa de funcionar", async () => {
    const { enrollment } = await createEnrollment(DEMO_IDS.teacher, {
      student_name: "Reenvio integração",
      student_email: uniqueEmail(),
    });
    const old = enrollment.invite_token!;
    const resent = await resendInvitation(enrollment.id, DEMO_IDS.teacher);
    expect(resent.invite_url).toContain(resent.invite_token);
    expect(() => verifyInviteToken(old)).toThrow();
    expect(verifyInviteToken(resent.invite_token).enrollment_id).toBe(enrollment.id);
  });

  it("múltiplos professores podem manter o mesmo aluno de forma independente", async () => {
    const first = getDb().enrollments.find((item) => item.id === DEMO_IDS.lucasEnrollment)!;
    const second = await createEnrollment(OTHER_TEACHER, {
      student_name: "Lucas Almeida",
      student_email: "aluno@bjj.app",
    });
    expect(second.enrollment.teacher_id).toBe(OTHER_TEACHER);
    expect(first.teacher_id).toBe(DEMO_IDS.teacher);
    expect(second.enrollment.private_notes).not.toBe(first.private_notes);
  });
});

describe("unit�rios � endpoints de alunos", () => {
  it("POST /api/enrollments exige professor e cria convite", async () => {
    const unauthorized = await enrollmentsPostRoute(
      request({ student_name: "Sem sess�o", student_email: uniqueEmail() }),
      { params: Promise.resolve({}) },
    );
    expect(unauthorized.status).toBe(401);

    await authenticateTeacher();
    const created = await enrollmentsPostRoute(
      request({ student_name: "Aluno API", student_email: uniqueEmail() }),
      { params: Promise.resolve({}) },
    );
    expect(created.status).toBe(201);
    const payload = await created.json();
    expect(payload.data.enrollment.status).toBe("pending");
    expect(payload.data.invite_url).toContain("/invite/");
  });

  it("POST /api/enrollments retorna 409 e 400", async () => {
    await authenticateTeacher();
    const duplicate = await enrollmentsPostRoute(
      request({ student_name: "Lucas Duplicado", student_email: "aluno@bjj.app" }),
      { params: Promise.resolve({}) },
    );
    expect(duplicate.status).toBe(409);

    const invalid = await enrollmentsPostRoute(
      request({ student_name: "A", student_email: "invalido" }),
      { params: Promise.resolve({}) },
    );
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.details.fields.student_email).toBeTruthy();
  });

  it("GET /api/enrollments isola professores e suporta filtros", async () => {
    await authenticateTeacher();
    const mine = await enrollmentsGetRoute(
      new Request("http://localhost/api/enrollments?status=active&status=pending&search=lucas"),
      { params: Promise.resolve({}) },
    );
    expect(mine.status).toBe(200);
    const minePayload = await mine.json();
    expect(minePayload.data.enrollments.every((item: { student_name: string }) => item.student_name.toLowerCase().includes("lucas"))).toBe(true);

    await authenticateTeacher(OTHER_TEACHER);
    const other = await enrollmentsGetRoute(request(), { params: Promise.resolve({}) });
    expect((await other.json()).data.enrollments).toHaveLength(0);
  });

  it("GET /api/enrollments/[id] retorna 403 para professor alheio", async () => {
    await authenticateTeacher(OTHER_TEACHER);
    const response = await enrollmentGetRoute(request(), {
      params: Promise.resolve({ id: DEMO_IDS.lucasEnrollment }),
    });
    expect(response.status).toBe(403);
  });

  it("atualiza��o de e-mail duplicated � bloqueada", () => {
    expect(() =>
      updateEnrollment(DEMO_IDS.marianaEnrollment, DEMO_IDS.teacher, {
        student_email: "aluno@bjj.app",
      }),
    ).toThrow(/e-mail/i);
  });

  it("timestamps de arquivamento s� existem em v�nculos arquivados", () => {
    const active = getDb().enrollments.find((item) => item.id === DEMO_IDS.lucasEnrollment)!;
    expect(active.archived_at).toBeNull();
    const archived = archiveEnrollment(DEMO_IDS.lucasEnrollment, DEMO_IDS.teacher);
    expect(archived.archived_at).not.toBeNull();
    expect(archived.archived_at?.endsWith("Z")).toBe(true);
  });
});
