import { randomUUID } from "node:crypto";
import type {
  CreateLessonData,
  CreateWeeklySlotData,
  DashboardData,
  GeneratedLessonSuggestion,
  Lesson,
  LessonDetail,
  LessonListItem,
  LessonStats,
  LessonStatus,
  LessonVideoWithVideo,
  UpdateLessonData,
  UpdateWeeklySlotData,
  WeeklySlot,
  WeeklySlotWithStudent,
} from "@/types/lesson";
import type { PlanDay } from "@/types/plan";
import { getDb, mutate, nowIso } from "@/lib/db/store";
import { ApiError, buildPagination, paginate } from "@/lib/middleware/errors";
import {
  addDays,
  dateKey,
  endOfDayIso,
  startOfDayIso,
  startOfWeek,
} from "@/lib/utils/date";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function ownedLesson(lessonId: string, teacherId: string): Lesson {
  const lesson = getDb().lessons.find((item) => item.id === lessonId);
  if (!lesson) throw ApiError.notFound("Aula não encontrada");
  if (lesson.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");
  return lesson;
}

function enrollmentForTeacher(enrollmentId: string, teacherId: string) {
  const enrollment = getDb().enrollments.find((item) => item.id === enrollmentId);
  if (!enrollment) throw ApiError.notFound("Aluno não encontrado");
  if (enrollment.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");
  return enrollment;
}

function planDayForTeacher(planDayId: string, teacherId: string): { day: PlanDay; planStatus: string } {
  const db = getDb();
  const day = db.plan_days.find((item) => item.id === planDayId);
  if (!day) throw ApiError.notFound("Dia do plano não encontrado");
  const plan = db.monthly_plans.find((item) => item.id === day.monthly_plan_id);
  if (!plan) throw ApiError.notFound("Plano não encontrado");
  if (plan.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");
  if (plan.status === "archived") throw ApiError.conflict("Não é possível usar um dia de plano arquivado");
  return { day, planStatus: plan.status };
}

/** Detecta sobreposição com outras aulas agendadas do mesmo professor. */
export function detectConflicts(
  teacherId: string,
  startsAt: string,
  endsAt: string,
  excludeLessonId?: string,
): LessonListItem[] {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  return getDb()
    .lessons.filter(
      (lesson) =>
        lesson.teacher_id === teacherId &&
        lesson.status === "scheduled" &&
        lesson.id !== excludeLessonId &&
        new Date(lesson.starts_at).getTime() < end &&
        new Date(lesson.ends_at).getTime() > start,
    )
    .map(toLessonListItem);
}

export function toLessonListItem(lesson: Lesson): LessonListItem {
  const db = getDb();
  const enrollment = db.enrollments.find((item) => item.id === lesson.enrollment_id);
  const planDay = lesson.plan_day_id
    ? db.plan_days.find((item) => item.id === lesson.plan_day_id)
    : undefined;

  return {
    ...lesson,
    student_name: enrollment?.student_name ?? "Aluno",
    student_email: enrollment?.student_email ?? "",
    enrollment_status: enrollment?.status ?? "archived",
    plan_day_title: planDay?.title ?? lesson.title_snapshot,
    video_count: db.lesson_videos.filter((item) => item.lesson_id === lesson.id).length,
  };
}

function lessonVideos(lessonId: string): LessonVideoWithVideo[] {
  const db = getDb();
  return db.lesson_videos
    .filter((item) => item.lesson_id === lessonId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((association) => {
      const video = db.videos.find((item) => item.id === association.video_id);
      if (!video) return null;
      return { ...association, video };
    })
    .filter((item): item is LessonVideoWithVideo => Boolean(item));
}

export function getLessonDetail(lessonId: string, teacherId: string): LessonDetail {
  const lesson = ownedLesson(lessonId, teacherId);
  const db = getDb();
  const planDay = lesson.plan_day_id
    ? db.plan_days.find((item) => item.id === lesson.plan_day_id) ?? null
    : null;
  const teacher = db.teachers.find((item) => item.id === teacherId);

  return {
    ...toLessonListItem(lesson),
    plan_day: planDay,
    videos: lessonVideos(lessonId),
    teacher_name: teacher?.display_name ?? "Professor",
  };
}

/* -------------------------------------------------------------------------- */
/* Aulas                                                                       */
/* -------------------------------------------------------------------------- */

export function getLessons(
  teacherId: string,
  options: {
    enrollment_id?: string;
    status?: string[];
    from_date?: string;
    to_date?: string;
    page?: number;
    pageSize?: number;
  } = {},
): { lessons: LessonListItem[]; pagination: ReturnType<typeof buildPagination> } {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  let lessons = getDb().lessons.filter((item) => item.teacher_id === teacherId);

  if (options.enrollment_id) lessons = lessons.filter((item) => item.enrollment_id === options.enrollment_id);
  if (options.status && options.status.length > 0) {
    lessons = lessons.filter((item) => options.status!.includes(item.status));
  }
  if (options.from_date) lessons = lessons.filter((item) => item.starts_at >= `${options.from_date}T00:00:00`);
  if (options.to_date) lessons = lessons.filter((item) => item.starts_at <= `${options.to_date}T23:59:59.999`);

  const sorted = lessons
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    .map(toLessonListItem);

  return {
    lessons: paginate(sorted, page, pageSize),
    pagination: buildPagination(sorted.length, page, pageSize),
  };
}

export function createLesson(teacherId: string, data: CreateLessonData): LessonDetail {
  const enrollment = enrollmentForTeacher(data.enrollment_id, teacherId);
  if (enrollment.status === "archived") throw ApiError.conflict("Alunos arquivados não podem ter novas aulas");
  if (enrollment.status === "pending") throw ApiError.conflict("O aluno ainda não aceitou o convite");
  if (enrollment.status === "paused") throw ApiError.conflict("Reative o vínculo antes de agendar novas aulas");

  let planDay: PlanDay | null = null;
  if (data.plan_day_id) {
    planDay = planDayForTeacher(data.plan_day_id, teacherId).day;
  }

  if (!data.override_conflict) {
    const conflicts = detectConflicts(teacherId, data.starts_at, data.ends_at);
    if (conflicts.length > 0) {
      throw new ApiError(409, "CONFLICT", "Já existe uma aula agendada neste horário", {
        conflicts,
      });
    }
  }

  const timestamp = nowIso();
  const lesson: Lesson = {
    id: randomUUID(),
    teacher_id: teacherId,
    enrollment_id: data.enrollment_id,
    plan_day_id: data.plan_day_id ?? null,
    starts_at: data.starts_at,
    ends_at: data.ends_at,
    status: "scheduled",
    completed_at: null,
    shared_notes: data.shared_notes ?? null,
    private_notes: data.private_notes ?? null,
    title_snapshot: planDay?.title ?? null,
    objective_snapshot: planDay?.objective ?? null,
    rescheduled_from_id: null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  mutate((db) => {
    db.lessons.push(lesson);
  });
  return getLessonDetail(lesson.id, teacherId);
}

export function updateLesson(
  lessonId: string,
  teacherId: string,
  data: UpdateLessonData,
): LessonDetail {
  const current = ownedLesson(lessonId, teacherId);
  const changesTime =
    data.starts_at !== undefined || data.ends_at !== undefined || data.plan_day_id !== undefined;

  if (changesTime && current.status !== "scheduled") {
    throw ApiError.conflict("Aulas concluídas, canceladas ou com falta não podem ter data/horário alterados");
  }

  let planDay: PlanDay | null = null;
  if (data.plan_day_id) {
    planDay = planDayForTeacher(data.plan_day_id, teacherId).day;
  }

  const startsAt = data.starts_at ?? current.starts_at;
  const endsAt = data.ends_at ?? current.ends_at;
  if (new Date(endsAt) <= new Date(startsAt)) {
    throw ApiError.validation("O horário final deve ser posterior ao inicial", {
      fields: { ends_at: "Horário inválido" },
    });
  }

  if (changesTime && !data.override_conflict) {
    const conflicts = detectConflicts(teacherId, startsAt, endsAt, lessonId);
    if (conflicts.length > 0) {
      throw new ApiError(409, "CONFLICT", "Já existe uma aula agendada neste horário", {
        conflicts,
      });
    }
  }

  return mutate((db) => {
    const lesson = db.lessons.find((item) => item.id === lessonId);
    if (!lesson) throw ApiError.notFound("Aula não encontrada");
    if (data.starts_at !== undefined) lesson.starts_at = data.starts_at;
    if (data.ends_at !== undefined) lesson.ends_at = data.ends_at;
    if (data.shared_notes !== undefined) lesson.shared_notes = data.shared_notes;
    if (data.private_notes !== undefined) lesson.private_notes = data.private_notes;
    if (data.plan_day_id !== undefined) {
      lesson.plan_day_id = data.plan_day_id;
      lesson.title_snapshot = planDay?.title ?? null;
      lesson.objective_snapshot = planDay?.objective ?? null;
    }
    lesson.updated_at = nowIso();
    return getLessonDetail(lessonId, teacherId);
  });
}

const FINAL_STATUSES: LessonStatus[] = ["completed", "cancelled", "no_show"];

export function changeLessonStatus(
  lessonId: string,
  teacherId: string,
  input: {
    status: LessonStatus;
    shared_notes?: string | null;
    private_notes?: string | null;
    override_window?: boolean;
  },
): LessonDetail {
  const lesson = ownedLesson(lessonId, teacherId);
  if (!FINAL_STATUSES.includes(input.status)) {
    throw ApiError.validation("Status inválido para conclusão");
  }
  if (lesson.status !== "scheduled") {
    throw ApiError.conflict(
      `Não é possível alterar o status de "${lesson.status}" para "${input.status}"`,
    );
  }

  if (input.status === "completed") {
    const enrollment = getDb().enrollments.find((item) => item.id === lesson.enrollment_id);
    if (enrollment?.status === "archived") {
      throw ApiError.conflict("Não é possível concluir aulas de um vínculo arquivado");
    }
    const startsAt = new Date(lesson.starts_at).getTime();
    const now = Date.now();
    if (startsAt > now + 7 * 24 * 60 * 60 * 1000) {
      throw ApiError.validation("Não é possível concluir uma aula agendada para mais de 7 dias no futuro");
    }
    if (startsAt < now - 30 * 24 * 60 * 60 * 1000 && !input.override_window) {
      throw new ApiError(
        409,
        "CONFLICT",
        "A aula ocorreu há mais de 30 dias. Confirme para registrar a conclusão mesmo assim.",
        { requires_confirmation: true },
      );
    }
  }

  return mutate((db) => {
    const record = db.lessons.find((item) => item.id === lessonId);
    if (!record) throw ApiError.notFound("Aula não encontrada");
    record.status = input.status;
    if (input.status === "completed") record.completed_at = nowIso();
    if (input.shared_notes !== undefined) record.shared_notes = input.shared_notes;
    if (input.private_notes !== undefined) record.private_notes = input.private_notes;
    record.updated_at = nowIso();
    return getLessonDetail(lessonId, teacherId);
  });
}

/* -------------------------------------------------------------------------- */
/* Vídeos da aula                                                              */
/* -------------------------------------------------------------------------- */

export function addLessonVideo(
  lessonId: string,
  teacherId: string,
  videoId: string,
  sortOrder?: number,
): LessonDetail {
  const lesson = ownedLesson(lessonId, teacherId);
  if (lesson.status !== "scheduled") {
    throw ApiError.conflict("Aulas finalizadas não podem receber novos vídeos");
  }
  const db = getDb();
  const video = db.videos.find((item) => item.id === videoId);
  if (!video) throw ApiError.notFound("Vídeo não encontrado");
  if (video.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");
  if (video.status !== "ready") throw ApiError.conflict("Somente vídeos prontos podem ser associados");

  if (db.lesson_videos.some((item) => item.lesson_id === lessonId && item.video_id === videoId)) {
    throw ApiError.conflict("Este vídeo já está associado à aula");
  }

  mutate((database) => {
    database.lesson_videos.push({
      id: randomUUID(),
      lesson_id: lessonId,
      video_id: videoId,
      source: "manual",
      sort_order:
        sortOrder ??
        database.lesson_videos
          .filter((item) => item.lesson_id === lessonId)
          .reduce((max, item) => Math.max(max, item.sort_order), 0) + 1,
      created_at: nowIso(),
    });
  });
  return getLessonDetail(lessonId, teacherId);
}

/** Copia os vídeos sugeridos pelo dia do plano (Requisito 9). */
export function copyPlanVideosToLesson(lessonId: string, teacherId: string): LessonDetail {
  const lesson = ownedLesson(lessonId, teacherId);
  if (lesson.status !== "scheduled") throw ApiError.conflict("Aulas finalizadas não podem ser alteradas");
  if (!lesson.plan_day_id) throw ApiError.validation("A aula não possui um dia do plano vinculado");

  const db = getDb();
  const associations = db.plan_day_videos.filter((item) => item.plan_day_id === lesson.plan_day_id);
  mutate((database) => {
    for (const association of associations) {
      const duplicate = database.lesson_videos.some(
        (item) => item.lesson_id === lessonId && item.video_id === association.video_id,
      );
      if (!duplicate) {
        database.lesson_videos.push({
          id: randomUUID(),
          lesson_id: lessonId,
          video_id: association.video_id,
          source: "plan",
          sort_order: association.sort_order,
          created_at: nowIso(),
        });
      }
    }
  });
  return getLessonDetail(lessonId, teacherId);
}

export function removeLessonVideo(
  lessonId: string,
  teacherId: string,
  associationId: string,
): LessonDetail {
  const lesson = ownedLesson(lessonId, teacherId);
  if (lesson.status !== "scheduled") {
    throw ApiError.conflict("Aulas finalizadas não podem ter vídeos removidos");
  }
  const db = getDb();
  const association = db.lesson_videos.find(
    (item) => item.id === associationId && item.lesson_id === lessonId,
  );
  if (!association) throw ApiError.notFound("Associação não encontrada");

  mutate((database) => {
    database.lesson_videos = database.lesson_videos.filter((item) => item.id !== associationId);
    database.lesson_videos
      .filter((item) => item.lesson_id === lessonId)
      .sort((a, b) => a.sort_order - b.sort_order)
      .forEach((item, index) => {
        item.sort_order = index + 1;
      });
  });
  return getLessonDetail(lessonId, teacherId);
}

export function reorderLessonVideos(
  lessonId: string,
  teacherId: string,
  items: Array<{ id: string; sort_order: number }>,
): LessonDetail {
  const lesson = ownedLesson(lessonId, teacherId);
  if (lesson.status !== "scheduled") {
    throw ApiError.conflict("Aulas finalizadas não podem ser reordenadas");
  }
  for (const item of items) {
    const association = getDb().lesson_videos.find((record) => record.id === item.id);
    if (!association || association.lesson_id !== lessonId) {
      throw ApiError.validation("Todos os vídeos devem pertencer à mesma aula");
    }
  }
  mutate((db) => {
    for (const item of items) {
      const association = db.lesson_videos.find((record) => record.id === item.id);
      if (association) association.sort_order = item.sort_order;
    }
  });
  return getLessonDetail(lessonId, teacherId);
}

/* -------------------------------------------------------------------------- */
/* Horários recorrentes                                                        */
/* -------------------------------------------------------------------------- */

export function getWeeklySlots(
  teacherId: string,
  enrollmentId?: string,
): WeeklySlotWithStudent[] {
  const db = getDb();
  const today = dateKey(new Date());
  return db.weekly_slots
    .filter((item) => item.teacher_id === teacherId)
    .filter((item) => !enrollmentId || item.enrollment_id === enrollmentId)
    .filter((item) => !item.valid_until || item.valid_until >= today)
    .sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time))
    .map((slot) => ({
      ...slot,
      student_name:
        db.enrollments.find((item) => item.id === slot.enrollment_id)?.student_name ?? "Aluno",
    }));
}

export function createWeeklySlot(
  teacherId: string,
  data: CreateWeeklySlotData,
): WeeklySlot {
  const enrollment = enrollmentForTeacher(data.enrollment_id, teacherId);
  if (enrollment.status === "archived" || enrollment.status === "pending") {
    throw ApiError.conflict("O aluno precisa ter um vínculo ativo ou pausado para receber horários");
  }

  const slot: WeeklySlot = {
    id: randomUUID(),
    teacher_id: teacherId,
    enrollment_id: data.enrollment_id,
    weekday: data.weekday,
    start_time: data.start_time,
    end_time: data.end_time,
    valid_from: data.valid_from ?? dateKey(new Date()),
    valid_until: data.valid_until ?? null,
    status: "active",
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  mutate((db) => {
    db.weekly_slots.push(slot);
  });
  return slot;
}

export function updateWeeklySlot(
  slotId: string,
  teacherId: string,
  data: UpdateWeeklySlotData,
): WeeklySlot {
  const slot = getDb().weekly_slots.find((item) => item.id === slotId);
  if (!slot) throw ApiError.notFound("Horário não encontrado");
  if (slot.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");

  const start = data.start_time ?? slot.start_time;
  const end = data.end_time ?? slot.end_time;
  if (end <= start) throw ApiError.validation("O horário final deve ser posterior ao inicial");

  return mutate((db) => {
    const record = db.weekly_slots.find((item) => item.id === slotId);
    if (!record) throw ApiError.notFound("Horário não encontrado");
    if (data.weekday !== undefined) record.weekday = data.weekday;
    if (data.start_time !== undefined) record.start_time = data.start_time;
    if (data.end_time !== undefined) record.end_time = data.end_time;
    if (data.valid_from !== undefined) record.valid_from = data.valid_from;
    if (data.valid_until !== undefined) record.valid_until = data.valid_until;
    record.updated_at = nowIso();
    return { ...record };
  });
}

export function setWeeklySlotStatus(
  slotId: string,
  teacherId: string,
  status: "active" | "paused",
): WeeklySlot {
  const slot = getDb().weekly_slots.find((item) => item.id === slotId);
  if (!slot) throw ApiError.notFound("Horário não encontrado");
  if (slot.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");
  if (slot.status === status) {
    throw ApiError.conflict(
      status === "active" ? "Este horário já está ativo" : "Este horário já está pausado",
    );
  }
  return mutate((db) => {
    const record = db.weekly_slots.find((item) => item.id === slotId);
    if (!record) throw ApiError.notFound("Horário não encontrado");
    record.status = status;
    record.updated_at = nowIso();
    return { ...record };
  });
}

export function deleteWeeklySlot(slotId: string, teacherId: string): void {
  const slot = getDb().weekly_slots.find((item) => item.id === slotId);
  if (!slot) throw ApiError.notFound("Horário não encontrado");
  if (slot.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");

  const hasGenerated = getDb().lessons.some((lesson) => {
    if (lesson.enrollment_id !== slot.enrollment_id) return false;
    const date = new Date(lesson.starts_at);
    const weekday = date.getDay();
    const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:00`;
    return weekday === slot.weekday && time === slot.start_time;
  });

  if (hasGenerated) {
    throw ApiError.conflict(
      "Existem aulas geradas a partir deste horário. Pause o horário em vez de excluí-lo.",
    );
  }
  mutate((db) => {
    db.weekly_slots = db.weekly_slots.filter((item) => item.id !== slotId);
  });
}

/* -------------------------------------------------------------------------- */
/* Geração de aulas                                                            */
/* -------------------------------------------------------------------------- */

function buildDateTime(date: string, time: string): Date {
  const [hours, minutes] = time.split(":");
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, Number(hours), Number(minutes ?? 0), 0, 0);
}

export function generateLessonsFromSlots(
  teacherId: string,
  input: {
    date_from: string;
    date_to: string;
    confirm?: boolean;
    enrollment_ids?: string[];
  },
): { suggestions: GeneratedLessonSuggestion[]; created: LessonListItem[] } {
  const db = getDb();
  const slots = getDb().weekly_slots.filter(
    (slot) =>
      slot.teacher_id === teacherId &&
      slot.status === "active" &&
      (!input.enrollment_ids || input.enrollment_ids.includes(slot.enrollment_id)),
  );

  const suggestions: GeneratedLessonSuggestion[] = [];
  const startDate = new Date(`${input.date_from}T00:00:00`);
  const endDate = new Date(`${input.date_to}T00:00:00`);

  for (let cursor = startDate; cursor <= endDate; cursor = addDays(cursor, 1)) {
    const date = dateKey(cursor);
    for (const slot of slots) {
      if (slot.weekday !== cursor.getDay()) continue;
      if (date < slot.valid_from) continue;
      if (slot.valid_until && date > slot.valid_until) continue;

      const start = buildDateTime(date, slot.start_time);
      const end = buildDateTime(date, slot.end_time);
      const startsAt = start.toISOString();
      const endsAt = end.toISOString();

      const duplicate = db.lessons.some(
        (lesson) => lesson.enrollment_id === slot.enrollment_id && lesson.starts_at === startsAt,
      );
      if (duplicate) continue;

      const enrollment = db.enrollments.find((item) => item.id === slot.enrollment_id);
      if (!enrollment || enrollment.status !== "active") continue;

      suggestions.push({
        enrollment_id: slot.enrollment_id,
        student_name: enrollment.student_name,
        starts_at: startsAt,
        ends_at: endsAt,
        weekly_slot_id: slot.id,
        conflicts: detectConflicts(teacherId, startsAt, endsAt),
      });
    }
  }

  suggestions.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  if (!input.confirm) return { suggestions, created: [] };

  const created = mutate((database) => {
    const output: LessonListItem[] = [];
    for (const suggestion of suggestions) {
      const timestamp = nowIso();
      const lesson: Lesson = {
        id: randomUUID(),
        teacher_id: teacherId,
        enrollment_id: suggestion.enrollment_id,
        plan_day_id: null,
        starts_at: suggestion.starts_at,
        ends_at: suggestion.ends_at,
        status: "scheduled",
        completed_at: null,
        shared_notes: null,
        private_notes: null,
        title_snapshot: null,
        objective_snapshot: null,
        rescheduled_from_id: null,
        created_at: timestamp,
        updated_at: timestamp,
      };
      database.lessons.push(lesson);
      output.push(toLessonListItem(lesson));
    }
    return output;
  });

  return { suggestions, created };
}

/* -------------------------------------------------------------------------- */
/* Agenda                                                                      */
/* -------------------------------------------------------------------------- */

export function getWeeklyAgenda(
  teacherId: string,
  weekStart?: string,
): { week_start: string; lessons: LessonListItem[] } {
  const base = weekStart ? new Date(`${weekStart}T00:00:00`) : new Date();
  const monday = startOfWeek(base);
  const from = startOfDayIso(monday);
  const to = endOfDayIso(addDays(monday, 6));
  const lessons = getDb()
    .lessons.filter(
      (item) =>
        item.teacher_id === teacherId &&
        item.starts_at >= from &&
        item.starts_at <= to,
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .map(toLessonListItem);

  return { week_start: dateKey(monday), lessons };
}

export function getDailyAgenda(
  teacherId: string,
  date?: string,
): { date: string; lessons: LessonListItem[] } {
  const day = date ? new Date(`${date}T00:00:00`) : new Date();
  const from = startOfDayIso(day);
  const to = endOfDayIso(day);
  const lessons = getDb()
    .lessons.filter(
      (item) =>
        item.teacher_id === teacherId && item.starts_at >= from && item.starts_at <= to,
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .map(toLessonListItem);

  return { date: dateKey(day), lessons };
}

export function getLessonStats(
  teacherId: string,
  options: { enrollment_id?: string; from_date?: string; to_date?: string } = {},
): LessonStats {
  let lessons = getDb().lessons.filter((item) => item.teacher_id === teacherId);
  if (options.enrollment_id) lessons = lessons.filter((item) => item.enrollment_id === options.enrollment_id);
  if (options.from_date) lessons = lessons.filter((item) => item.starts_at >= `${options.from_date}T00:00:00`);
  if (options.to_date) lessons = lessons.filter((item) => item.starts_at <= `${options.to_date}T23:59:59.999`);

  const completed = lessons.filter((item) => item.status === "completed").length;
  return {
    enrollment_id: options.enrollment_id ?? "",
    scheduled: lessons.filter((item) => item.status === "scheduled").length,
    completed,
    cancelled: lessons.filter((item) => item.status === "cancelled").length,
    no_show: lessons.filter((item) => item.status === "no_show").length,
    total: lessons.length,
    completion_rate: lessons.length === 0 ? 0 : Math.round((completed / lessons.length) * 100),
  };
}

/* -------------------------------------------------------------------------- */
/* Dashboard do professor                                                      */
/* -------------------------------------------------------------------------- */

export function getTeacherDashboard(teacherId: string): DashboardData {
  const db = getDb();
  const now = new Date();
  const todayStart = startOfDayIso(now);
  const todayEnd = endOfDayIso(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const nowIsoValue = nowIso();

  const teacherLessons = db.lessons.filter((item) => item.teacher_id === teacherId);
  const activeStudents = db.enrollments.filter(
    (item) => item.teacher_id === teacherId && item.status === "active",
  ).length;
  const pendingInvites = db.enrollments.filter(
    (item) => item.teacher_id === teacherId && item.status === "pending",
  ).length;
  const activePlans = db.monthly_plans.filter(
    (item) => item.teacher_id === teacherId && item.status === "published",
  ).length;
  const libraryVideos = db.videos.filter(
    (item) => item.teacher_id === teacherId && item.status === "ready",
  ).length;

  const today = teacherLessons.filter(
    (item) => item.starts_at >= todayStart && item.starts_at <= todayEnd,
  );

  return {
    active_students: activeStudents,
    lessons_today: today.filter((item) => item.status === "scheduled").length,
    completed_this_month: teacherLessons.filter(
      (item) => item.status === "completed" && item.starts_at >= monthStart && item.starts_at < monthEnd,
    ).length,
    cancelled_this_month: teacherLessons.filter(
      (item) => item.status === "cancelled" && item.starts_at >= monthStart && item.starts_at < monthEnd,
    ).length,
    no_show_this_month: teacherLessons.filter(
      (item) => item.status === "no_show" && item.starts_at >= monthStart && item.starts_at < monthEnd,
    ).length,
    upcoming_lessons: teacherLessons
      .filter((item) => item.status === "scheduled" && item.starts_at >= nowIsoValue)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .slice(0, 5)
      .map(toLessonListItem),
    next_lessons_today: today
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .map(toLessonListItem),
    pending_invites: pendingInvites,
    active_plans: activePlans,
    library_videos: libraryVideos,
  };
}
