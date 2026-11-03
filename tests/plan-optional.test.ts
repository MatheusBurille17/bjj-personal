import { beforeEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";

const sessionState = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      sessionState.jar.has(name) ? { name, value: sessionState.jar.get(name) as string } : undefined,
    set: (name: string, value: string) => sessionState.jar.set(name, value),
    delete: (name: string) => sessionState.jar.delete(name),
  }),
}));

import { createDemoDatabase, DEMO_IDS } from "@/lib/db/seed";
import { getDb, mutate, resetDb } from "@/lib/db/store";
import {
  addVideoToPlanDay,
  archivePlan,
  createPlan,
  createPlanDay,
  deletePlan,
  deletePlanDay,
  duplicatePlan,
  getPlanDays,
  getPlanDetail,
  getPlans,
  grantPlanAccess,
  publishPlan,
  removeVideoFromPlanDay,
  reorderPlanDays,
  revokePlanAccess,
  unarchivePlan,
  unpublishPlan,
  updatePlan,
  updatePlanDay,
} from "@/lib/services/plan.service";
import { getStudentTrainingPlans } from "@/lib/services/portal.service";
import { signSession, SESSION_COOKIE } from "@/lib/auth/token";
import { POST as planCreateRoute, GET as planListRoute } from "@/app/api/plans/route";
import { createPlanDaySchema, createPlanSchema, updatePlanSchema } from "@/lib/validation/plan";
import type { MonthlyPlanWithCounts } from "@/types/plan";

const OTHER_TEACHER = "77777777-7777-4777-8777-777777777777";

beforeEach(() => {
  sessionState.jar.clear();
  resetDb(createDemoDatabase());
  mutate((db) => {
    db.profiles.push({
      ...db.profiles[0],
      id: OTHER_TEACHER,
      full_name: "Outro Professor",
      email: "outro.professor@example.com",
    });
    db.teachers.push({
      ...db.teachers[0],
      id: OTHER_TEACHER,
      display_name: "Prof. Outro",
    });
  });
});

async function authenticateTeacher(id = DEMO_IDS.teacher) {
  const token = await signSession({
    sub: id,
    role: "teacher",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  sessionState.jar.set(SESSION_COOKIE, token);
}

function request(body?: unknown): Request {
  return new Request("http://localhost/api/plans", {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("propriedades — criação e consulta de planos", () => {
  it("Property 1/2: qualquer plano válido é criado como rascunho com campos completos", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 3, maxLength: 60 }).filter((title) => title.trim().length >= 3),
        fc.constantFrom("2026-01-01", "2026-06-15", "2026-12-01"),
        (title, start) => {
          const end = `${start.slice(0, 4)}-12-31`;
          const plan = createPlan(DEMO_IDS.teacher, {
            title,
            period_start: start,
            period_end: end,
          });
          expect(plan.status).toBe("draft");
          expect(plan.title).toBe(title);
          expect(plan.published_at).toBeNull();
          expect(plan.plan_day_count).toBe(0);
          expect(plan.enrolled_count).toBe(0);
        },
      ),
      { numRuns: 15 },
    );
  });

  it("Property 4: busca por título é parcial e case-insensitive", () => {
    const result = getPlans(DEMO_IDS.teacher, { search: "FUNDAMENTOS", pageSize: 100 });
    expect(result.plans.length).toBeGreaterThanOrEqual(1);
    expect(result.plans.every((plan) => plan.title.toLowerCase().includes("fundamentos"))).toBe(true);
    expect(getPlans(DEMO_IDS.teacher, { search: "zzz", pageSize: 100 }).plans).toHaveLength(0);
  });

  it("Property 5/6: lista exclui arquivados por padrão e ordena por período desc", () => {
    const result = getPlans(DEMO_IDS.teacher, { pageSize: 100 });
    expect(result.plans.every((plan) => plan.status !== "archived")).toBe(true);
    const periods = result.plans.map((plan) => plan.period_start);
    expect(periods).toEqual([...periods].sort((a, b) => b.localeCompare(a)));
  });

  it("Property 7/8: filtros de status e data funcionam combinados", () => {
    const published = getPlans(DEMO_IDS.teacher, { status: ["published"], pageSize: 100 });
    expect(published.plans.every((plan) => plan.status === "published")).toBe(true);
    const range = getPlans(DEMO_IDS.teacher, {
      status: ["published"],
      from_date: "2026-10-01",
      to_date: "2026-10-31",
      pageSize: 100,
    });
    expect(range.plans.every((plan) => plan.period_start <= "2026-10-31")).toBe(true);
  });

  it("Property 10/71/72: atualização preserva identidade e atualiza timestamp", async () => {
    const before = getPlanDetail(DEMO_IDS.planNovember, DEMO_IDS.teacher);
    await new Promise((resolve) => setTimeout(resolve, 2));
    const updated = updatePlan(DEMO_IDS.planNovember, DEMO_IDS.teacher, {
      title: "Plano atualizado",
      description: "Nova descrição",
    });
    expect(updated.id).toBe(before.id);
    expect(updated.status).toBe("draft");
    expect(updated.created_at).toBe(before.created_at);
    expect(updated.updated_at >= before.updated_at).toBe(true);
  });

  it("Property 11: transições de status válidas e inválidas", () => {
    const published = publishPlan(DEMO_IDS.planNovember, DEMO_IDS.teacher);
    expect(published.status).toBe("published");
    expect(() => publishPlan(DEMO_IDS.planNovember, DEMO_IDS.teacher)).toThrow();
    const draft = unpublishPlan(DEMO_IDS.planNovember, DEMO_IDS.teacher);
    expect(draft.status).toBe("draft");
    expect(draft.published_at).not.toBeNull();
    expect(() => unpublishPlan(DEMO_IDS.planNovember, DEMO_IDS.teacher)).toThrow();
    const archived = archivePlan(DEMO_IDS.planNovember, DEMO_IDS.teacher);
    expect(archived.status).toBe("archived");
    expect(archived.archived_at).not.toBeNull();
    const restored = unarchivePlan(DEMO_IDS.planNovember, DEMO_IDS.teacher);
    expect(restored.status).toBe("draft");
    expect(() => unarchivePlan(DEMO_IDS.planNovember, DEMO_IDS.teacher)).toThrow();
  });

  it("Property 12/13/14/15/16: publicação controla visibilidade e não concede acesso", () => {
    expect(getStudentTrainingPlans(DEMO_IDS.lucas).find((plan) => plan.id === DEMO_IDS.planNovember)).toBeUndefined();
    const published = publishPlan(DEMO_IDS.planNovember, DEMO_IDS.teacher);
    expect(published.enrolled_count).toBe(0);
    expect(getStudentTrainingPlans(DEMO_IDS.lucas).find((plan) => plan.id === DEMO_IDS.planNovember)).toBeUndefined();
    grantPlanAccess(DEMO_IDS.planNovember, DEMO_IDS.teacher, DEMO_IDS.lucasEnrollment);
    expect(getStudentTrainingPlans(DEMO_IDS.lucas).some((plan) => plan.id === DEMO_IDS.planNovember)).toBe(true);
    unpublishPlan(DEMO_IDS.planNovember, DEMO_IDS.teacher);
    expect(getStudentTrainingPlans(DEMO_IDS.lucas).some((plan) => plan.id === DEMO_IDS.planNovember)).toBe(false);
    expect(getPlanDetail(DEMO_IDS.planNovember, DEMO_IDS.teacher).enrollments).toHaveLength(1);
  });

  it("Property 17/19/20/21: arquivamento preserva estrutura e restauração exige publicação", () => {
    const archived = archivePlan(DEMO_IDS.planOctober, DEMO_IDS.teacher);
    expect(archived.status).toBe("archived");
    const detail = getPlanDetail(DEMO_IDS.planOctober, DEMO_IDS.teacher);
    expect(detail.days).toHaveLength(3);
    expect(detail.enrollments).toHaveLength(2);
    expect(getPlans(DEMO_IDS.teacher, { pageSize: 100 }).plans.some((plan) => plan.id === DEMO_IDS.planOctober)).toBe(false);
    expect(getStudentTrainingPlans(DEMO_IDS.lucas).some((plan) => plan.id === DEMO_IDS.planOctober)).toBe(false);
    const restored = unarchivePlan(DEMO_IDS.planOctober, DEMO_IDS.teacher);
    expect(restored.status).toBe("draft");
    expect(getStudentTrainingPlans(DEMO_IDS.lucas).some((plan) => plan.id === DEMO_IDS.planOctober)).toBe(false);
  });

  it("Property 22/23: exclusão bloqueada com aulas e cascata sem referências", () => {
    expect(() => deletePlan(DEMO_IDS.planOctober, DEMO_IDS.teacher)).toThrow(/arquive/i);
    const dayIds = getDb().plan_days
      .filter((day) => day.monthly_plan_id === DEMO_IDS.planNovember)
      .map((day) => day.id);
    deletePlan(DEMO_IDS.planNovember, DEMO_IDS.teacher);
    expect(getDb().monthly_plans.some((plan) => plan.id === DEMO_IDS.planNovember)).toBe(false);
    expect(getDb().plan_days.some((day) => dayIds.includes(day.id))).toBe(false);
    expect(getDb().plan_day_videos.some((assoc) => dayIds.includes(assoc.plan_day_id))).toBe(false);
  });

  it("Property 31/32/73/74: timestamps de criação, publicação e arquivamento em UTC", () => {
    const now = new Date().toISOString().slice(0, 10);
    const plan = createPlan(DEMO_IDS.teacher, {
      title: "Plano UTC",
      period_start: now,
      period_end: now,
    });
    expect(plan.created_at.endsWith("Z")).toBe(true);
    const published = publishPlan(plan.id, DEMO_IDS.teacher);
    expect(published.published_at?.endsWith("Z")).toBe(true);
    const archived = archivePlan(plan.id, DEMO_IDS.teacher);
    expect(archived.archived_at?.endsWith("Z")).toBe(true);
  });

  it("Property 75: busca vazia retorna lista e search trim funciona", () => {
    expect(getPlans(DEMO_IDS.teacher, { search: "   ", pageSize: 100 }).plans.length).toBeGreaterThan(0);
    expect(getPlans(DEMO_IDS.teacher, { search: "  Fundamentos  ", pageSize: 100 }).plans.length).toBeGreaterThan(0);
  });
});

describe("propriedades — dias planejados", () => {
  it("Property 24/25/26/28: dias por semana ou data, com validação", () => {
    // As datas são derivadas do plano demo, que é relativo ao mês atual.
    const plan = getDb().monthly_plans.find((item) => item.id === DEMO_IDS.planNovember)!;
    const validDate = plan.period_start;
    const outsideDate = new Date(`${plan.period_end}T00:00:00Z`);
    outsideDate.setUTCDate(outsideDate.getUTCDate() + 1);
    const outside = outsideDate.toISOString().slice(0, 10);

    const weekdayDay = createPlanDay(DEMO_IDS.planNovember, DEMO_IDS.teacher, {
      weekday: 5,
      title: "Dia por semana",
    });
    expect(weekdayDay.weekday).toBe(5);
    expect(weekdayDay.planned_date).toBeNull();

    const dateDay = createPlanDay(DEMO_IDS.planNovember, DEMO_IDS.teacher, {
      planned_date: validDate,
      title: "Dia por data",
    });
    expect(dateDay.planned_date).toBe(validDate);
    expect(createPlanDaySchema.safeParse({ title: "Sem dia" }).success).toBe(false);
    expect(createPlanDaySchema.safeParse({ weekday: 7, title: "Inválido" }).success).toBe(false);
    expect(() =>
      createPlanDay(DEMO_IDS.planNovember, DEMO_IDS.teacher, {
        planned_date: outside,
        title: "Fora do período",
      }),
    ).toThrow(/período/i);
  });

  it("Property 29/30: lista filtra pelo plano e ordena por sort_order", () => {
    const first = getPlanDays(DEMO_IDS.planNovember, DEMO_IDS.teacher);
    expect(first.every((day) => day.monthly_plan_id === DEMO_IDS.planNovember)).toBe(true);
    expect(first.map((day) => day.sort_order)).toEqual(
      [...first.map((day) => day.sort_order)].sort((a, b) => a - b),
    );
  });

  it("Property 32/33/34: reordenação atômica preserva o conjunto de itens", () => {
    const days = getPlanDays(DEMO_IDS.planNovember, DEMO_IDS.teacher);
    const reversed = [...days].reverse().map((day, index) => ({
      id: day.id,
      sort_order: index + 1,
    }));
    reorderPlanDays(DEMO_IDS.teacher, reversed);
    const after = getPlanDays(DEMO_IDS.planNovember, DEMO_IDS.teacher);
    expect(after.map((day) => day.id)).toEqual([...days].reverse().map((day) => day.id));
    expect(after.map((day) => day.sort_order)).toEqual([1, 2]);
  });

  it("Property 35/36/62: remover dia cascateia vídeos e preserva referência da aula", () => {
    const detail = getPlanDetail(DEMO_IDS.planOctober, DEMO_IDS.teacher);
    const day = detail.days[0];
    deletePlanDay(day.id, DEMO_IDS.teacher);
    expect(getDb().plan_days.some((item) => item.id === day.id)).toBe(false);
    expect(getDb().plan_day_videos.some((item) => item.plan_day_id === day.id)).toBe(false);
    const lesson = getDb().lessons.find((item) => item.plan_day_id === day.id);
    expect(lesson?.plan_day_id).toBe(day.id);
  });

  it("Property 67: valida título, objetivo, notas e data do dia", () => {
    expect(createPlanDaySchema.safeParse({ weekday: 1, title: "A" }).success).toBe(false);
    expect(
      createPlanDaySchema.safeParse({ weekday: 1, title: "Dia", objective: "x".repeat(1001) }).success,
    ).toBe(false);
    expect(
      createPlanDaySchema.safeParse({ weekday: 1, title: "Dia", notes: "x".repeat(2001) }).success,
    ).toBe(false);
  });
});

describe("propriedades — vídeos e acesso ao plano", () => {
  it("Property 37/39/40/41/42/44: associação, unicidade, remoção e reuso", () => {
    const detail = getPlanDetail(DEMO_IDS.planNovember, DEMO_IDS.teacher);
    const day = detail.days[0];
    const videoId = "eeeeeee1-1111-4111-8111-111111111111";
    const updated = addVideoToPlanDay(day.id, DEMO_IDS.teacher, videoId);
    expect(updated.videos.some((video) => video.id === videoId)).toBe(true);
    expect(() => addVideoToPlanDay(day.id, DEMO_IDS.teacher, videoId)).toThrow();
    expect(() =>
      addVideoToPlanDay(day.id, DEMO_IDS.teacher, "eeeeeee6-6666-4666-8666-666666666666"),
    ).not.toThrow();
    const association = updated.videos.find((video) => video.id === videoId)!;
    removeVideoFromPlanDay(association.association_id, DEMO_IDS.teacher);
    expect(getPlanDays(DEMO_IDS.planNovember, DEMO_IDS.teacher)[0].videos.some((video) => video.id === videoId)).toBe(false);

    // O mesmo vídeo pode ser usado em outro dia/plano.
    const otherDay = getPlanDetail(DEMO_IDS.planOctober, DEMO_IDS.teacher).days[2];
    addVideoToPlanDay(otherDay.id, DEMO_IDS.teacher, videoId);
    expect(
      getPlanDetail(DEMO_IDS.planOctober, DEMO_IDS.teacher).days[2].videos.some(
        (video) => video.id === videoId,
      ),
    ).toBe(true);
  });

  it("Property 45/46: arquivar vídeo não remove associação e mantém indicador", () => {
    mutate((db) => {
      const video = db.videos.find((item) => item.id === "eeeeeee1-1111-4111-8111-111111111111")!;
      video.status = "archived";
    });
    const detail = getPlanDetail(DEMO_IDS.planOctober, DEMO_IDS.teacher);
    expect(detail.days[0].videos.some((video) => video.status === "archived")).toBe(true);
    expect(() =>
      addVideoToPlanDay(detail.days[1].id, DEMO_IDS.teacher, "eeeeeee1-1111-4111-8111-111111111111"),
    ).toThrow(/arquivado/i);
  });

  it("Property 47/48/49/50/51/52: acesso requer publicação, é único e revogável", () => {
    expect(() =>
      grantPlanAccess(DEMO_IDS.planNovember, DEMO_IDS.teacher, DEMO_IDS.lucasEnrollment),
    ).toThrow(/publique/i);
    publishPlan(DEMO_IDS.planNovember, DEMO_IDS.teacher);
    const access = grantPlanAccess(DEMO_IDS.planNovember, DEMO_IDS.teacher, DEMO_IDS.lucasEnrollment);
    expect(access.enrollment_id).toBe(DEMO_IDS.lucasEnrollment);
    expect(() =>
      grantPlanAccess(DEMO_IDS.planNovember, DEMO_IDS.teacher, DEMO_IDS.lucasEnrollment),
    ).toThrow();
    expect(getStudentTrainingPlans(DEMO_IDS.lucas).some((plan) => plan.id === DEMO_IDS.planNovember)).toBe(true);
    revokePlanAccess(access.id, DEMO_IDS.teacher);
    expect(getStudentTrainingPlans(DEMO_IDS.lucas).some((plan) => plan.id === DEMO_IDS.planNovember)).toBe(false);
  });

  it("Property 53/54: lista de alunos com acesso exclui arquivados por padrão", () => {
    const detail = getPlanDetail(DEMO_IDS.planOctober, DEMO_IDS.teacher);
    expect(detail.enrollments.every((item) => item.status !== "archived")).toBe(true);
  });
});

describe("propriedades — duplicação e integridade", () => {
  it("Property 58/59/60: duplicação cria rascunho com estrutura e sem acessos", () => {
    const copy = duplicatePlan(DEMO_IDS.planOctober, DEMO_IDS.teacher);
    expect(copy.status).toBe("draft");
    expect(copy.title).toBe("Fundamentos do mês (Copy)");
    expect(copy.published_at).toBeNull();
    expect(copy.days).toHaveLength(3);
    expect(copy.days.flatMap((day) => day.videos)).toHaveLength(4);
    expect(copy.enrollments).toHaveLength(0);
  });

  it("Property 61/63: alterações no plano não alteram aulas nem vídeos históricos", () => {
    const lesson = getDb().lessons.find(
      (item) => item.plan_day_id === "fffffff2-2222-4222-8222-222222222222",
    )!;
    const snapshot = lesson.objective_snapshot;
    const lessonVideos = getDb().lesson_videos.filter((item) => item.lesson_id === lesson.id).length;
    updatePlanDay("fffffff2-2222-4222-8222-222222222222", DEMO_IDS.teacher, {
      title: "Título alterado",
      objective: "Objetivo alterado",
    });
    addVideoToPlanDay("fffffff2-2222-4222-8222-222222222222", DEMO_IDS.teacher, "eeeeeee1-1111-4111-8111-111111111111");
    expect(getDb().lessons.find((item) => item.id === lesson.id)?.objective_snapshot).toBe(snapshot);
    expect(getDb().lesson_videos.filter((item) => item.lesson_id === lesson.id)).toHaveLength(lessonVideos);
  });

  it("Property 70: validação de limites do plano", () => {
    expect(updatePlanSchema.safeParse({ title: "Plano ok" }).success).toBe(true);
    expect(createPlanSchema.safeParse({
      title: "Plano",
      period_start: "2026-01-01",
      period_end: "2026-12-31",
    }).success).toBe(true);
  });
});

describe("integração — ciclo de planos e endpoints", () => {
  it("criar → publicar → conceder acesso → aluno visualiza", async () => {
    await authenticateTeacher();
    const response = await planCreateRoute(request({
      title: "Plano de integração",
      period_start: "2026-12-01",
      period_end: "2026-12-31",
    }), { params: Promise.resolve({}) });
    expect(response.status).toBe(201);
    const created = (await response.json()).data as MonthlyPlanWithCounts;

    publishPlan(created.id, DEMO_IDS.teacher);
    grantPlanAccess(created.id, DEMO_IDS.teacher, DEMO_IDS.lucasEnrollment);
    expect(getStudentTrainingPlans(DEMO_IDS.lucas).some((plan) => plan.id === created.id)).toBe(true);
  });

  it("GET /api/plans exige professor autenticado", async () => {
    const unauthorized = await planListRoute(request(), { params: Promise.resolve({}) });
    expect(unauthorized.status).toBe(401);
    await authenticateTeacher();
    const authorized = await planListRoute(request(), { params: Promise.resolve({}) });
    expect(authorized.status).toBe(200);
    expect((await authorized.json()).data.length).toBeGreaterThan(0);
  });

  it("duplicação e arquivamento preservam histórico e estrutura", () => {
    const copy = duplicatePlan(DEMO_IDS.planOctober, DEMO_IDS.teacher);
    expect(copy.days[0].videos.length).toBeGreaterThan(0);
    archivePlan(copy.id, DEMO_IDS.teacher);
    expect(getPlanDetail(copy.id, DEMO_IDS.teacher).days).toHaveLength(copy.days.length);
  });

  it("exclusão de plano com aula referenciada é bloqueada", () => {
    expect(() => deletePlan(DEMO_IDS.planOctober, DEMO_IDS.teacher)).toThrow(/arquive/i);
  });

  it("outro professor não acessa plano alheio", () => {
    expect(() => getPlanDetail(DEMO_IDS.planOctober, OTHER_TEACHER)).toThrow(/acesso negado/i);
    expect(() => updatePlan(DEMO_IDS.planOctober, OTHER_TEACHER, { title: "Hack" })).toThrow();
    expect(() =>
      grantPlanAccess(DEMO_IDS.planOctober, OTHER_TEACHER, DEMO_IDS.lucasEnrollment),
    ).toThrow();
  });

  it("limites de validação do plano", () => {
    const base = {
      title: "Plano",
      period_start: "2026-01-01",
      period_end: "2026-12-31",
    };
    expect(createPlanSchema.safeParse({ ...base, title: "ab" }).success).toBe(false);
    expect(createPlanSchema.safeParse({ ...base, title: "x".repeat(201) }).success).toBe(false);
    expect(createPlanSchema.safeParse({ ...base, description: "x".repeat(2001) }).success).toBe(false);
    expect(createPlanSchema.safeParse({ ...base, objective: "x".repeat(1001) }).success).toBe(false);
    expect(createPlanSchema.safeParse({ ...base, period_end: "2025-12-31" }).success).toBe(false);
  });
});
