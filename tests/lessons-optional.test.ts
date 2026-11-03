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
import { getDb, resetDb } from "@/lib/db/store";
import {
  addLessonVideo,
  changeLessonStatus,
  copyPlanVideosToLesson,
  createLesson,
  createWeeklySlot,
  deleteWeeklySlot,
  detectConflicts,
  generateLessonsFromSlots,
  getDailyAgenda,
  getLessonStats,
  getLessons,
  getWeeklyAgenda,
  getWeeklySlots,
  removeLessonVideo,
  reorderLessonVideos,
  setWeeklySlotStatus,
  updateLesson,
  updateWeeklySlot,
} from "@/lib/services/lesson.service";
import {
  getStudentAgenda,
  getStudentHistory,
  getStudentLessonDetail,
  getStudentTeachers,
} from "@/lib/services/portal.service";
import { signSession, SESSION_COOKIE } from "@/lib/auth/token";
import {
  GET as lessonsGetRoute,
  POST as lessonsPostRoute,
} from "@/app/api/lessons/route";
import {
  GET as lessonGetRoute,
  PATCH as lessonPatchRoute,
} from "@/app/api/lessons/[id]/route";
import { PATCH as lessonStatusRoute } from "@/app/api/lessons/[id]/status/route";
import { POST as lessonVideoRoute } from "@/app/api/lessons/[id]/videos/route";
import {
  GET as slotsGetRoute,
  POST as slotsPostRoute,
} from "@/app/api/weekly-slots/route";
import { POST as generateRoute } from "@/app/api/lessons/generate-from-slots/route";
import { GET as upcomingRoute } from "@/app/api/student/lessons/upcoming/route";
import { GET as historyRoute } from "@/app/api/student/lessons/history/route";
import {
  createLessonSchema,
  createWeeklySlotSchema,
  generateLessonsSchema,
  updateWeeklySlotSchema,
} from "@/lib/validation/lesson";

beforeEach(() => {
  sessionState.jar.clear();
  resetDb(createDemoDatabase());
});

async function authenticate(role: "teacher" | "student") {
  const token = await signSession({
    sub: role === "teacher" ? DEMO_IDS.teacher : DEMO_IDS.lucas,
    role,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  sessionState.jar.set(SESSION_COOKIE, token);
}

function request(body?: unknown): Request {
  return new Request("http://localhost/api/lessons", {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function freeDate(days: number, hour = 3) {
  const start = new Date();
  start.setDate(start.getDate() + days);
  start.setHours(hour, 0, 0, 0);
  return { start, end: new Date(start.getTime() + 60 * 60 * 1000) };
}

function makeLesson(days = 2, hour = 3) {
  const { start, end } = freeDate(days, hour);
  return createLesson(DEMO_IDS.teacher, {
    enrollment_id: DEMO_IDS.lucasEnrollment,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    shared_notes: "Aula de teste",
  });
}

describe("propriedades — horários recorrentes", () => {
  it("Property 1/4: criação válida de slot com status ativo e horários", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 6 }), (weekday) => {
        resetDb(createDemoDatabase());
        const slot = createWeeklySlot(DEMO_IDS.teacher, {
          enrollment_id: DEMO_IDS.lucasEnrollment,
          weekday,
          start_time: "08:00:00",
          end_time: "09:30:00",
          valid_from: new Date().toISOString().slice(0, 10),
        });
        expect(slot.status).toBe("active");
        expect(slot.weekday).toBe(weekday);
        expect(slot.start_time).toBe("08:00:00");
        expect(slot.end_time).toBe("09:30:00");
      }),
      { numRuns: 10 },
    );
  });

  it("Property 2/3/5: valida dia da semana, horário e aluno", () => {
    expect(createWeeklySlotSchema.safeParse({ enrollment_id: "x", weekday: 0, start_time: "08:00", end_time: "09:00" }).success).toBe(false);
    expect(
      createWeeklySlotSchema.safeParse({
        enrollment_id: DEMO_IDS.lucasEnrollment,
        weekday: 7,
        start_time: "08:00",
        end_time: "09:00",
      }).success,
    ).toBe(false);
    expect(
      createWeeklySlotSchema.safeParse({
        enrollment_id: DEMO_IDS.lucasEnrollment,
        weekday: 1,
        start_time: "10:00",
        end_time: "09:00",
      }).success,
    ).toBe(false);
    expect(updateWeeklySlotSchema.safeParse({}).success).toBe(false);
  });

  it("Property 6: pausa e ativação validam transição", () => {
    const slot = getDb().weekly_slots[0];
    expect(setWeeklySlotStatus(slot.id, DEMO_IDS.teacher, "paused").status).toBe("paused");
    expect(() => setWeeklySlotStatus(slot.id, DEMO_IDS.teacher, "paused")).toThrow();
    expect(setWeeklySlotStatus(slot.id, DEMO_IDS.teacher, "active").status).toBe("active");
    expect(() => setWeeklySlotStatus(slot.id, DEMO_IDS.teacher, "active")).toThrow();
  });

  it("Property 7: exclusão bloqueada quando há aulas geradas", () => {
    const future = new Date();
    future.setDate(future.getDate() + 60);
    future.setHours(4, 0, 0, 0);
    const slot = createWeeklySlot(DEMO_IDS.teacher, {
      enrollment_id: DEMO_IDS.lucasEnrollment,
      weekday: future.getDay(),
      start_time: "04:00:00",
      end_time: "05:00:00",
      valid_from: future.toISOString().slice(0, 10),
    });
    createLesson(DEMO_IDS.teacher, {
      enrollment_id: DEMO_IDS.lucasEnrollment,
      starts_at: future.toISOString(),
      ends_at: new Date(future.getTime() + 3600_000).toISOString(),
    });
    expect(() => deleteWeeklySlot(slot.id, DEMO_IDS.teacher)).toThrow(/pause/i);

    const cleanDate = new Date();
    cleanDate.setDate(cleanDate.getDate() + 150);
    const clean = createWeeklySlot(DEMO_IDS.teacher, {
      enrollment_id: DEMO_IDS.marianaEnrollment,
      weekday: 6,
      start_time: "05:00:00",
      end_time: "06:00:00",
      valid_from: cleanDate.toISOString().slice(0, 10),
    });
    deleteWeeklySlot(clean.id, DEMO_IDS.teacher);
    expect(getDb().weekly_slots.some((item) => item.id === clean.id)).toBe(false);
  });

  it("Property 24: slots expirados não aparecem e ordenação por dia/hora", () => {
    const slots = getWeeklySlots(DEMO_IDS.teacher);
    expect(slots.every((slot) => !slot.valid_until || slot.valid_until >= new Date().toISOString().slice(0, 10))).toBe(true);
    const sorted = [...slots].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
    expect(slots.map((slot) => slot.id)).toEqual(sorted.map((slot) => slot.id));
  });

  it("valida atualização de horário", () => {
    const slot = getDb().weekly_slots[0];
    expect(() =>
      updateWeeklySlot(slot.id, DEMO_IDS.teacher, { start_time: "20:00:00", end_time: "19:00:00" }),
    ).toThrow(/posterior/i);
  });
});

describe("propriedades — geração e conflitos", () => {
  it("Property 3/32/33/34: geração cria uma aula por ocorrência e todas scheduled", () => {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 14);
    const fmt = (date: Date) => date.toISOString().slice(0, 10);
    const preview = generateLessonsFromSlots(DEMO_IDS.teacher, {
      date_from: fmt(from),
      date_to: fmt(to),
      confirm: false,
    });
    expect(preview.suggestions.length).toBeGreaterThan(0);
    expect(preview.suggestions.every((item) => item.starts_at < item.ends_at)).toBe(true);

    const created = generateLessonsFromSlots(DEMO_IDS.teacher, {
      date_from: fmt(from),
      date_to: fmt(to),
      confirm: true,
    });
    expect(created.created.length).toBe(preview.suggestions.length);
    expect(created.created.every((lesson) => lesson.status === "scheduled")).toBe(true);
    expect(
      generateLessonsFromSlots(DEMO_IDS.teacher, {
        date_from: fmt(from),
        date_to: fmt(to),
        confirm: true,
      }).created,
    ).toHaveLength(0);
  });

  it("Property 32: período máximo de 90 dias", () => {
    expect(
      generateLessonsSchema.safeParse({
        date_from: "2026-01-01",
        date_to: "2026-06-01",
      }).success,
    ).toBe(false);
    expect(
      generateLessonsSchema.safeParse({
        date_from: "2026-01-10",
        date_to: "2026-01-01",
      }).success,
    ).toBe(false);
  });

  it("Property 29/30/31: conflito considera apenas agendadas e horários sobrepostos", () => {
    const existing = getDb().lessons.find((lesson) => lesson.id === "88888884-4444-4444-8444-444444444444")!;
    expect(detectConflicts(DEMO_IDS.teacher, existing.starts_at, existing.ends_at)).toHaveLength(1);
    expect(
      detectConflicts(DEMO_IDS.teacher, existing.starts_at, existing.ends_at, existing.id),
    ).toHaveLength(0);
    expect(() =>
      createLesson(DEMO_IDS.teacher, {
        enrollment_id: DEMO_IDS.lucasEnrollment,
        starts_at: existing.starts_at,
        ends_at: existing.ends_at,
      }),
    ).toThrow(/horário/i);
  });

  it("Property 1/33/34: criação valida fim > início e duração máxima", () => {
    expect(
      createLessonSchema.safeParse({
        enrollment_id: DEMO_IDS.lucasEnrollment,
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() - 1000).toISOString(),
      }).success,
    ).toBe(false);
    expect(
      createLessonSchema.safeParse({
        enrollment_id: DEMO_IDS.lucasEnrollment,
        starts_at: "2026-01-01T08:00:00Z",
        ends_at: "2026-01-01T20:00:00Z",
      }).success,
    ).toBe(false);
  });
});

describe("propriedades — aulas e vídeos", () => {
  it("Property 1/2/5/13: criação armazena campos e status scheduled", () => {
    const lesson = makeLesson();
    expect(lesson.status).toBe("scheduled");
    expect(lesson.teacher_id).toBe(DEMO_IDS.teacher);
    expect(lesson.enrollment_id).toBe(DEMO_IDS.lucasEnrollment);
    expect(lesson.shared_notes).toBe("Aula de teste");
    expect(lesson.starts_at.endsWith("Z")).toBe(true);
  });

  it("Property 7/15/22/27: status final é imutável e conclusão grava completed_at", () => {
    const lesson = makeLesson(1);
    const completed = changeLessonStatus(lesson.id, DEMO_IDS.teacher, { status: "completed" });
    expect(completed.status).toBe("completed");
    expect(completed.completed_at).not.toBeNull();
    expect(() => changeLessonStatus(lesson.id, DEMO_IDS.teacher, { status: "cancelled" })).toThrow();
    expect(() =>
      updateLesson(lesson.id, DEMO_IDS.teacher, { starts_at: new Date().toISOString() }),
    ).toThrow(/data/i);
  });

  it("Property 20/21/36: cancelamento e falta não contam como realizadas", () => {
    const lesson = makeLesson(2);
    const before = getLessonStats(DEMO_IDS.teacher, { enrollment_id: DEMO_IDS.lucasEnrollment });
    changeLessonStatus(lesson.id, DEMO_IDS.teacher, { status: "no_show" });
    const after = getLessonStats(DEMO_IDS.teacher, { enrollment_id: DEMO_IDS.lucasEnrollment });
    expect(after.no_show).toBe(before.no_show + 1);
    expect(after.completed).toBe(before.completed);
  });

  it("Property 35/40: conclusão de aula antiga exige confirmação", () => {
    const past = new Date();
    past.setDate(past.getDate() - 45);
    past.setHours(10, 0, 0, 0);
    const lesson = createLesson(DEMO_IDS.teacher, {
      enrollment_id: DEMO_IDS.lucasEnrollment,
      starts_at: past.toISOString(),
      ends_at: new Date(past.getTime() + 3600_000).toISOString(),
    });
    expect(() => changeLessonStatus(lesson.id, DEMO_IDS.teacher, { status: "completed" })).toThrow(
      /30 dias/i,
    );
    const completed = changeLessonStatus(lesson.id, DEMO_IDS.teacher, {
      status: "completed",
      override_window: true,
    });
    expect(completed.status).toBe("completed");
  });

  it("Property 17/18/19: adiciona, copia e reordena vídeos", () => {
    const lesson = makeLesson(3);
    const withVideo = addLessonVideo(
      lesson.id,
      DEMO_IDS.teacher,
      "eeeeeee1-1111-4111-8111-111111111111",
    );
    expect(withVideo.videos).toHaveLength(1);
    expect(withVideo.videos[0].source).toBe("manual");
    expect(() =>
      addLessonVideo(lesson.id, DEMO_IDS.teacher, "eeeeeee1-1111-4111-8111-111111111111"),
    ).toThrow();

    // Aula com plano copia os vídeos preservando a origem.
    const withPlan = createLesson(DEMO_IDS.teacher, {
      enrollment_id: DEMO_IDS.lucasEnrollment,
      plan_day_id: "fffffff1-1111-4111-8111-111111111111",
      starts_at: freeDate(4).start.toISOString(),
      ends_at: freeDate(4).end.toISOString(),
    });
    const copied = copyPlanVideosToLesson(withPlan.id, DEMO_IDS.teacher);
    expect(copied.videos[0].source).toBe("plan");

    const reordered = reorderLessonVideos(copied.id, DEMO_IDS.teacher, [
      { id: copied.videos[0].id, sort_order: 5 },
    ]);
    expect(reordered.videos[0].sort_order).toBe(5);
    const removed = removeLessonVideo(copied.id, DEMO_IDS.teacher, copied.videos[0].id);
    expect(removed.videos).toHaveLength(0);
  });

  it("Property 18/27: vídeos de aula concluída são imutáveis", () => {
    const lesson = makeLesson(5);
    const withVideo = addLessonVideo(lesson.id, DEMO_IDS.teacher, "eeeeeee1-1111-4111-8111-111111111111");
    changeLessonStatus(lesson.id, DEMO_IDS.teacher, { status: "completed" });
    expect(() =>
      removeLessonVideo(lesson.id, DEMO_IDS.teacher, withVideo.videos[0].id),
    ).toThrow();
    expect(() =>
      addLessonVideo(lesson.id, DEMO_IDS.teacher, "eeeeeee2-2222-4222-8222-222222222222"),
    ).toThrow();
  });

  it("Property 10/54: agenda semanal e diária ordenam por horário", () => {
    const weekly = getWeeklyAgenda(DEMO_IDS.teacher);
    expect(weekly.lessons.every((lesson) => lesson.teacher_id === DEMO_IDS.teacher)).toBe(true);
    const starts = weekly.lessons.map((lesson) => lesson.starts_at);
    expect(starts).toEqual([...starts].sort());
    const daily = getDailyAgenda(DEMO_IDS.teacher, new Date().toISOString().slice(0, 10));
    expect(daily.lessons.every((lesson) => lesson.starts_at.startsWith(daily.date))).toBe(true);
  });

  it("Property 2/9/23: lista por aluno ordena desc e filtra status", () => {
    const result = getLessons(DEMO_IDS.teacher, {
      enrollment_id: DEMO_IDS.lucasEnrollment,
      pageSize: 100,
    });
    const starts = result.lessons.map((lesson) => lesson.starts_at);
    expect(starts).toEqual([...starts].sort((a, b) => b.localeCompare(a)));
    const cancelled = getLessons(DEMO_IDS.teacher, {
      enrollment_id: DEMO_IDS.lucasEnrollment,
      status: ["cancelled"],
      pageSize: 100,
    });
    expect(cancelled.lessons.every((lesson) => lesson.status === "cancelled")).toBe(true);
  });
});

describe("propriedades — visão do aluno", () => {
  it("Property 43/44/45/46: próximas aulas, histórico e notas compartilhadas", () => {
    const upcoming = getStudentAgenda(DEMO_IDS.lucas).filter((lesson) => lesson.status === "scheduled");
    expect(upcoming.every((lesson) => new Date(lesson.starts_at).getTime() > 0)).toBe(true);
    const history = getStudentHistory(DEMO_IDS.lucas, { page: 1, pageSize: 20 });
    expect(history.lessons.every((lesson) => lesson.status === "completed")).toBe(true);
    const completed = history.lessons[0];
    expect(completed.shared_notes).toBeTruthy();
    expect("private_notes" in completed).toBe(false);
  });

  it("Property 7/26: aluno não acessa aula de outro aluno", () => {
    expect(() =>
      getStudentLessonDetail(DEMO_IDS.lucas, "88888889-9999-4999-8999-999999999999"),
    ).toThrow(/acesso/i);
  });

  it("Property 6/48: estatísticas contam apenas realizadas", () => {
    const stats = getLessonStats(DEMO_IDS.teacher, { enrollment_id: DEMO_IDS.lucasEnrollment });
    const lessons = getDb().lessons.filter(
      (lesson) => lesson.enrollment_id === DEMO_IDS.lucasEnrollment && lesson.status === "completed",
    );
    expect(stats.completed).toBe(lessons.length);
    expect(stats.completion_rate).toBeLessThanOrEqual(100);
  });
});

describe("integração — endpoints de agenda e aulas", () => {
  it("POST/GET /api/lessons", async () => {
    await authenticate("teacher");
    const { start, end } = freeDate(7);
    const response = await lessonsPostRoute(
      request({
        enrollment_id: DEMO_IDS.lucasEnrollment,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(201);
    const created = (await response.json()).data;

    const list = await lessonsGetRoute(request(), { params: Promise.resolve({}) });
    expect(list.status).toBe(200);
    expect((await list.json()).data.some((lesson: { id: string }) => lesson.id === created.id)).toBe(true);
  });

  it("GET/PATCH /api/lessons/[id] e status", async () => {
    await authenticate("teacher");
    const lesson = makeLesson(6);
    const detail = await lessonGetRoute(request(), {
      params: Promise.resolve({ id: lesson.id }),
    });
    expect(detail.status).toBe(200);

    const patched = await lessonPatchRoute(
      request({ shared_notes: "Nota atualizada" }),
      { params: Promise.resolve({ id: lesson.id }) },
    );
    expect(patched.status).toBe(200);

    const status = await lessonStatusRoute(
      request({ status: "completed" }),
      { params: Promise.resolve({ id: lesson.id }) },
    );
    expect(status.status).toBe(200);
    expect((await status.json()).data.status).toBe("completed");
  });

  it("POST /api/lessons/[id]/videos associa vídeo pronto", async () => {
    await authenticate("teacher");
    const lesson = makeLesson(9);
    const response = await lessonVideoRoute(
      request({ video_id: "eeeeeee1-1111-4111-8111-111111111111" }),
      { params: Promise.resolve({ id: lesson.id }) },
    );
    expect(response.status).toBe(201);
    expect((await response.json()).data.videos).toHaveLength(1);
  });

  it("POST/GET /api/weekly-slots e geração", async () => {
    await authenticate("teacher");
    const created = await slotsPostRoute(
      request({
        enrollment_id: DEMO_IDS.marianaEnrollment,
        weekday: 0,
        start_time: "07:00:00",
        end_time: "08:00:00",
      }),
      { params: Promise.resolve({}) },
    );
    expect(created.status).toBe(201);
    const list = await slotsGetRoute(request(), { params: Promise.resolve({}) });
    expect((await list.json()).data.length).toBeGreaterThan(0);

    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 30);
    const preview = await generateRoute(
      request({
        date_from: from.toISOString().slice(0, 10),
        date_to: to.toISOString().slice(0, 10),
        confirm: false,
      }),
      { params: Promise.resolve({}) },
    );
    expect(preview.status).toBe(200);
    expect((await preview.json()).data.suggestions.length).toBeGreaterThan(0);
  });

  it("GET /api/student/lessons/upcoming e history exigem aluno", async () => {
    const unauthorized = await upcomingRoute(request(), { params: Promise.resolve({}) });
    expect(unauthorized.status).toBe(401);
    await authenticate("student");
    const upcoming = await upcomingRoute(request(), { params: Promise.resolve({}) });
    expect(upcoming.status).toBe(200);
    const history = await historyRoute(request(), { params: Promise.resolve({}) });
    expect(history.status).toBe(200);
    expect((await history.json()).meta.pagination.total).toBeGreaterThan(0);
  });

  it("lista de professores do aluno inclui próxima aula", () => {
    const teachers = getStudentTeachers(DEMO_IDS.lucas);
    expect(teachers[0].next_lesson).not.toBeNull();
  });
});

describe("limites e erros de agenda", () => {
  it("valida UUID, notas e datas", () => {
    expect(
      createLessonSchema.safeParse({
        enrollment_id: "inválido",
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 3600_000).toISOString(),
      }).success,
    ).toBe(false);
    expect(
      createLessonSchema.safeParse({
        enrollment_id: DEMO_IDS.lucasEnrollment,
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 3600_000).toISOString(),
        shared_notes: "x".repeat(5001),
      }).success,
    ).toBe(false);
    expect(updateWeeklySlotSchema.safeParse({ weekday: 9 }).success).toBe(false);
  });

  it("conflito com aula cancelada não bloqueia nova aula", () => {
    const cancelled = getDb().lessons.find((lesson) => lesson.status === "cancelled")!;
    expect(detectConflicts(DEMO_IDS.teacher, cancelled.starts_at, cancelled.ends_at)).toHaveLength(0);
  });

  it("geração sem slots ativos não cria aulas", () => {
    for (const slot of getDb().weekly_slots) slot.status = "paused";
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 7);
    const result = generateLessonsFromSlots(DEMO_IDS.teacher, {
      date_from: from.toISOString().slice(0, 10),
      date_to: to.toISOString().slice(0, 10),
      confirm: true,
    });
    expect(result.created).toHaveLength(0);
  });
});
