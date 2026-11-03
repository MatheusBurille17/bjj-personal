import { beforeEach, describe, expect, it } from "vitest";
import { createDemoDatabase, DEMO_IDS } from "@/lib/db/seed";
import { getDb, resetDb } from "@/lib/db/store";
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
import { ApiError } from "@/lib/middleware/errors";

beforeEach(() => {
  resetDb(createDemoDatabase());
});

function expectApiError(fn: () => unknown, status: number) {
  try {
    fn();
    throw new Error("Esperava um ApiError");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(status);
  }
}

describe("portal do aluno", () => {
  it("monta o dashboard com próxima aula, histórico e professores", () => {
    const dashboard = getStudentDashboard(DEMO_IDS.lucas);
    expect(dashboard.next_lesson).not.toBeNull();
    expect(dashboard.total_completed).toBe(3);
    expect(dashboard.recent_lessons).toHaveLength(3);
    expect(dashboard.upcoming_lessons.length).toBeGreaterThan(0);
    expect(dashboard.published_plans).toBe(1);
    expect(dashboard.teachers[0].display_name).toBe("Prof. Rafael");
  });

  it("não expõe notas privadas nos detalhes de aula", () => {
    const detail = getStudentLessonDetail(
      DEMO_IDS.lucas,
      "88888883-3333-4333-8333-333333333333",
    );
    expect("private_notes" in detail).toBe(false);
    expect(JSON.stringify(detail)).not.toContain("Próxima etapa");
    expect(detail.shared_notes).toContain("Corrigimos");
  });

  it("oculta aulas canceladas e faltas da agenda e do histórico", () => {
    const agenda = getStudentAgenda(DEMO_IDS.lucas);
    expect(agenda.every((lesson) => ["scheduled", "completed"].includes(lesson.status))).toBe(
      true,
    );
    const history = getStudentHistory(DEMO_IDS.lucas, { page: 1, pageSize: 20 });
    expect(history.lessons.every((lesson) => lesson.status === "completed")).toBe(true);
    expect(history.pagination.total).toBe(3);
  });

  it("ordena o histórico do mais recente para o mais antigo", () => {
    const history = getStudentHistory(DEMO_IDS.lucas, { page: 1, pageSize: 20 });
    const timestamps = history.lessons.map((lesson) =>
      new Date(lesson.completed_at ?? lesson.starts_at).getTime(),
    );
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
  });

  it("filtra histórico por professor e período", () => {
    const history = getStudentHistory(DEMO_IDS.lucas, {
      enrollment_id: DEMO_IDS.lucasEnrollment,
      page: 1,
      pageSize: 20,
    });
    expect(history.pagination.total).toBe(3);

    const future = getStudentHistory(DEMO_IDS.lucas, {
      from_date: "2099-01-01",
      page: 1,
      pageSize: 20,
    });
    expect(future.pagination.total).toBe(0);
  });

  it("rejeita acesso a aula de outro aluno", () => {
    expectApiError(
      () => getStudentLessonDetail(DEMO_IDS.lucas, "88888889-9999-4999-8999-999999999999"),
      403,
    );
  });

  it("lista apenas técnicas liberadas e vídeos autorizados", () => {
    const techniques = getStudentLibraryTechniques(DEMO_IDS.lucas);
    expect(techniques.map((item) => item.name).sort()).toEqual([
      "Finalizações",
      "Passagem de Guarda",
    ]);

    const videos = getStudentTechniqueVideos(DEMO_IDS.lucas, DEMO_IDS.guardPass);
    expect(videos.modules.length).toBeGreaterThan(0);
    expect(videos.technique.video_count).toBe(3);

    expectApiError(
      () => getStudentTechniqueVideos(DEMO_IDS.lucas, DEMO_IDS.closedGuard),
      403,
    );
  });

  it("autoriza reprodução por técnica, aula ou plano publicado", () => {
    const byTechnique = getStudentVideoPlayback(
      DEMO_IDS.lucas,
      "eeeeeee1-1111-4111-8111-111111111111",
    );
    expect(byTechnique.playback_url).toContain("http");

    // Remove a liberação da técnica; o vídeo continua acessível por estar
    // associado a uma aula do aluno.
    const db = getDb();
    for (const access of db.student_technique_access.filter(
      (item) =>
        item.enrollment_id === DEMO_IDS.lucasEnrollment &&
        item.technique_id === DEMO_IDS.guardPass,
    )) {
      access.revoked_at = new Date().toISOString();
    }
    const byLesson = getStudentVideoPlayback(
      DEMO_IDS.lucas,
      "eeeeeee2-2222-4222-8222-222222222222",
    );
    expect(byLesson.playback_url).toContain("http");

    // Mariana só tem acesso à Guarda Fechada, mas o plano publicado contém
    // vídeos da Passagem de Guarda.
    const byPlan = getStudentVideoPlayback(
      DEMO_IDS.mariana,
      "eeeeeee1-1111-4111-8111-111111111111",
    );
    expect(byPlan.playback_url).toContain("http");

    expectApiError(
      () =>
        getStudentVideoPlayback(
          DEMO_IDS.lucas,
          "eeeeeee6-6666-4666-8666-666666666666",
        ),
      403,
    );
  });

  it("bloqueia vídeo ainda em processamento mesmo autorizado", () => {
    const access = getStudentTechniqueVideos(DEMO_IDS.lucas, DEMO_IDS.submissions);
    expect(access.technique.video_count).toBe(2);
    expectApiError(
      () =>
        getStudentVideoPlayback(
          DEMO_IDS.lucas,
          "eeeeeee5-5555-4555-8555-555555555555",
        ),
      409,
    );
  });

  it("lista planos publicados com professor e dias", () => {
    const plans = getStudentTrainingPlans(DEMO_IDS.lucas);
    expect(plans).toHaveLength(1);
    expect(plans[0].teacher_name).toBe("Prof. Rafael");
    expect(plans[0].days).toHaveLength(3);
    expect(plans[0].days[0].videos.length).toBeGreaterThan(0);
  });

  it("retorna perfil sem dados de vínculo", () => {
    const profile = getStudentProfile(DEMO_IDS.lucas);
    expect(profile.profile.full_name).toBe("Lucas Almeida");
    expect(profile.roles.is_student).toBe(true);
    expect("enrollments" in profile).toBe(false);
    expect(JSON.stringify(profile)).not.toContain("private_notes");
  });

  it("agrega estatísticas por professor", () => {
    const stats = getStudentStatistics(DEMO_IDS.lucas);
    expect(stats.total_completed).toBe(3);
    expect(stats.first_completed_at).not.toBeNull();
    expect(stats.by_teacher).toHaveLength(1);
    expect(stats.by_teacher[0].teacher_name).toBe("Prof. Rafael");
  });

  it("lista professores com próxima aula e contagem", () => {
    const teachers = getStudentTeachers(DEMO_IDS.lucas);
    expect(teachers).toHaveLength(1);
    expect(teachers[0].next_lesson).not.toBeNull();
    expect(teachers[0].completed_lessons).toBe(3);
  });
});
