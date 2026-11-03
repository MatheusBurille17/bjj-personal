import { beforeEach, describe, expect, it } from "vitest";
import { createDemoDatabase, DEMO_IDS } from "@/lib/db/seed";
import { resetDb, getDb } from "@/lib/db/store";
import {
  archiveModule,
  archiveTechnique,
  createModule,
  createTechnique,
  createVideo,
  deleteVideo,
  getAccessForEnrollment,
  getLibraryTree,
  getTeacherPlaybackUrl,
  getTechniques,
  getVideos,
  grantTechniqueAccess,
  moveModule,
  revokeAccess,
  searchVideos,
  unarchiveTechnique,
} from "@/lib/services/library.service";
import {
  changeLessonStatus,
  copyPlanVideosToLesson,
  createLesson,
  createWeeklySlot,
  deleteWeeklySlot,
  detectConflicts,
  generateLessonsFromSlots,
  getLessonDetail,
  getLessonStats,
  setWeeklySlotStatus,
  updateLesson,
  updateWeeklySlot,
} from "@/lib/services/lesson.service";

beforeEach(() => {
  resetDb(createDemoDatabase());
});

function freeSlot(daysAhead: number, hour = 12) {
  const start = new Date();
  start.setDate(start.getDate() + daysAhead);
  start.setHours(hour, 0, 0, 0);
  return { start, end: new Date(start.getTime() + 60 * 60 * 1000) };
}

describe("biblioteca de técnicas", () => {
  it("cria técnica, módulo e vídeo com metadados", () => {
    const technique = createTechnique(DEMO_IDS.teacher, {
      name: "Técnica Nova",
      description: "Descrição",
    });
    expect(technique.status).toBe("active");
    expect(technique.sort_order).toBeGreaterThan(0);

    const moduleRecord = createModule(DEMO_IDS.teacher, {
      technique_id: technique.id,
      name: "Módulo Novo",
    });
    expect(moduleRecord.technique_id).toBe(technique.id);

    const video = createVideo(DEMO_IDS.teacher, {
      module_id: moduleRecord.id,
      title: "Vídeo Novo",
      status: "ready",
      duration_seconds: 300,
    });
    expect(video.technique_id).toBe(technique.id);
    expect(video.status).toBe("ready");
    expect(getVideos(moduleRecord.id, DEMO_IDS.teacher)).toHaveLength(1);
  });

  it("lista apenas técnicas ativas por padrão", () => {
    const active = getTechniques(DEMO_IDS.teacher, { pageSize: 100 });
    expect(active.techniques.every((item) => item.status === "active")).toBe(true);

    const all = getTechniques(DEMO_IDS.teacher, { pageSize: 100, includeArchived: true });
    expect(all.techniques.length).toBeGreaterThanOrEqual(active.techniques.length);
  });

  it("arquiva técnica em cascata e reativa apenas a técnica", () => {
    archiveTechnique(DEMO_IDS.guardPass, DEMO_IDS.teacher);
    const db = getDb();
    expect(db.techniques.find((item) => item.id === DEMO_IDS.guardPass)?.status).toBe(
      "archived",
    );
    expect(
      db.modules
        .filter((item) => item.technique_id === DEMO_IDS.guardPass)
        .every((item) => item.status === "archived"),
    ).toBe(true);
    expect(
      db.videos
        .filter((item) => item.technique_id === DEMO_IDS.guardPass)
        .every((item) => item.status === "archived"),
    ).toBe(true);

    unarchiveTechnique(DEMO_IDS.guardPass, DEMO_IDS.teacher);
    expect(getDb().techniques.find((item) => item.id === DEMO_IDS.guardPass)?.status).toBe(
      "active",
    );
    expect(
      getDb().modules
        .filter((item) => item.technique_id === DEMO_IDS.guardPass)
        .every((item) => item.status === "archived"),
    ).toBe(true);
  });

  it("arquiva módulo em cascata para os vídeos", () => {
    const moduleRecord = getDb().modules.find(
      (item) => item.id === DEMO_IDS.moduleGuardExecution,
    )!;
    expect(moduleRecord.status).toBe("active");
    archiveModule(moduleRecord.id, DEMO_IDS.teacher);
    expect(
      getDb().videos
        .filter((item) => item.module_id === moduleRecord.id)
        .every((item) => item.status === "archived"),
    ).toBe(true);
  });

  it("move módulo entre técnicas do mesmo professor", () => {
    const moduleRecord = createModule(DEMO_IDS.teacher, {
      technique_id: DEMO_IDS.submissions,
      name: "Módulo Móvel",
    });
    const moved = moveModule(moduleRecord.id, DEMO_IDS.teacher, DEMO_IDS.guardPass);
    expect(moved.technique_id).toBe(DEMO_IDS.guardPass);
  });

  it("busca vídeos por título em toda a biblioteca", () => {
    const result = searchVideos(DEMO_IDS.teacher, { search: "PASSAGEM", pageSize: 50 });
    expect(result.videos.length).toBeGreaterThan(0);
    expect(result.videos.every((item) => item.title.toLowerCase().includes("passagem"))).toBe(
      true,
    );
    const empty = searchVideos(DEMO_IDS.teacher, { search: "  ", pageSize: 50 });
    expect(empty.videos.length).toBeGreaterThan(0);
  });

  it("impede excluir vídeo referenciado em plano/aula", () => {
    expect(() =>
      deleteVideo("eeeeeee1-1111-4111-8111-111111111111", DEMO_IDS.teacher),
    ).toThrow(/arquive/i);
  });

  it("exclui vídeo sem referências", () => {
    const video = createVideo(DEMO_IDS.teacher, {
      module_id: DEMO_IDS.moduleGuardExecution,
      title: "Vídeo Descartável",
      status: "ready",
    });
    deleteVideo(video.id, DEMO_IDS.teacher);
    expect(getDb().videos.some((item) => item.id === video.id)).toBe(false);
  });

  it("só gera playback para vídeo pronto", () => {
    expect(getTeacherPlaybackUrl("eeeeeee1-1111-4111-8111-111111111111", DEMO_IDS.teacher)).toContain(
      "http",
    );
    expect(() =>
      getTeacherPlaybackUrl("eeeeeee5-5555-4555-8555-555555555555", DEMO_IDS.teacher),
    ).toThrow(/disponível/i);
  });

  it("libera e revoga acesso de técnica por aluno", () => {
    const access = grantTechniqueAccess(
      DEMO_IDS.teacher,
      DEMO_IDS.marianaEnrollment,
      DEMO_IDS.guardPass,
    );
    expect(
      getAccessForEnrollment(DEMO_IDS.marianaEnrollment, DEMO_IDS.teacher),
    ).toHaveLength(2);
    expect(() =>
      grantTechniqueAccess(DEMO_IDS.teacher, DEMO_IDS.marianaEnrollment, DEMO_IDS.guardPass),
    ).toThrow();
    revokeAccess(access.id, DEMO_IDS.teacher);
    expect(
      getAccessForEnrollment(DEMO_IDS.marianaEnrollment, DEMO_IDS.teacher).some(
        (item) => item.id === access.id,
      ),
    ).toBe(false);
  });

  it("retorna a árvore completa da biblioteca", () => {
    const tree = getLibraryTree(DEMO_IDS.teacher, true);
    expect(tree.techniques.length).toBe(3);
    expect(tree.modules[DEMO_IDS.guardPass].length).toBe(3);
    expect(tree.videos[DEMO_IDS.moduleGuardExecution].length).toBeGreaterThan(0);
  });
});

describe("agenda e aulas", () => {
  it("detecta conflito com aula agendada existente", () => {
    const existing = getDb().lessons.find(
      (item) => item.id === "88888884-4444-4444-8444-444444444444",
    )!;
    const conflicts = detectConflicts(
      DEMO_IDS.teacher,
      existing.starts_at,
      existing.ends_at,
    );
    expect(conflicts.some((item) => item.id === existing.id)).toBe(true);
  });

  it("recusa criar aula em conflito e permite criar em horário livre", () => {
    const existing = getDb().lessons.find(
      (item) => item.id === "88888884-4444-4444-8444-444444444444",
    )!;
    expect(() =>
      createLesson(DEMO_IDS.teacher, {
        enrollment_id: DEMO_IDS.lucasEnrollment,
        starts_at: existing.starts_at,
        ends_at: existing.ends_at,
      }),
    ).toThrow();

    const { start, end } = freeSlot(3, 9);
    const lesson = createLesson(DEMO_IDS.teacher, {
      enrollment_id: DEMO_IDS.lucasEnrollment,
      plan_day_id: "fffffff1-1111-4111-8111-111111111111",
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
    });
    expect(lesson.status).toBe("scheduled");
    expect(lesson.title_snapshot).toBe("Base e postura");
  });

  it("copia vídeos do dia do plano sem duplicar", () => {
    const { start, end } = freeSlot(4, 9);
    const lesson = createLesson(DEMO_IDS.teacher, {
      enrollment_id: DEMO_IDS.lucasEnrollment,
      plan_day_id: "fffffff1-1111-4111-8111-111111111111",
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
    });
    const copied = copyPlanVideosToLesson(lesson.id, DEMO_IDS.teacher);
    expect(copied.videos).toHaveLength(1);
    expect(copied.videos[0].source).toBe("plan");
    const again = copyPlanVideosToLesson(lesson.id, DEMO_IDS.teacher);
    expect(again.videos).toHaveLength(1);
  });

  it("conclui aula e bloqueia alterações de horário depois", () => {
    const { start, end } = freeSlot(5, 9);
    const lesson = createLesson(DEMO_IDS.teacher, {
      enrollment_id: DEMO_IDS.lucasEnrollment,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
    });
    const completed = changeLessonStatus(lesson.id, DEMO_IDS.teacher, {
      status: "completed",
      shared_notes: "Boa aula",
    });
    expect(completed.status).toBe("completed");
    expect(completed.completed_at).not.toBeNull();
    expect(() =>
      updateLesson(lesson.id, DEMO_IDS.teacher, {
        starts_at: new Date(start.getTime() + 86_400_000).toISOString(),
      }),
    ).toThrow(/não podem ter data/i);
    expect(() =>
      changeLessonStatus(lesson.id, DEMO_IDS.teacher, { status: "cancelled" }),
    ).toThrow();
  });

  it("registra cancelamento e falta sem contar como realizadas", () => {
    const { start, end } = freeSlot(6, 9);
    const lesson = createLesson(DEMO_IDS.teacher, {
      enrollment_id: DEMO_IDS.lucasEnrollment,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
    });
    const statsBefore = getLessonStats(DEMO_IDS.teacher, {
      enrollment_id: DEMO_IDS.lucasEnrollment,
    });
    changeLessonStatus(lesson.id, DEMO_IDS.teacher, { status: "cancelled" });
    const statsAfter = getLessonStats(DEMO_IDS.teacher, {
      enrollment_id: DEMO_IDS.lucasEnrollment,
    });
    expect(statsAfter.cancelled).toBe(statsBefore.cancelled + 1);
    expect(statsAfter.completed).toBe(statsBefore.completed);
  });

  it("gera sugestões por recorrência e evita duplicatas", () => {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 21);
    const format = (date: Date) => date.toISOString().slice(0, 10);

    const preview = generateLessonsFromSlots(DEMO_IDS.teacher, {
      date_from: format(from),
      date_to: format(to),
      confirm: false,
    });
    expect(preview.suggestions.length).toBeGreaterThan(0);

    const created = generateLessonsFromSlots(DEMO_IDS.teacher, {
      date_from: format(from),
      date_to: format(to),
      confirm: true,
    });
    expect(created.created.length).toBe(preview.suggestions.length);

    const second = generateLessonsFromSlots(DEMO_IDS.teacher, {
      date_from: format(from),
      date_to: format(to),
      confirm: true,
    });
    expect(second.created).toHaveLength(0);
  });

  it("pausa, ativa e exclui horário sem aulas geradas", () => {
    const future = new Date();
    future.setDate(future.getDate() + 120);
    const slot = createWeeklySlot(DEMO_IDS.teacher, {
      enrollment_id: DEMO_IDS.marianaEnrollment,
      weekday: 6,
      start_time: "06:00:00",
      end_time: "07:00:00",
      valid_from: future.toISOString().slice(0, 10),
    });
    expect(slot.status).toBe("active");
    const paused = setWeeklySlotStatus(slot.id, DEMO_IDS.teacher, "paused");
    expect(paused.status).toBe("paused");
    const active = setWeeklySlotStatus(slot.id, DEMO_IDS.teacher, "active");
    expect(active.status).toBe("active");
    deleteWeeklySlot(slot.id, DEMO_IDS.teacher);
    expect(getDb().weekly_slots.some((item) => item.id === slot.id)).toBe(false);
  });

  it("valida horário final posterior ao inicial", () => {
    const slot = getDb().weekly_slots[0];
    expect(() =>
      updateWeeklySlot(slot.id, DEMO_IDS.teacher, {
        start_time: "20:00:00",
        end_time: "19:00:00",
      }),
    ).toThrow(/posterior/i);
  });

  it("detalha aula sem expor notas privadas ao aluno no serviço do professor", () => {
    const detail = getLessonDetail(
      "88888883-3333-4333-8333-333333333333",
      DEMO_IDS.teacher,
    );
    expect(detail.private_notes).toBeTruthy();
    expect(detail.student_name).toBe("Lucas Almeida");
  });
});
