import { randomUUID } from "node:crypto";
import type {
  CreatePlanData,
  CreatePlanDayData,
  MonthlyPlan,
  MonthlyPlanWithCounts,
  PlanDay,
  PlanDayVideoItem,
  PlanDayWithVideos,
  PlanDetail,
  PlanEnrollmentInfo,
  StudentPlan,
  UpdatePlanData,
  UpdatePlanDayData,
} from "@/types/plan";
import type { Video } from "@/types/library";
import { getDb, mutate, nowIso } from "@/lib/db/store";
import { ApiError, buildPagination, paginate } from "@/lib/middleware/errors";
import type { CreatePlanInput, CreatePlanDayInput } from "@/lib/validation/plan";

function ownedPlan(planId: string, teacherId: string): MonthlyPlan {
  const plan = getDb().monthly_plans.find((item) => item.id === planId);
  if (!plan) throw ApiError.notFound("Plano não encontrado");
  if (plan.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");
  return plan;
}

function planDays(planId: string): PlanDay[] {
  return getDb()
    .plan_days.filter((item) => item.monthly_plan_id === planId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

function videosForPlanDay(planDayId: string): PlanDayVideoItem[] {
  const db = getDb();
  return db.plan_day_videos
    .filter((item) => item.plan_day_id === planDayId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => db.videos.find((video) => video.id === item.video_id))
    .filter((video): video is Video => Boolean(video))
    .map((video) => {
      const association = db.plan_day_videos.find(
        (item) => item.plan_day_id === planDayId && item.video_id === video.id,
      );
      return {
        ...video,
        association_id: association?.id ?? "",
        sort_order: association?.sort_order ?? 0,
      };
    });
}

function planEnrollments(planId: string): PlanEnrollmentInfo[] {
  const db = getDb();
  return db.plan_enrollments
    .filter((item) => item.monthly_plan_id === planId)
    .map((item) => {
      const enrollment = db.enrollments.find((record) => record.id === item.enrollment_id);
      return {
        ...item,
        student_name: enrollment?.student_name ?? "Aluno",
        student_email: enrollment?.student_email ?? "",
        status: enrollment?.status ?? "archived",
      };
    });
}

export function toPlanWithCounts(plan: MonthlyPlan): MonthlyPlanWithCounts {
  return {
    ...plan,
    plan_day_count: getDb().plan_days.filter((day) => day.monthly_plan_id === plan.id).length,
    enrolled_count: getDb().plan_enrollments.filter((item) => item.monthly_plan_id === plan.id).length,
  };
}

/* -------------------------------------------------------------------------- */
/* Planos                                                                      */
/* -------------------------------------------------------------------------- */

export function getPlans(
  teacherId: string,
  options: {
    search?: string;
    status?: string[];
    from_date?: string;
    to_date?: string;
    page?: number;
    pageSize?: number;
  } = {},
): { plans: MonthlyPlanWithCounts[]; pagination: ReturnType<typeof buildPagination> } {
  const db = getDb();
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  const statuses =
    options.status && options.status.length > 0
      ? options.status
      : ["draft", "published"];

  let plans = db.monthly_plans.filter((item) => item.teacher_id === teacherId);
  if (!statuses.includes("archived")) {
    plans = plans.filter((item) => item.status !== "archived");
  }
  plans = plans.filter((item) => statuses.includes(item.status));

  const search = (options.search ?? "").trim().toLowerCase();
  if (search) plans = plans.filter((item) => item.title.toLowerCase().includes(search));

  if (options.from_date && options.to_date) {
    plans = plans.filter(
      (item) =>
        (item.period_start >= options.from_date! && item.period_start <= options.to_date!) ||
        (item.period_end >= options.from_date! && item.period_end <= options.to_date!),
    );
  } else if (options.from_date) {
    plans = plans.filter((item) => item.period_start >= options.from_date!);
  } else if (options.to_date) {
    plans = plans.filter((item) => item.period_end <= options.to_date!);
  }

  const withCounts = plans
    .sort((a, b) => b.period_start.localeCompare(a.period_start))
    .map(toPlanWithCounts);

  return {
    plans: paginate(withCounts, page, pageSize),
    pagination: buildPagination(withCounts.length, page, pageSize),
  };
}

export function createPlan(teacherId: string, data: CreatePlanInput): MonthlyPlanWithCounts {
  const timestamp = nowIso();
  const plan: MonthlyPlan = {
    id: randomUUID(),
    teacher_id: teacherId,
    title: data.title,
    description: data.description ?? null,
    objective: data.objective ?? null,
    period_start: data.period_start,
    period_end: data.period_end,
    status: "draft",
    published_at: null,
    archived_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  mutate((db) => {
    db.monthly_plans.push(plan);
  });
  return toPlanWithCounts(plan);
}

export function getPlanDetail(planId: string, teacherId: string): PlanDetail {
  const plan = ownedPlan(planId, teacherId);
  const days: PlanDayWithVideos[] = planDays(planId).map((day) => {
    const videos = videosForPlanDay(day.id);
    return { ...day, videos, video_count: videos.length };
  });

  return {
    ...toPlanWithCounts(plan),
    days,
    enrollments: planEnrollments(planId),
  };
}

export function updatePlan(
  planId: string,
  teacherId: string,
  data: UpdatePlanData,
): MonthlyPlanWithCounts {
  ownedPlan(planId, teacherId);
  return mutate((db) => {
    const plan = db.monthly_plans.find((item) => item.id === planId);
    if (!plan) throw ApiError.notFound("Plano não encontrado");
    if (data.title !== undefined) plan.title = data.title;
    if (data.description !== undefined) plan.description = data.description;
    if (data.objective !== undefined) plan.objective = data.objective;
    if (data.period_start !== undefined) plan.period_start = data.period_start;
    if (data.period_end !== undefined) plan.period_end = data.period_end;
    if (plan.period_end < plan.period_start) {
      throw ApiError.validation("A data final deve ser igual ou posterior à inicial");
    }
    plan.updated_at = nowIso();
    return toPlanWithCounts(plan);
  });
}

/** Publica somente planos em rascunho. Não concede acesso automaticamente. */
export function publishPlan(planId: string, teacherId: string): MonthlyPlanWithCounts {
  const plan = ownedPlan(planId, teacherId);
  if (plan.status === "published") throw ApiError.conflict("Este plano já está publicado");
  if (plan.status === "archived") throw ApiError.conflict("Planos arquivados não podem ser publicados");

  return mutate((db) => {
    const record = db.monthly_plans.find((item) => item.id === planId);
    if (!record) throw ApiError.notFound("Plano não encontrado");
    record.status = "published";
    record.published_at = nowIso();
    record.updated_at = nowIso();
    return toPlanWithCounts(record);
  });
}

/** Despublica mantendo published_at para auditoria (Requisito 16). */
export function unpublishPlan(planId: string, teacherId: string): MonthlyPlanWithCounts {
  const plan = ownedPlan(planId, teacherId);
  if (plan.status !== "published") throw ApiError.conflict("Somente planos publicados podem ser despublicados");

  return mutate((db) => {
    const record = db.monthly_plans.find((item) => item.id === planId);
    if (!record) throw ApiError.notFound("Plano não encontrado");
    record.status = "draft";
    record.updated_at = nowIso();
    return toPlanWithCounts(record);
  });
}

export function archivePlan(planId: string, teacherId: string): MonthlyPlanWithCounts {
  const plan = ownedPlan(planId, teacherId);
  if (plan.status === "archived") throw ApiError.conflict("Este plano já está arquivado");

  return mutate((db) => {
    const record = db.monthly_plans.find((item) => item.id === planId);
    if (!record) throw ApiError.notFound("Plano não encontrado");
    record.status = "archived";
    record.archived_at = record.archived_at ?? nowIso();
    record.updated_at = nowIso();
    return toPlanWithCounts(record);
  });
}

export function unarchivePlan(planId: string, teacherId: string): MonthlyPlanWithCounts {
  const plan = ownedPlan(planId, teacherId);
  if (plan.status !== "archived") throw ApiError.conflict("Somente planos arquivados podem ser reativados");

  return mutate((db) => {
    const record = db.monthly_plans.find((item) => item.id === planId);
    if (!record) throw ApiError.notFound("Plano não encontrado");
    record.status = "draft";
    record.updated_at = nowIso();
    return toPlanWithCounts(record);
  });
}

/** Duplica plano, dias e vídeos, sem copiar acessos (Requisito 21). */
export function duplicatePlan(planId: string, teacherId: string): PlanDetail {
  const source = ownedPlan(planId, teacherId);
  const timestamp = nowIso();
  const newPlan: MonthlyPlan = {
    ...source,
    id: randomUUID(),
    title: `${source.title} (Copy)`,
    status: "draft",
    published_at: null,
    archived_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  mutate((db) => {
    db.monthly_plans.push(newPlan);
    const days = db.plan_days.filter((item) => item.monthly_plan_id === planId);
    for (const day of days) {
      const newDayId = randomUUID();
      db.plan_days.push({
        ...day,
        id: newDayId,
        monthly_plan_id: newPlan.id,
        created_at: timestamp,
        updated_at: timestamp,
      });
      const associations = db.plan_day_videos.filter((item) => item.plan_day_id === day.id);
      for (const association of associations) {
        db.plan_day_videos.push({
          ...association,
          id: randomUUID(),
          plan_day_id: newDayId,
          created_at: timestamp,
        });
      }
    }
  });

  return getPlanDetail(newPlan.id, teacherId);
}

/** Exclui apenas quando não há aulas referenciando os dias do plano. */
export function deletePlan(planId: string, teacherId: string): void {
  ownedPlan(planId, teacherId);
  const db = getDb();
  const dayIds = db.plan_days
    .filter((item) => item.monthly_plan_id === planId)
    .map((item) => item.id);
  const hasLessonReferences = db.lessons.some(
    (lesson) => lesson.plan_day_id !== null && dayIds.includes(lesson.plan_day_id),
  );
  if (hasLessonReferences) {
    throw ApiError.conflict(
      "Este plano possui aulas vinculadas e não pode ser excluído. Arquive o plano para preservar o histórico.",
    );
  }

  mutate((database) => {
    database.monthly_plans = database.monthly_plans.filter((item) => item.id !== planId);
    database.plan_days = database.plan_days.filter((item) => item.monthly_plan_id !== planId);
    database.plan_day_videos = database.plan_day_videos.filter(
      (item) => !dayIds.includes(item.plan_day_id),
    );
    database.plan_enrollments = database.plan_enrollments.filter(
      (item) => item.monthly_plan_id !== planId,
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Dias do plano                                                               */
/* -------------------------------------------------------------------------- */

export function getPlanDays(planId: string, teacherId: string): PlanDayWithVideos[] {
  ownedPlan(planId, teacherId);
  return planDays(planId).map((day) => {
    const videos = videosForPlanDay(day.id);
    return { ...day, videos, video_count: videos.length };
  });
}

/** Vídeos de um dia específico, com verificação de propriedade do plano. */
export function getPlanDayVideos(dayId: string, teacherId: string): PlanDayVideoItem[] {
  const day = getDb().plan_days.find((item) => item.id === dayId);
  if (!day) throw ApiError.notFound("Dia do plano não encontrado");
  ownedPlan(day.monthly_plan_id, teacherId);
  return videosForPlanDay(dayId);
}

export function createPlanDay(
  planId: string,
  teacherId: string,
  data: CreatePlanDayInput,
): PlanDayWithVideos {
  const plan = ownedPlan(planId, teacherId);
  if (plan.status === "archived") throw ApiError.conflict("Planos arquivados não podem ser editados");

  if (data.planned_date && (data.planned_date < plan.period_start || data.planned_date > plan.period_end)) {
    throw ApiError.validation("A data planejada deve estar dentro do período do plano", {
      fields: { planned_date: "Fora do período do plano" },
    });
  }

  const db = getDb();
  const timestamp = nowIso();
  const day: PlanDay = {
    id: randomUUID(),
    monthly_plan_id: planId,
    teacher_id: teacherId,
    weekday: data.weekday ?? null,
    planned_date: data.planned_date ?? null,
    title: data.title,
    objective: data.objective ?? null,
    notes: data.notes ?? null,
    sort_order:
      data.sort_order ??
      db.plan_days
        .filter((item) => item.monthly_plan_id === planId)
        .reduce((max, item) => Math.max(max, item.sort_order), 0) + 1,
    created_at: timestamp,
    updated_at: timestamp,
  };

  mutate((database) => {
    database.plan_days.push(day);
  });
  return { ...day, videos: [], video_count: 0 };
}

export function updatePlanDay(
  dayId: string,
  teacherId: string,
  data: UpdatePlanDayData,
): PlanDayWithVideos {
  const db = getDb();
  const existing = db.plan_days.find((item) => item.id === dayId);
  if (!existing) throw ApiError.notFound("Dia do plano não encontrado");
  ownedPlan(existing.monthly_plan_id, teacherId);
  const plan = ownedPlan(existing.monthly_plan_id, teacherId);

  const nextDate = data.planned_date !== undefined ? data.planned_date : existing.planned_date;
  if (nextDate && (nextDate < plan.period_start || nextDate > plan.period_end)) {
    throw ApiError.validation("A data planejada deve estar dentro do período do plano", {
      fields: { planned_date: "Fora do período do plano" },
    });
  }

  return mutate((database) => {
    const day = database.plan_days.find((item) => item.id === dayId);
    if (!day) throw ApiError.notFound("Dia do plano não encontrado");
    if (data.weekday !== undefined) day.weekday = data.weekday;
    if (data.planned_date !== undefined) day.planned_date = data.planned_date;
    if (data.title !== undefined) day.title = data.title;
    if (data.objective !== undefined) day.objective = data.objective;
    if (data.notes !== undefined) day.notes = data.notes;
    if (data.sort_order !== undefined) day.sort_order = data.sort_order;
    day.updated_at = nowIso();
    const videos = videosForPlanDay(day.id);
    return { ...day, videos, video_count: videos.length };
  });
}

export function reorderPlanDays(
  teacherId: string,
  items: Array<{ id: string; sort_order: number }>,
): void {
  const db = getDb();
  for (const item of items) {
    const day = db.plan_days.find((record) => record.id === item.id);
    if (!day) throw ApiError.notFound("Dia do plano não encontrado");
    ownedPlan(day.monthly_plan_id, teacherId);
  }
  mutate((database) => {
    for (const item of items) {
      const day = database.plan_days.find((record) => record.id === item.id);
      if (day) {
        day.sort_order = item.sort_order;
        day.updated_at = nowIso();
      }
    }
  });
}

/** Remove o dia, associações de vídeo, preservando referências em aulas. */
export function deletePlanDay(dayId: string, teacherId: string): void {
  const db = getDb();
  const day = db.plan_days.find((item) => item.id === dayId);
  if (!day) throw ApiError.notFound("Dia do plano não encontrado");
  ownedPlan(day.monthly_plan_id, teacherId);

  mutate((database) => {
    database.plan_days = database.plan_days.filter((item) => item.id !== dayId);
    database.plan_day_videos = database.plan_day_videos.filter((item) => item.plan_day_id !== dayId);
  });
}

/* -------------------------------------------------------------------------- */
/* Vídeos dos dias                                                             */
/* -------------------------------------------------------------------------- */

export function addVideoToPlanDay(
  dayId: string,
  teacherId: string,
  videoId: string,
  sortOrder?: number,
): PlanDayWithVideos {
  const db = getDb();
  const day = db.plan_days.find((item) => item.id === dayId);
  if (!day) throw ApiError.notFound("Dia do plano não encontrado");
  ownedPlan(day.monthly_plan_id, teacherId);

  const video = db.videos.find((item) => item.id === videoId);
  if (!video) throw ApiError.notFound("Vídeo não encontrado");
  if (video.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");
  if (video.status === "archived") throw ApiError.conflict("Vídeos arquivados não podem ser associados");

  if (db.plan_day_videos.some((item) => item.plan_day_id === dayId && item.video_id === videoId)) {
    throw ApiError.conflict("Este vídeo já está associado ao dia do plano");
  }

  mutate((database) => {
    database.plan_day_videos.push({
      id: randomUUID(),
      plan_day_id: dayId,
      video_id: videoId,
      sort_order:
        sortOrder ??
        database.plan_day_videos
          .filter((item) => item.plan_day_id === dayId)
          .reduce((max, item) => Math.max(max, item.sort_order), 0) + 1,
      created_at: nowIso(),
    });
  });

  const videos = videosForPlanDay(dayId);
  return { ...day, videos, video_count: videos.length };
}

export function removeVideoFromPlanDay(
  associationId: string,
  teacherId: string,
): void {
  const db = getDb();
  const association = db.plan_day_videos.find((item) => item.id === associationId);
  if (!association) throw ApiError.notFound("Associação não encontrada");
  const day = db.plan_days.find((item) => item.id === association.plan_day_id);
  if (!day) throw ApiError.notFound("Dia do plano não encontrado");
  ownedPlan(day.monthly_plan_id, teacherId);

  mutate((database) => {
    database.plan_day_videos = database.plan_day_videos.filter((item) => item.id !== associationId);
    database.plan_day_videos
      .filter((item) => item.plan_day_id === association.plan_day_id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .forEach((item, index) => {
        item.sort_order = index + 1;
      });
  });
}

export function reorderPlanDayVideos(
  teacherId: string,
  items: Array<{ id: string; sort_order: number }>,
): void {
  const db = getDb();
  const planDayIds = new Set<string>();
  for (const item of items) {
    const association = db.plan_day_videos.find((record) => record.id === item.id);
    if (!association) throw ApiError.notFound("Associação não encontrada");
    const day = db.plan_days.find((record) => record.id === association.plan_day_id);
    if (!day) throw ApiError.notFound("Dia do plano não encontrado");
    ownedPlan(day.monthly_plan_id, teacherId);
    planDayIds.add(association.plan_day_id);
  }
  if (planDayIds.size > 1) {
    throw ApiError.validation("Todos os vídeos devem pertencer ao mesmo dia do plano");
  }

  mutate((database) => {
    for (const item of items) {
      const association = database.plan_day_videos.find((record) => record.id === item.id);
      if (association) association.sort_order = item.sort_order;
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Publicação para alunos                                                      */
/* -------------------------------------------------------------------------- */

export function grantPlanAccess(
  planId: string,
  teacherId: string,
  enrollmentId: string,
): PlanEnrollmentInfo {
  const plan = ownedPlan(planId, teacherId);
  if (plan.status !== "published") {
    throw ApiError.validation("Publique o plano antes de liberá-lo para alunos");
  }
  const db = getDb();
  const enrollment = db.enrollments.find((item) => item.id === enrollmentId);
  if (!enrollment) throw ApiError.notFound("Aluno não encontrado");
  if (enrollment.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");

  if (db.plan_enrollments.some((item) => item.monthly_plan_id === planId && item.enrollment_id === enrollmentId)) {
    throw ApiError.conflict("Este aluno já tem acesso ao plano");
  }

  const association = {
    id: randomUUID(),
    monthly_plan_id: planId,
    enrollment_id: enrollmentId,
    published_at: nowIso(),
  };
  mutate((database) => {
    database.plan_enrollments.push(association);
  });

  return {
    ...association,
    student_name: enrollment.student_name,
    student_email: enrollment.student_email,
    status: enrollment.status,
  };
}

export function getPlanEnrollments(planId: string, teacherId: string): PlanEnrollmentInfo[] {
  ownedPlan(planId, teacherId);
  return planEnrollments(planId);
}

export function revokePlanAccess(associationId: string, teacherId: string): void {
  const db = getDb();
  const association = db.plan_enrollments.find((item) => item.id === associationId);
  if (!association) throw ApiError.notFound("Associação não encontrada");
  ownedPlan(association.monthly_plan_id, teacherId);
  mutate((database) => {
    database.plan_enrollments = database.plan_enrollments.filter((item) => item.id !== associationId);
  });
}

/* -------------------------------------------------------------------------- */
/* Visão do aluno                                                              */
/* -------------------------------------------------------------------------- */

export function getStudentPlans(studentId: string, enrollmentId?: string): StudentPlan[] {
  const db = getDb();
  const enrollments = db.enrollments.filter(
    (item) =>
      item.student_profile_id === studentId &&
      item.status === "active" &&
      (!enrollmentId || item.id === enrollmentId),
  );
  const enrollmentIds = new Set(enrollments.map((item) => item.id));

  return db.monthly_plans
    .filter((plan) => plan.status === "published")
    .filter((plan) =>
      db.plan_enrollments.some(
        (association) =>
          association.monthly_plan_id === plan.id &&
          enrollmentIds.has(association.enrollment_id),
      ),
    )
    .sort((a, b) => b.period_start.localeCompare(a.period_start))
    .map((plan) => {
      const association = db.plan_enrollments.find(
        (item) =>
          item.monthly_plan_id === plan.id && enrollmentIds.has(item.enrollment_id),
      );
      const teacherProfile = db.profiles.find((item) => item.id === plan.teacher_id);
      const teacher = db.teachers.find((item) => item.id === plan.teacher_id);
      const days = planDays(plan.id).map((day) => {
        const videos = videosForPlanDay(day.id);
        return { ...day, videos, video_count: videos.length };
      });

      return {
        ...plan,
        teacher_name: teacher?.display_name ?? teacherProfile?.full_name ?? "Professor",
        enrollment_id: association?.enrollment_id ?? "",
        days,
      };
    });
}

export function getStudentPlanDays(studentId: string, planId: string): PlanDayWithVideos[] {
  const plans = getStudentPlans(studentId);
  const plan = plans.find((item) => item.id === planId);
  if (!plan) throw ApiError.forbidden("Acesso negado");
  return plan.days;
}

export type { CreatePlanData, CreatePlanDayData };
