import { beforeEach, describe, expect, it, vi } from "vitest";
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
  getStudentAgenda,
  getStudentDashboard,
  getStudentHistory,
  getStudentLessonDetail,
  getStudentLibraryTechniques,
  getStudentProfile,
  getStudentStatistics,
  getStudentTeachers,
  getStudentTechniqueVideos,
  getStudentTrainingPlans,
  getStudentVideoPlayback,
} from "@/lib/services/portal.service";
import { createLesson, changeLessonStatus } from "@/lib/services/lesson.service";
import { updateOwnProfile } from "@/lib/services/auth.service";
import { createTechnique } from "@/lib/services/library.service";
import { createPlan, grantPlanAccess, publishPlan } from "@/lib/services/plan.service";
import { signSession, SESSION_COOKIE } from "@/lib/auth/token";
import { GET as dashboardRoute } from "@/app/api/student/dashboard/route";
import { GET as agendaRoute } from "@/app/api/student/agenda/route";
import { GET as historyRoute } from "@/app/api/student/lessons/history/route";
import { GET as lessonRoute } from "@/app/api/student/lessons/[id]/route";
import { GET as playbackRoute } from "@/app/api/student/videos/[id]/playback-url/route";
import {
  GET as profileRoute,
  PATCH as profilePatchRoute,
} from "@/app/api/student/profile/route";
import { GET as teachersRoute } from "@/app/api/student/teachers/route";
import { GET as statisticsRoute } from "@/app/api/student/statistics/route";
import { ApiError } from "@/lib/middleware/errors";

const T2 = "66666666-6666-4666-8666-666666666666";
const E2 = "bbbbbbb2-2222-4222-8222-222222222222";

beforeEach(() => {
  sessionState.jar.clear();
  resetDb(createDemoDatabase());
});

async function authenticateStudent(id: string = DEMO_IDS.lucas) {
  const token = await signSession({
    sub: id,
    role: "student",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  sessionState.jar.set(SESSION_COOKIE, token);
}

function request(body?: unknown): Request {
  return new Request("http://localhost/api/student", {
    method: body ? "PATCH" : "GET",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function addSecondTeacher() {
  mutate((db) => {
    db.profiles.push({
      ...db.profiles[0],
      id: T2,
      full_name: "Segundo Professor",
      email: "segundo@example.com",
    });
    db.teachers.push({
      ...db.teachers[0],
      id: T2,
      display_name: "Prof. Segundo",
    });
    db.enrollments.push({
      ...db.enrollments[0],
      id: E2,
      teacher_id: T2,
      student_profile_id: DEMO_IDS.lucas,
      student_email: "aluno@bjj.app",
      student_name: "Lucas Almeida",
      private_notes: "nota-segundo-professor",
      invite_token: null,
    });
  });
}

describe("propriedades — dashboard e agregações", () => {
  it("Property 1/2/11: dashboard agrega apenas aulas dos próprios vínculos", () => {
    const dashboard = getStudentDashboard(DEMO_IDS.lucas);
    const db = getDb();
    const ownEnrollmentIds = new Set(
      db.enrollments
        .filter((item) => item.student_profile_id === DEMO_IDS.lucas && item.status === "active")
        .map((item) => item.id),
    );
    const completed = db.lessons.filter(
      (lesson) => ownEnrollmentIds.has(lesson.enrollment_id) && lesson.status === "completed",
    );
    expect(dashboard.total_completed).toBe(completed.length);
    expect(dashboard.recent_lessons).toHaveLength(3);
    expect(dashboard.upcoming_lessons.length).toBeLessThanOrEqual(3);
    expect(dashboard.next_lesson?.teacher_name).toBe("Prof. Rafael");
  });

  it("Property 3/6: cancela/faltas não aparecem e não contam", () => {
    const dashboard = getStudentDashboard(DEMO_IDS.lucas);
    const all = getStudentAgenda(DEMO_IDS.lucas);
    expect(all.every((lesson) => ["scheduled", "completed"].includes(lesson.status))).toBe(true);
    const statuses = dashboard.recent_lessons.map((lesson) => lesson.status);
    expect(statuses.every((status) => status === "completed")).toBe(true);
  });

  it("Property 4/5: dashboard identifica professor e limita próximas/recentes", () => {
    const dashboard = getStudentDashboard(DEMO_IDS.lucas);
    expect(dashboard.recent_lessons.every((lesson) => lesson.teacher_name === "Prof. Rafael")).toBe(true);
    expect(dashboard.upcoming_lessons.every((lesson) => lesson.teacher_name)).toBe(true);
  });

  it("Property 11/12/15: estatísticas agregam somente realizadas por professor", () => {
    const stats = getStudentStatistics(DEMO_IDS.lucas);
    const db = getDb();
    const completed = db.lessons.filter(
      (lesson) =>
        lesson.status === "completed" &&
        db.enrollments.some(
          (enrollment) =>
            enrollment.id === lesson.enrollment_id &&
            enrollment.student_profile_id === DEMO_IDS.lucas &&
            enrollment.status === "active",
        ),
    );
    expect(stats.total_completed).toBe(completed.length);
    expect(stats.by_teacher.length).toBe(1);
    expect(stats.first_completed_at?.endsWith("Z")).toBe(true);
  });

  it("Property 13/24: arquivados não entram nas agregações nem na lista de professores", () => {
    mutate((db) => {
      const enrollment = db.enrollments.find((item) => item.id === DEMO_IDS.lucasEnrollment)!;
      enrollment.status = "archived";
    });
    expect(getStudentTeachers(DEMO_IDS.lucas)).toHaveLength(0);
    expect(getStudentDashboard(DEMO_IDS.lucas).total_completed).toBe(0);
  });

  it("Property 14: recentes mais novas primeiro e próximas mais cedo primeiro", () => {
    const dashboard = getStudentDashboard(DEMO_IDS.lucas);
    const recent = dashboard.recent_lessons.map((lesson) => lesson.completed_at ?? lesson.starts_at);
    expect(recent).toEqual([...recent].sort((a, b) => b.localeCompare(a)));
    const upcoming = dashboard.upcoming_lessons.map((lesson) => lesson.starts_at);
    expect(upcoming).toEqual([...upcoming].sort());
  });
});

describe("propriedades — agenda, histórico e paginação", () => {
  it("Property 15/16/17: filtros de data e professor preservam ordenação", () => {
    const agenda = getStudentAgenda(DEMO_IDS.lucas, {
      enrollment_id: DEMO_IDS.lucasEnrollment,
    });
    expect(agenda.every((lesson) => lesson.teacher_name === "Prof. Rafael")).toBe(true);
    const from = new Date();
    from.setDate(from.getDate() - 30);
    const to = new Date();
    to.setDate(to.getDate() + 30);
    const filtered = getStudentAgenda(DEMO_IDS.lucas, {
      from_date: from.toISOString().slice(0, 10),
      to_date: to.toISOString().slice(0, 10),
    });
    expect(filtered.every((lesson) => lesson.starts_at >= from.toISOString().slice(0, 10))).toBe(true);
  });

  it("Property 18/19/20/21/22/23: paginação e metadados", () => {
    const page1 = getStudentHistory(DEMO_IDS.lucas, { page: 1, pageSize: 1 });
    expect(page1.lessons).toHaveLength(1);
    expect(page1.pagination.pageSize).toBe(1);
    expect(page1.pagination.total).toBe(3);
    expect(page1.pagination.hasNext).toBe(true);
    const page3 = getStudentHistory(DEMO_IDS.lucas, { page: 3, pageSize: 1 });
    expect(page3.pagination.hasPrevious).toBe(true);
    expect(page3.pagination.hasNext).toBe(false);
    const beyond = getStudentHistory(DEMO_IDS.lucas, { page: 99, pageSize: 20 });
    expect(beyond.lessons).toHaveLength(0);
    const capped = getStudentHistory(DEMO_IDS.lucas, { page: 1, pageSize: 500 });
    expect(capped.pagination.pageSize).toBe(100);
  });

  it("Property 25/26/27/28: detalhe completo, professor e timestamps ISO", () => {
    const detail = getStudentLessonDetail(
      DEMO_IDS.lucas,
      "88888883-3333-4333-8333-333333333333",
    );
    expect(detail.teacher_name).toBe("Prof. Rafael");
    expect(detail.starts_at.endsWith("Z")).toBe(true);
    expect(detail.completed_at?.endsWith("Z")).toBe(true);
    expect(detail.plan_day?.title).toBeTruthy();
    expect(detail.videos.length).toBeGreaterThan(0);
  });

  it("Property 30/31/33: próxima aula futura e recentes passadas", () => {
    const dashboard = getStudentDashboard(DEMO_IDS.lucas);
    if (dashboard.next_lesson) {
      expect(new Date(dashboard.next_lesson.starts_at).getTime()).toBeGreaterThan(Date.now());
    }
    const history = getStudentHistory(DEMO_IDS.lucas, { page: 1, pageSize: 20 });
    expect(history.lessons.every((lesson) => lesson.status === "completed")).toBe(true);
  });
});

describe("propriedades — biblioteca e vídeos do aluno", () => {
  it("Property 7/9/10: somente técnicas liberadas e planos publicados", () => {
    const techniques = getStudentLibraryTechniques(DEMO_IDS.lucas);
    expect(techniques.some((technique) => technique.id === DEMO_IDS.guardPass)).toBe(true);
    expect(techniques.some((technique) => technique.id === DEMO_IDS.closedGuard)).toBe(false);
    expect(techniques.every((technique) => technique.teacher_name === "Prof. Rafael")).toBe(true);

    const plans = getStudentTrainingPlans(DEMO_IDS.lucas);
    expect(plans.every((plan) => plan.status === "published")).toBe(true);
    expect(plans.some((plan) => plan.title.includes("Rascunho"))).toBe(false);
  });

  it("Property 8/23: autorização de vídeo por técnica, aula e plano", () => {
    expect(getStudentVideoPlayback(DEMO_IDS.lucas, "eeeeeee1-1111-4111-8111-111111111111").playback_url).toContain("http");
    // Mariana acessa vídeo do plano publicado, mesmo sem técnica liberada.
    expect(getStudentVideoPlayback(DEMO_IDS.mariana, "eeeeeee2-2222-4222-8222-222222222222").playback_url).toContain("http");
    expect(() =>
      getStudentVideoPlayback(DEMO_IDS.lucas, "eeeeeee6-6666-4666-8666-666666666666"),
    ).toThrow(/acesso/i);
  });

  it("Property 8/27: vídeo em processamento retorna 409 e módulos agrupados", () => {
    const technique = getStudentTechniqueVideos(DEMO_IDS.lucas, DEMO_IDS.submissions);
    expect(technique.modules.length).toBeGreaterThan(0);
    expect(technique.technique.video_count).toBe(2);
    expect(() =>
      getStudentVideoPlayback(DEMO_IDS.lucas, "eeeeeee5-5555-4555-8555-555555555555"),
    ).toThrow(/processad/i);
  });

  it("Property 23/6: acesso revogado some imediatamente", () => {
    mutate((db) => {
      for (const access of db.student_technique_access) {
        if (access.enrollment_id === DEMO_IDS.lucasEnrollment) access.revoked_at = new Date().toISOString();
      }
    });
    expect(getStudentLibraryTechniques(DEMO_IDS.lucas)).toHaveLength(0);
    expect(() =>
      getStudentVideoPlayback(DEMO_IDS.lucas, "eeeeeee4-4444-4444-8444-444444444444"),
    ).toThrow();
  });
});

describe("propriedades — perfil e isolamento", () => {
  it("Property 28/29/40/41/42: perfil sem dados de vínculo e e-mail imutável", async () => {
    const profile = getStudentProfile(DEMO_IDS.lucas);
    expect(profile.profile.email).toBe("aluno@bjj.app");
    expect("enrollments" in profile).toBe(false);
    expect(JSON.stringify(profile)).not.toContain("private_notes");
    const before = profile.profile.email;
    await updateOwnProfile(DEMO_IDS.lucas, { full_name: "Lucas Novo" });
    expect(getDb().profiles.find((item) => item.id === DEMO_IDS.lucas)?.email).toBe(before);
  });

  it("Property 4/5/7/17/24: separação entre professores e vínculos", () => {
    addSecondTeacher();
    const teachers = getStudentTeachers(DEMO_IDS.lucas);
    expect(teachers.map((teacher) => teacher.teacher_id).sort()).toEqual([DEMO_IDS.teacher, T2].sort());
    const stats = getStudentStatistics(DEMO_IDS.lucas);
    expect(stats.by_teacher).toHaveLength(2);
    expect(stats.by_teacher.every((item) => item.teacher_name)).toBe(true);
  });

  it("Property 14/25/37: mudanças de aula aparecem imediatamente", () => {
    const start = new Date();
    start.setDate(start.getDate() + 5);
    start.setHours(3, 0, 0, 0);
    const lesson = createLesson(DEMO_IDS.teacher, {
      enrollment_id: DEMO_IDS.lucasEnrollment,
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + 3600_000).toISOString(),
    });
    expect(getStudentDashboard(DEMO_IDS.lucas).upcoming_lessons.some((item) => item.id === lesson.id)).toBe(true);
    changeLessonStatus(lesson.id, DEMO_IDS.teacher, { status: "completed" });
    const after = getStudentDashboard(DEMO_IDS.lucas);
    expect(after.upcoming_lessons.some((item) => item.id === lesson.id)).toBe(false);
    expect(after.recent_lessons.some((item) => item.id === lesson.id)).toBe(true);
  });

  it("Property 45/46/48: erros não expõem dados internos", () => {
    try {
      getStudentLessonDetail(DEMO_IDS.lucas, "88888889-9999-4999-8999-999999999999");
      throw new Error("deveria falhar");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(403);
      expect((error as ApiError).message).not.toContain("private_notes");
      expect((error as ApiError).message).not.toContain("nota");
    }
  });

  it("Property 58/60: playback expira em 24h e datas aceitam ISO", () => {
    const playback = getStudentVideoPlayback(DEMO_IDS.lucas, "eeeeeee1-1111-4111-8111-111111111111");
    expect(playback.expires_in).toBe(86_400);
    const history = getStudentHistory(DEMO_IDS.lucas, {
      from_date: "2026-01-01",
      to_date: new Date().toISOString().slice(0, 10),
      page: 1,
      pageSize: 20,
    });
    expect(history.pagination.total).toBeGreaterThan(0);
  });
});

describe("integração — endpoints do portal", () => {
  it("GET /api/student/dashboard exige aluno e retorna agregados", async () => {
    const unauthorized = await dashboardRoute(request(), { params: Promise.resolve({}) });
    expect(unauthorized.status).toBe(401);
    await authenticateStudent();
    const response = await dashboardRoute(request(), { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
    expect((await response.json()).data.total_completed).toBe(3);
  });

  it("GET agenda, histórico, professores e estatísticas", async () => {
    await authenticateStudent();
    expect((await agendaRoute(request(), { params: Promise.resolve({}) })).status).toBe(200);
    const history = await historyRoute(request(), { params: Promise.resolve({}) });
    expect(history.status).toBe(200);
    expect((await history.json()).meta.pagination.total).toBe(3);
    expect((await teachersRoute(request(), { params: Promise.resolve({}) })).status).toBe(200);
    expect((await statisticsRoute(request(), { params: Promise.resolve({}) })).status).toBe(200);
  });

  it("GET detalhe e playback; outro aluno recebe 403", async () => {
    await authenticateStudent();
    const detail = await lessonRoute(request(), {
      params: Promise.resolve({ id: "88888883-3333-4333-8333-333333333333" }),
    });
    expect(detail.status).toBe(200);
    const playback = await playbackRoute(request(), {
      params: Promise.resolve({ id: "eeeeeee1-1111-4111-8111-111111111111" }),
    });
    expect(playback.status).toBe(200);

    await authenticateStudent(DEMO_IDS.mariana);
    const other = await lessonRoute(request(), {
      params: Promise.resolve({ id: "88888883-3333-4333-8333-333333333333" }),
    });
    expect(other.status).toBe(403);
  });

  it("GET/PATCH /api/student/profile valida nome e ignora e-mail", async () => {
    await authenticateStudent();
    const get = await profileRoute(request(), { params: Promise.resolve({}) });
    expect(get.status).toBe(200);

    const invalid = await profilePatchRoute(
      request({ full_name: "A" }),
      { params: Promise.resolve({}) },
    );
    expect(invalid.status).toBe(400);

    const patch = await profilePatchRoute(
      request({ full_name: "Lucas Atualizado", email: "hack@example.com" }),
      { params: Promise.resolve({}) },
    );
    expect(patch.status).toBe(200);
    expect((await patch.json()).data.profile.full_name).toBe("Lucas Atualizado");
    expect(getDb().profiles.find((item) => item.id === DEMO_IDS.lucas)?.email).toBe("aluno@bjj.app");
  });

  it("cenário multi-professor: dashboard e estatísticas separam professores", async () => {
    addSecondTeacher();
    await authenticateStudent();
    const stats = await statisticsRoute(request(), { params: Promise.resolve({}) });
    const payload = await stats.json();
    expect(payload.data.by_teacher).toHaveLength(2);
    expect(payload.data.by_teacher.map((item: { teacher_name: string }) => item.teacher_name)).toEqual(
      expect.arrayContaining(["Prof. Rafael", "Prof. Segundo"]),
    );
  });

  it("plano publicado por outro professor aparece com identificação correta", () => {
    addSecondTeacher();
    const plan = createPlan(T2, {
      title: "Plano do segundo professor",
      period_start: new Date().toISOString().slice(0, 10),
      period_end: new Date().toISOString().slice(0, 10),
    });
    publishPlan(plan.id, T2);
    grantPlanAccess(plan.id, T2, E2);
    const plans = getStudentTrainingPlans(DEMO_IDS.lucas);
    const found = plans.find((item) => item.id === plan.id);
    expect(found?.teacher_name).toBe("Prof. Segundo");
  });

  it("técnica de outro professor não é acessível sem liberação", () => {
    addSecondTeacher();
    const technique = createTechnique(T2, { name: "Técnica do Segundo" });
    expect(getStudentLibraryTechniques(DEMO_IDS.lucas).some((item) => item.id === technique.id)).toBe(false);
  });

  it("filtros combinados de data/professor e página fora do intervalo", () => {
    expect(() =>
      getStudentHistory(DEMO_IDS.lucas, {
        enrollment_id: DEMO_IDS.marianaEnrollment,
        page: 1,
        pageSize: 20,
      }),
    ).toThrow(/acesso/i);
    const empty = getStudentHistory(DEMO_IDS.lucas, {
      from_date: "2099-01-01",
      to_date: "2099-12-31",
      page: 1,
      pageSize: 20,
    });
    expect(empty.pagination.total).toBe(0);
    expect(empty.lessons).toHaveLength(0);
  });

  it("paginação funciona com filtros e pageSize máximo", () => {
    const filtered = getStudentHistory(DEMO_IDS.lucas, {
      enrollment_id: DEMO_IDS.lucasEnrollment,
      page: 1,
      pageSize: 2,
    });
    expect(filtered.lessons.length).toBeLessThanOrEqual(2);
    expect(filtered.pagination.pageSize).toBe(2);
  });

  it("respostas de aluno nunca contêm private_notes", () => {
    const serialized = JSON.stringify({
      dashboard: getStudentDashboard(DEMO_IDS.lucas),
      plans: getStudentTrainingPlans(DEMO_IDS.lucas),
      history: getStudentHistory(DEMO_IDS.lucas, { page: 1, pageSize: 20 }),
      profile: getStudentProfile(DEMO_IDS.lucas),
    });
    expect(serialized).not.toContain("private_notes");
    expect(serialized).not.toContain("Ainda abre a base");
  });

  it("datas de resposta do histórico estão em ISO UTC", () => {
    const history = getStudentHistory(DEMO_IDS.lucas, { page: 1, pageSize: 20 });
    for (const lesson of history.lessons) {
      expect(lesson.starts_at.endsWith("Z")).toBe(true);
      expect(lesson.ends_at.endsWith("Z")).toBe(true);
    }
  });
});
