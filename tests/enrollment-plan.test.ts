import { beforeEach, describe, expect, it } from "vitest";
import { createDemoDatabase, DEMO_IDS } from "@/lib/db/seed";
import { resetDb, getDb } from "@/lib/db/store";
import {
  archiveEnrollment,
  createEnrollment,
  deleteEnrollment,
  getEnrollmentDetail,
  getEnrollments,
  pauseEnrollment,
  reactivateEnrollment,
  resendInvitation,
  updateEnrollment,
} from "@/lib/services/enrollment.service";
import {
  createPlan,
  deletePlan,
  duplicatePlan,
  getPlanDetail,
  getPlans,
  grantPlanAccess,
  publishPlan,
  revokePlanAccess,
  unpublishPlan,
  updatePlanDay,
} from "@/lib/services/plan.service";
import { ApiError } from "@/lib/middleware/errors";
import { verifyInviteToken } from "@/lib/services/invitation.service";

beforeEach(() => {
  resetDb(createDemoDatabase());
});

async function expectApiError(promise: Promise<unknown>, status: number) {
  try {
    await promise;
    throw new Error("Esperava um ApiError");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(status);
  }
}

describe("gestão de alunos", () => {
  it("lista apenas vínculos do professor, sem arquivados por padrão", async () => {
    const result = getEnrollments(DEMO_IDS.teacher, {
      search: "",
      status: [],
      page: 1,
      pageSize: 20,
    });
    expect(result.enrollments.map((item) => item.student_name)).toEqual([
      "Lucas Almeida",
      "Mariana Costa",
    ]);
    expect(result.pagination.total).toBe(2);
  });

  it("busca por parte do nome sem diferenciar maiúsculas", () => {
    const result = getEnrollments(DEMO_IDS.teacher, {
      search: "LUCAS",
      status: [],
      page: 1,
      pageSize: 20,
    });
    expect(result.enrollments).toHaveLength(1);
    expect(result.enrollments[0].student_name).toBe("Lucas Almeida");
  });

  it("filtra por status e pagina resultados", () => {
    const pending = getEnrollments(DEMO_IDS.teacher, {
      search: "",
      status: ["pending"],
      page: 1,
      pageSize: 20,
    });
    expect(pending.enrollments).toHaveLength(1);
    expect(pending.enrollments[0].status).toBe("pending");

    const all = getEnrollments(DEMO_IDS.teacher, {
      search: "",
      status: ["active", "paused", "pending"],
      page: 1,
      pageSize: 1,
    });
    expect(all.enrollments).toHaveLength(1);
    expect(all.pagination.hasNext).toBe(true);
  });

  it("cria convite pendente com token seguro e expiração de 7 dias", async () => {
    const { enrollment, invite_url } = await createEnrollment(DEMO_IDS.teacher, {
      student_name: "Novo Aluno",
      student_email: "novo@example.com",
    });
    expect(enrollment.status).toBe("pending");
    expect(enrollment.invite_token).toHaveLength(64);
    expect(enrollment.student_profile_id).toBeNull();
    expect(invite_url).toContain("/invite/");
    const expires = new Date(enrollment.invite_expires_at!);
    const days = (expires.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it("impede convite duplicado ativo/pendente para o mesmo professor", async () => {
    await expectApiError(
      createEnrollment(DEMO_IDS.teacher, {
        student_name: "Lucas Duplicado",
        student_email: "ALUNO@bjj.app",
      }),
      409,
    );
    // Outro professor pode convidar o mesmo e-mail.
    const db = getDb();
    db.teachers.push({
      ...db.teachers[0],
      id: "44444444-4444-4444-8444-444444444444",
      display_name: "Prof. Outro",
    });
    db.profiles.push({
      ...db.profiles[0],
      id: "44444444-4444-4444-8444-444444444444",
      full_name: "Outro Professor",
      email: "outro@bjj.app",
    });
    const result = await createEnrollment("44444444-4444-4444-8444-444444444444", {
      student_name: "Lucas Almeida",
      student_email: "aluno@bjj.app",
    });
    expect(result.enrollment.status).toBe("pending");
  });

  it("valida e expira tokens de convite", () => {
    const invite = verifyInviteToken("demo-invite-pedro-1234567890abcdef");
    expect(invite.student_email).toBe("pedro@bjj.app");
    expect(() => verifyInviteToken("inexistente")).toThrow();

    const db = getDb();
    const pedro = db.enrollments.find((item) => item.id === DEMO_IDS.pedroEnrollment)!;
    pedro.invite_expires_at = new Date(Date.now() - 1000).toISOString();
    expect(() => verifyInviteToken(pedro.invite_token!)).toThrow();
  });

  it("pausa, reativa e arquiva respeitando transições", () => {
    const paused = pauseEnrollment(DEMO_IDS.lucasEnrollment, DEMO_IDS.teacher);
    expect(paused.status).toBe("paused");
    expect(() => pauseEnrollment(DEMO_IDS.lucasEnrollment, DEMO_IDS.teacher)).toThrow();

    const active = reactivateEnrollment(DEMO_IDS.lucasEnrollment, DEMO_IDS.teacher);
    expect(active.status).toBe("active");

    const archived = archiveEnrollment(DEMO_IDS.lucasEnrollment, DEMO_IDS.teacher);
    expect(archived.status).toBe("archived");
    expect(archived.archived_at).not.toBeNull();
    expect(() => archiveEnrollment(DEMO_IDS.lucasEnrollment, DEMO_IDS.teacher)).toThrow();
    expect(() => reactivateEnrollment(DEMO_IDS.lucasEnrollment, DEMO_IDS.teacher)).toThrow();
  });

  it("preserva o histórico ao arquivar", () => {
    archiveEnrollment(DEMO_IDS.lucasEnrollment, DEMO_IDS.teacher);
    const db = getDb();
    const lessons = db.lessons.filter((item) => item.enrollment_id === DEMO_IDS.lucasEnrollment);
    expect(lessons.length).toBeGreaterThan(0);
  });

  it("não exclui vínculo com histórico de aulas", () => {
    expect(() => deleteEnrollment(DEMO_IDS.lucasEnrollment, DEMO_IDS.teacher)).toThrow(
      /arquive/i,
    );
  });

  it("exclui vínculo sem histórico", () => {
    deleteEnrollment(DEMO_IDS.pedroEnrollment, DEMO_IDS.teacher);
    expect(
      getDb().enrollments.some((item) => item.id === DEMO_IDS.pedroEnrollment),
    ).toBe(false);
  });

  it("atualiza dados sem alterar status", () => {
    const updated = updateEnrollment(DEMO_IDS.lucasEnrollment, DEMO_IDS.teacher, {
      student_name: "Lucas A.",
      private_notes: "Nova observação",
    });
    expect(updated.student_name).toBe("Lucas A.");
    expect(updated.status).toBe("active");
    expect(updated.private_notes).toBe("Nova observação");
  });

  it("detalha vínculo com estatísticas de aulas", () => {
    const detail = getEnrollmentDetail(DEMO_IDS.lucasEnrollment, DEMO_IDS.teacher);
    expect(detail.completed_lessons_count).toBe(3);
    expect(detail.scheduled_lessons_count).toBeGreaterThan(0);
    expect(detail.next_lesson).not.toBeNull();
  });

  it("reenvia convite apenas pendente e troca o token", async () => {
    const original = getDb().enrollments.find(
      (item) => item.id === DEMO_IDS.pedroEnrollment,
    )!.invite_token;
    const result = await resendInvitation(DEMO_IDS.pedroEnrollment, DEMO_IDS.teacher);
    expect(result.invite_token).not.toBe(original);
    expect(() => verifyInviteToken(original!)).toThrow();
    expect(verifyInviteToken(result.invite_token).student_email).toBe("pedro@bjj.app");

    await expectApiError(
      resendInvitation(DEMO_IDS.lucasEnrollment, DEMO_IDS.teacher),
      409,
    );
  });
});

describe("planos mensais", () => {
  it("lista rascunhos e publicados, excluindo arquivados", () => {
    const result = getPlans(DEMO_IDS.teacher, { page: 1, pageSize: 20 });
    expect(result.plans.map((plan) => plan.status).sort()).toEqual([
      "draft",
      "published",
    ]);
  });

  it("publica apenas rascunhos e não concede acesso automaticamente", () => {
    const published = publishPlan(DEMO_IDS.planNovember, DEMO_IDS.teacher);
    expect(published.status).toBe("published");
    expect(published.published_at).not.toBeNull();
    expect(published.enrolled_count).toBe(0);
    expect(() => publishPlan(DEMO_IDS.planNovember, DEMO_IDS.teacher)).toThrow();
  });

  it("despublica mantendo published_at e associações", () => {
    const draft = unpublishPlan(DEMO_IDS.planOctober, DEMO_IDS.teacher);
    expect(draft.status).toBe("draft");
    expect(draft.published_at).not.toBeNull();
    expect(getPlanDetail(DEMO_IDS.planOctober, DEMO_IDS.teacher).enrollments).toHaveLength(2);
  });

  it("só libera acesso a plano publicado e impede duplicidade", () => {
    expect(() =>
      grantPlanAccess(DEMO_IDS.planNovember, DEMO_IDS.teacher, DEMO_IDS.lucasEnrollment),
    ).toThrow(/publique/i);

    publishPlan(DEMO_IDS.planNovember, DEMO_IDS.teacher);
    const access = grantPlanAccess(
      DEMO_IDS.planNovember,
      DEMO_IDS.teacher,
      DEMO_IDS.lucasEnrollment,
    );
    expect(access.student_name).toBe("Lucas Almeida");
    expect(() =>
      grantPlanAccess(DEMO_IDS.planNovember, DEMO_IDS.teacher, DEMO_IDS.lucasEnrollment),
    ).toThrow();

    revokePlanAccess(access.id, DEMO_IDS.teacher);
    expect(getPlanDetail(DEMO_IDS.planNovember, DEMO_IDS.teacher).enrollments).toHaveLength(0);
  });

  it("duplica plano como rascunho com dias e vídeos, sem acessos", () => {
    const copy = duplicatePlan(DEMO_IDS.planOctober, DEMO_IDS.teacher);
    expect(copy.title).toBe("Fundamentos do mês (Copy)");
    expect(copy.status).toBe("draft");
    expect(copy.published_at).toBeNull();
    expect(copy.days).toHaveLength(3);
    expect(copy.days.flatMap((day) => day.videos)).toHaveLength(4);
    expect(copy.enrollments).toHaveLength(0);
  });

  it("valida data planejada dentro do período", () => {
    const detail = getPlanDetail(DEMO_IDS.planOctober, DEMO_IDS.teacher);
    expect(() =>
      updatePlanDay(detail.days[0].id, DEMO_IDS.teacher, {
        planned_date: "2026-12-31",
        weekday: null,
      }),
    ).toThrow(/período/i);
  });

  it("impede excluir plano com aulas vinculadas", () => {
    expect(() => deletePlan(DEMO_IDS.planOctober, DEMO_IDS.teacher)).toThrow(/arquive/i);
  });

  it("exclui plano sem referências de aula", () => {
    deletePlan(DEMO_IDS.planNovember, DEMO_IDS.teacher);
    expect(
      getDb().monthly_plans.some((item) => item.id === DEMO_IDS.planNovember),
    ).toBe(false);
  });

  it("cria plano em rascunho", () => {
    const plan = createPlan(DEMO_IDS.teacher, {
      title: "Plano novo",
      period_start: "2026-12-01",
      period_end: "2026-12-31",
    });
    expect(plan.status).toBe("draft");
    expect(plan.plan_day_count).toBe(0);
    expect(plan.enrolled_count).toBe(0);
  });
});
