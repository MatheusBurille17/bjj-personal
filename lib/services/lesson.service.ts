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
import { ApiError, buildPagination } from "@/lib/middleware/errors";
import {
  addDays,
  dateKey,
  endOfDayIso,
  startOfDayIso,
  startOfWeek,
} from "@/lib/utils/date";
import { createClient } from "@/lib/supabase/server";
import { mapPostgrestError, unwrapMaybe, unwrapVoid } from "@/lib/supabase/errors";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";

type Client = SupabaseClient<Database>;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

interface LessonContext {
  enrollments: Map<string, { student_name: string; student_email: string; status: string }>;
  planDays: Map<string, PlanDay>;
  videoCounts: Map<string, number>;
}

async function loadLessonContext(
  supabase: Client,
  lessons: Lesson[],
): Promise<LessonContext> {
  const enrollmentIds = Array.from(new Set(lessons.map((lesson) => lesson.enrollment_id)));
  const planDayIds = Array.from(
    new Set(lessons.map((lesson) => lesson.plan_day_id).filter((id): id is string => Boolean(id))),
  );
  const lessonIds = lessons.map((lesson) => lesson.id);

  const [enrollments, planDays, videos] = await Promise.all([
    enrollmentIds.length > 0
      ? supabase
          .from("enrollments")
          .select("id, student_name, student_email, status")
          .in("id", enrollmentIds)
      : Promise.resolve({ data: [], error: null }),
    planDayIds.length > 0
      ? supabase.from("plan_days").select("*").in("id", planDayIds)
      : Promise.resolve({ data: [], error: null }),
    lessonIds.length > 0
      ? supabase.from("lesson_videos").select("lesson_id").in("lesson_id", lessonIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (enrollments.error) throw mapPostgrestError(enrollments.error);
  if (planDays.error) throw mapPostgrestError(planDays.error);
  if (videos.error) throw mapPostgrestError(videos.error);

  const videoCounts = new Map<string, number>();
  for (const item of videos.data ?? []) {
    videoCounts.set(item.lesson_id, (videoCounts.get(item.lesson_id) ?? 0) + 1);
  }

  return {
    enrollments: new Map(
      (enrollments.data ?? []).map((item) => [
        item.id,
        {
          student_name: item.student_name,
          student_email: item.student_email,
          status: item.status,
        },
      ]),
    ),
    planDays: new Map((planDays.data ?? []).map((item) => [item.id, item])),
    videoCounts,
  };
}

function withContext(lesson: Lesson, context: LessonContext): LessonListItem {
  const enrollment = context.enrollments.get(lesson.enrollment_id);
  const planDay = lesson.plan_day_id ? context.planDays.get(lesson.plan_day_id) : undefined;

  return {
    ...lesson,
    student_name: enrollment?.student_name ?? "Aluno",
    student_email: enrollment?.student_email ?? "",
    enrollment_status: enrollment?.status ?? "archived",
    plan_day_title: planDay?.title ?? lesson.title_snapshot,
    video_count: context.videoCounts.get(lesson.id) ?? 0,
  };
}

async function enrichLessons(lessons: Lesson[]): Promise<LessonListItem[]> {
  if (lessons.length === 0) return [];
  const supabase = await createClient();
  const context = await loadLessonContext(supabase, lessons);
  return lessons.map((lesson) => withContext(lesson, context));
}

export function toLessonListItem(lesson: Lesson): LessonListItem {
  return {
    ...lesson,
    student_name: "Aluno",
    student_email: "",
    enrollment_status: "active",
    plan_day_title: lesson.title_snapshot,
    video_count: 0,
  };
}

async function ownedLesson(lessonId: string, teacherId: string): Promise<Lesson> {
  const supabase = await createClient();
  const lesson = unwrapMaybe(
    await supabase.from("lessons").select("*").eq("id", lessonId).maybeSingle(),
  );
  if (!lesson) throw ApiError.notFound("Aula não encontrada");
  if (lesson.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");
  return lesson;
}

async function enrollmentForTeacher(enrollmentId: string, teacherId: string) {
  const supabase = await createClient();
  const enrollment = unwrapMaybe(
    await supabase
      .from("enrollments")
      .select("id, teacher_id, student_name, student_email, status")
      .eq("id", enrollmentId)
      .maybeSingle(),
  );
  if (!enrollment) throw ApiError.notFound("Aluno não encontrado");
  if (enrollment.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");
  return enrollment;
}

async function planDayForTeacher(
  planDayId: string,
  teacherId: string,
): Promise<{ day: PlanDay; planStatus: string }> {
  const supabase = await createClient();
  const day = unwrapMaybe(
    await supabase.from("plan_days").select("*").eq("id", planDayId).maybeSingle(),
  );
  if (!day) throw ApiError.notFound("Dia do plano não encontrado");

  const plan = unwrapMaybe(
    await supabase
      .from("monthly_plans")
      .select("*")
      .eq("id", day.monthly_plan_id)
      .maybeSingle(),
  );
  if (!plan) throw ApiError.notFound("Plano não encontrado");
  if (plan.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");
  if (plan.status === "archived") {
    throw ApiError.conflict("Não é possível usar um dia de plano arquivado");
  }
  return { day, planStatus: plan.status };
}

/** Detecta sobreposição com outras aulas agendadas do mesmo professor. */
export async function detectConflicts(
  teacherId: string,
  startsAt: string,
  endsAt: string,
  excludeLessonId?: string,
): Promise<LessonListItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("lessons")
    .select("*")
    .eq("teacher_id", teacherId)
    .eq("status", "scheduled")
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt);

  if (excludeLessonId) query = query.neq("id", excludeLessonId);

  const { data, error } = await query;
  if (error) throw mapPostgrestError(error);
  return enrichLessons(data ?? []);
}

async function lessonVideos(lessonId: string): Promise<LessonVideoWithVideo[]> {
  const supabase = await createClient();
  const { data: associations, error } = await supabase
    .from("lesson_videos")
    .select("*")
    .eq("lesson_id", lessonId)
    .order("sort_order", { ascending: true });

  if (error) throw mapPostgrestError(error);
  const rows = associations ?? [];
  if (rows.length === 0) return [];

  const { data: videos, error: videoError } = await supabase
    .from("videos")
    .select("*")
    .in(
      "id",
      rows.map((item) => item.video_id),
    );

  if (videoError) throw mapPostgrestError(videoError);
  const map = new Map((videos ?? []).map((video) => [video.id, video]));

  const result: LessonVideoWithVideo[] = [];
  for (const association of rows) {
    const video = map.get(association.video_id);
    if (video) result.push({ ...association, video });
  }
  return result;
}

export async function getLessonDetail(
  lessonId: string,
  teacherId: string,
): Promise<LessonDetail> {
  const lesson = await ownedLesson(lessonId, teacherId);
  const supabase = await createClient();

  const [planDay, videos, teacher] = await Promise.all([
    lesson.plan_day_id
      ? supabase.from("plan_days").select("*").eq("id", lesson.plan_day_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    lessonVideos(lessonId),
    supabase.from("teachers").select("display_name").eq("id", teacherId).maybeSingle(),
  ]);

  const context = await loadLessonContext(supabase, [lesson]);

  return {
    ...withContext(lesson, context),
    plan_day: planDay.data ?? null,
    videos,
    teacher_name: teacher.data?.display_name ?? "Professor",
  };
}

/* -------------------------------------------------------------------------- */
/* Aulas                                                                       */
/* -------------------------------------------------------------------------- */

export async function getLessons(
  teacherId: string,
  options: {
    enrollment_id?: string;
    status?: string[];
    from_date?: string;
    to_date?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<{
  lessons: LessonListItem[];
  pagination: ReturnType<typeof buildPagination>;
}> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(Math.max(1, options.pageSize ?? 20), 100);
  const from = (page - 1) * pageSize;

  let query = supabase
    .from("lessons")
    .select("*", { count: "exact" })
    .eq("teacher_id", teacherId)
    .order("starts_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (options.enrollment_id) query = query.eq("enrollment_id", options.enrollment_id);
  if (options.status && options.status.length > 0) {
    query = query.in("status", options.status as LessonStatus[]);
  }
  if (options.from_date) query = query.gte("starts_at", `${options.from_date}T00:00:00`);
  if (options.to_date) query = query.lte("starts_at", `${options.to_date}T23:59:59.999`);

  const { data, error, count } = await query;
  if (error) throw mapPostgrestError(error);

  return {
    lessons: await enrichLessons(data ?? []),
    pagination: buildPagination(count ?? 0, page, pageSize),
  };
}

export async function createLesson(
  teacherId: string,
  data: CreateLessonData,
): Promise<LessonDetail> {
  const enrollment = await enrollmentForTeacher(data.enrollment_id, teacherId);
  if (enrollment.status === "archived") {
    throw ApiError.conflict("Alunos arquivados não podem ter novas aulas");
  }
  if (enrollment.status === "pending") {
    throw ApiError.conflict("O aluno ainda não aceitou o convite");
  }
  if (enrollment.status === "paused") {
    throw ApiError.conflict("Reative o vínculo antes de agendar novas aulas");
  }

  let planDay: PlanDay | null = null;
  if (data.plan_day_id) {
    planDay = (await planDayForTeacher(data.plan_day_id, teacherId)).day;
  }

  if (!data.override_conflict) {
    const conflicts = await detectConflicts(teacherId, data.starts_at, data.ends_at);
    if (conflicts.length > 0) {
      throw new ApiError(409, "CONFLICT", "Já existe uma aula agendada neste horário", {
        conflicts,
      });
    }
  }

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("lessons")
    .insert({
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
    })
    .select("*")
    .single();

  if (error) throw mapPostgrestError(error);
  return getLessonDetail(created.id, teacherId);
}

export async function updateLesson(
  lessonId: string,
  teacherId: string,
  data: UpdateLessonData,
): Promise<LessonDetail> {
  const current = await ownedLesson(lessonId, teacherId);
  const changesTime =
    data.starts_at !== undefined ||
    data.ends_at !== undefined ||
    data.plan_day_id !== undefined;

  if (changesTime && current.status !== "scheduled") {
    throw ApiError.conflict(
      "Aulas concluídas, canceladas ou com falta não podem ter data/horário alterados",
    );
  }

  let planDay: PlanDay | null = null;
  if (data.plan_day_id) {
    planDay = (await planDayForTeacher(data.plan_day_id, teacherId)).day;
  }

  const startsAt = data.starts_at ?? current.starts_at;
  const endsAt = data.ends_at ?? current.ends_at;
  if (new Date(endsAt) <= new Date(startsAt)) {
    throw ApiError.validation("O horário final deve ser posterior ao inicial", {
      fields: { ends_at: "Horário inválido" },
    });
  }

  if (changesTime && !data.override_conflict) {
    const conflicts = await detectConflicts(teacherId, startsAt, endsAt, lessonId);
    if (conflicts.length > 0) {
      throw new ApiError(409, "CONFLICT", "Já existe uma aula agendada neste horário", {
        conflicts,
      });
    }
  }

  const payload: {
    starts_at?: string;
    ends_at?: string;
    shared_notes?: string | null;
    private_notes?: string | null;
    plan_day_id?: string | null;
    title_snapshot?: string | null;
    objective_snapshot?: string | null;
  } = {};
  if (data.starts_at !== undefined) payload.starts_at = data.starts_at;
  if (data.ends_at !== undefined) payload.ends_at = data.ends_at;
  if (data.shared_notes !== undefined) payload.shared_notes = data.shared_notes;
  if (data.private_notes !== undefined) payload.private_notes = data.private_notes;
  if (data.plan_day_id !== undefined) {
    payload.plan_day_id = data.plan_day_id;
    payload.title_snapshot = planDay?.title ?? null;
    payload.objective_snapshot = planDay?.objective ?? null;
  }

  const supabase = await createClient();
  unwrapVoid(await supabase.from("lessons").update(payload).eq("id", lessonId));
  return getLessonDetail(lessonId, teacherId);
}

const FINAL_STATUSES: LessonStatus[] = ["completed", "cancelled", "no_show"];

export async function changeLessonStatus(
  lessonId: string,
  teacherId: string,
  input: {
    status: LessonStatus;
    shared_notes?: string | null;
    private_notes?: string | null;
    override_window?: boolean;
  },
): Promise<LessonDetail> {
  const lesson = await ownedLesson(lessonId, teacherId);
  if (!FINAL_STATUSES.includes(input.status)) {
    throw ApiError.validation("Status inválido para conclusão");
  }
  if (lesson.status !== "scheduled") {
    throw ApiError.conflict(
      `Não é possível alterar o status de "${lesson.status}" para "${input.status}"`,
    );
  }

  if (input.status === "completed") {
    const supabase = await createClient();
    const enrollment = unwrapMaybe(
      await supabase
        .from("enrollments")
        .select("id, status")
        .eq("id", lesson.enrollment_id)
        .maybeSingle(),
    );
    if (enrollment?.status === "archived") {
      throw ApiError.conflict("Não é possível concluir aulas de um vínculo arquivado");
    }

    const startsAt = new Date(lesson.starts_at).getTime();
    const now = Date.now();
    if (startsAt > now + 7 * 24 * 60 * 60 * 1000) {
      throw ApiError.validation(
        "Não é possível concluir uma aula agendada para mais de 7 dias no futuro",
      );
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

  const payload: {
    status: LessonStatus;
    completed_at?: string;
    shared_notes?: string | null;
    private_notes?: string | null;
  } = { status: input.status };
  if (input.status === "completed") payload.completed_at = new Date().toISOString();
  if (input.shared_notes !== undefined) payload.shared_notes = input.shared_notes;
  if (input.private_notes !== undefined) payload.private_notes = input.private_notes;

  const supabase = await createClient();
  unwrapVoid(await supabase.from("lessons").update(payload).eq("id", lessonId));
  return getLessonDetail(lessonId, teacherId);
}

/* -------------------------------------------------------------------------- */
/* Vídeos da aula                                                              */
/* -------------------------------------------------------------------------- */

export async function addLessonVideo(
  lessonId: string,
  teacherId: string,
  videoId: string,
  sortOrder?: number,
): Promise<LessonDetail> {
  const lesson = await ownedLesson(lessonId, teacherId);
  if (lesson.status !== "scheduled") {
    throw ApiError.conflict("Aulas finalizadas não podem receber novos vídeos");
  }

  const supabase = await createClient();
  const video = unwrapMaybe(
    await supabase.from("videos").select("*").eq("id", videoId).maybeSingle(),
  );
  if (!video) throw ApiError.notFound("Vídeo não encontrado");
  if (video.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");
  if (video.status !== "ready") {
    throw ApiError.conflict("Somente vídeos prontos podem ser associados");
  }

  const existing = unwrapMaybe(
    await supabase
      .from("lesson_videos")
      .select("id")
      .eq("lesson_id", lessonId)
      .eq("video_id", videoId)
      .maybeSingle(),
  );
  if (existing) throw ApiError.conflict("Este vídeo já está associado à aula");

  let order = sortOrder;
  if (order === undefined) {
    const last = await supabase
      .from("lesson_videos")
      .select("sort_order")
      .eq("lesson_id", lessonId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    order = (last.data?.sort_order ?? 0) + 1;
  }

  unwrapVoid(
    await supabase.from("lesson_videos").insert({
      lesson_id: lessonId,
      video_id: videoId,
      source: "manual",
      sort_order: order,
    }),
  );

  return getLessonDetail(lessonId, teacherId);
}

/** Copia os vídeos sugeridos pelo dia do plano. */
export async function copyPlanVideosToLesson(
  lessonId: string,
  teacherId: string,
): Promise<LessonDetail> {
  const lesson = await ownedLesson(lessonId, teacherId);
  if (lesson.status !== "scheduled") {
    throw ApiError.conflict("Aulas finalizadas não podem ser alteradas");
  }
  if (!lesson.plan_day_id) {
    throw ApiError.validation("A aula não possui um dia do plano vinculado");
  }

  const supabase = await createClient();
  const [associations, existing] = await Promise.all([
    supabase
      .from("plan_day_videos")
      .select("*")
      .eq("plan_day_id", lesson.plan_day_id),
    supabase.from("lesson_videos").select("video_id").eq("lesson_id", lessonId),
  ]);

  if (associations.error) throw mapPostgrestError(associations.error);
  if (existing.error) throw mapPostgrestError(existing.error);

  const existingIds = new Set((existing.data ?? []).map((item) => item.video_id));
  const rows = (associations.data ?? [])
    .filter((association) => !existingIds.has(association.video_id))
    .map((association) => ({
      lesson_id: lessonId,
      video_id: association.video_id,
      source: "plan" as const,
      sort_order: association.sort_order,
    }));

  if (rows.length > 0) {
    unwrapVoid(await supabase.from("lesson_videos").insert(rows));
  }

  return getLessonDetail(lessonId, teacherId);
}

export async function removeLessonVideo(
  lessonId: string,
  teacherId: string,
  associationId: string,
): Promise<LessonDetail> {
  const lesson = await ownedLesson(lessonId, teacherId);
  if (lesson.status !== "scheduled") {
    throw ApiError.conflict("Aulas finalizadas não podem ter vídeos removidos");
  }

  const supabase = await createClient();
  const association = unwrapMaybe(
    await supabase
      .from("lesson_videos")
      .select("*")
      .eq("id", associationId)
      .eq("lesson_id", lessonId)
      .maybeSingle(),
  );
  if (!association) throw ApiError.notFound("Associação não encontrada");

  unwrapVoid(await supabase.from("lesson_videos").delete().eq("id", associationId));

  const remaining = await supabase
    .from("lesson_videos")
    .select("id")
    .eq("lesson_id", lessonId)
    .order("sort_order", { ascending: true });

  if (remaining.error) throw mapPostgrestError(remaining.error);

  await Promise.all(
    (remaining.data ?? []).map(async (item, index) => {
      unwrapVoid(
        await supabase
          .from("lesson_videos")
          .update({ sort_order: index + 1 })
          .eq("id", item.id),
      );
    }),
  );

  return getLessonDetail(lessonId, teacherId);
}

export async function reorderLessonVideos(
  lessonId: string,
  teacherId: string,
  items: Array<{ id: string; sort_order: number }>,
): Promise<LessonDetail> {
  const lesson = await ownedLesson(lessonId, teacherId);
  if (lesson.status !== "scheduled") {
    throw ApiError.conflict("Aulas finalizadas não podem ser reordenadas");
  }

  const supabase = await createClient();
  for (const item of items) {
    const association = unwrapMaybe(
      await supabase
        .from("lesson_videos")
        .select("id, lesson_id")
        .eq("id", item.id)
        .maybeSingle(),
    );
    if (!association || association.lesson_id !== lessonId) {
      throw ApiError.validation("Todos os vídeos devem pertencer à mesma aula");
    }
  }

  await Promise.all(
    items.map(async (item) => {
      unwrapVoid(
        await supabase
          .from("lesson_videos")
          .update({ sort_order: item.sort_order })
          .eq("id", item.id),
      );
    }),
  );

  return getLessonDetail(lessonId, teacherId);
}

/* -------------------------------------------------------------------------- */
/* Horários recorrentes                                                        */
/* -------------------------------------------------------------------------- */

export async function getWeeklySlots(
  teacherId: string,
  enrollmentId?: string,
): Promise<WeeklySlotWithStudent[]> {
  const supabase = await createClient();
  const today = dateKey(new Date());

  let query = supabase
    .from("weekly_slots")
    .select("*")
    .eq("teacher_id", teacherId)
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });

  if (enrollmentId) query = query.eq("enrollment_id", enrollmentId);

  const { data, error } = await query;
  if (error) throw mapPostgrestError(error);

  const slots = (data ?? []).filter(
    (slot) => !slot.valid_until || slot.valid_until >= today,
  );
  if (slots.length === 0) return [];

  const enrollmentIds = Array.from(new Set(slots.map((slot) => slot.enrollment_id)));
  const { data: enrollments, error: enrollmentError } = await supabase
    .from("enrollments")
    .select("id, student_name")
    .in("id", enrollmentIds);

  if (enrollmentError) throw mapPostgrestError(enrollmentError);
  const names = new Map((enrollments ?? []).map((item) => [item.id, item.student_name]));

  return slots.map((slot) => ({
    ...slot,
    student_name: names.get(slot.enrollment_id) ?? "Aluno",
  }));
}

export async function createWeeklySlot(
  teacherId: string,
  data: CreateWeeklySlotData,
): Promise<WeeklySlot> {
  const enrollment = await enrollmentForTeacher(data.enrollment_id, teacherId);
  if (enrollment.status === "archived" || enrollment.status === "pending") {
    throw ApiError.conflict(
      "O aluno precisa ter um vínculo ativo ou pausado para receber horários",
    );
  }

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("weekly_slots")
    .insert({
      teacher_id: teacherId,
      enrollment_id: data.enrollment_id,
      weekday: data.weekday,
      start_time: data.start_time,
      end_time: data.end_time,
      valid_from: data.valid_from ?? dateKey(new Date()),
      valid_until: data.valid_until ?? null,
      status: "active",
    })
    .select("*")
    .single();

  if (error) throw mapPostgrestError(error);
  return created;
}

export async function updateWeeklySlot(
  slotId: string,
  teacherId: string,
  data: UpdateWeeklySlotData,
): Promise<WeeklySlot> {
  const supabase = await createClient();
  const slot = unwrapMaybe(
    await supabase.from("weekly_slots").select("*").eq("id", slotId).maybeSingle(),
  );
  if (!slot) throw ApiError.notFound("Horário não encontrado");
  if (slot.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");

  const start = data.start_time ?? slot.start_time;
  const end = data.end_time ?? slot.end_time;
  if (end <= start) {
    throw ApiError.validation("O horário final deve ser posterior ao inicial");
  }

  const payload: {
    weekday?: number;
    start_time?: string;
    end_time?: string;
    valid_from?: string;
    valid_until?: string | null;
  } = {};
  if (data.weekday !== undefined) payload.weekday = data.weekday;
  if (data.start_time !== undefined) payload.start_time = data.start_time;
  if (data.end_time !== undefined) payload.end_time = data.end_time;
  if (data.valid_from !== undefined) payload.valid_from = data.valid_from;
  if (data.valid_until !== undefined) payload.valid_until = data.valid_until;

  const { data: updated, error } = await supabase
    .from("weekly_slots")
    .update(payload)
    .eq("id", slotId)
    .select("*")
    .single();

  if (error) throw mapPostgrestError(error);
  return updated;
}

export async function setWeeklySlotStatus(
  slotId: string,
  teacherId: string,
  status: "active" | "paused",
): Promise<WeeklySlot> {
  const supabase = await createClient();
  const slot = unwrapMaybe(
    await supabase.from("weekly_slots").select("*").eq("id", slotId).maybeSingle(),
  );
  if (!slot) throw ApiError.notFound("Horário não encontrado");
  if (slot.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");
  if (slot.status === status) {
    throw ApiError.conflict(
      status === "active" ? "Este horário já está ativo" : "Este horário já está pausado",
    );
  }

  const { data, error } = await supabase
    .from("weekly_slots")
    .update({ status })
    .eq("id", slotId)
    .select("*")
    .single();

  if (error) throw mapPostgrestError(error);
  return data;
}

export async function deleteWeeklySlot(
  slotId: string,
  teacherId: string,
): Promise<void> {
  const supabase = await createClient();
  const slot = unwrapMaybe(
    await supabase.from("weekly_slots").select("*").eq("id", slotId).maybeSingle(),
  );
  if (!slot) throw ApiError.notFound("Horário não encontrado");
  if (slot.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");

  const { data: lessons, error } = await supabase
    .from("lessons")
    .select("id, starts_at")
    .eq("enrollment_id", slot.enrollment_id);

  if (error) throw mapPostgrestError(error);

  const hasGenerated = (lessons ?? []).some((lesson) => {
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

  unwrapVoid(await supabase.from("weekly_slots").delete().eq("id", slotId));
}

/* -------------------------------------------------------------------------- */
/* Geração de aulas                                                            */
/* -------------------------------------------------------------------------- */

function buildDateTime(date: string, time: string): Date {
  const [hours, minutes] = time.split(":");
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, Number(hours), Number(minutes ?? 0), 0, 0);
}

export async function generateLessonsFromSlots(
  teacherId: string,
  input: {
    date_from: string;
    date_to: string;
    confirm?: boolean;
    enrollment_ids?: string[];
  },
): Promise<{ suggestions: GeneratedLessonSuggestion[]; created: LessonListItem[] }> {
  const supabase = await createClient();

  const { data: slots, error: slotError } = await supabase
    .from("weekly_slots")
    .select("*")
    .eq("teacher_id", teacherId)
    .eq("status", "active");

  if (slotError) throw mapPostgrestError(slotError);

  const activeSlots = (slots ?? []).filter(
    (slot) => !input.enrollment_ids || input.enrollment_ids.includes(slot.enrollment_id),
  );
  if (activeSlots.length === 0) return { suggestions: [], created: [] };

  const enrollmentIds = Array.from(new Set(activeSlots.map((slot) => slot.enrollment_id)));
  const [enrollments, lessons] = await Promise.all([
    supabase
      .from("enrollments")
      .select("id, student_name, status")
      .in("id", enrollmentIds),
    supabase
      .from("lessons")
      .select("id, enrollment_id, starts_at")
      .in("enrollment_id", enrollmentIds),
  ]);

  if (enrollments.error) throw mapPostgrestError(enrollments.error);
  if (lessons.error) throw mapPostgrestError(lessons.error);

  const enrollmentMap = new Map((enrollments.data ?? []).map((item) => [item.id, item]));
  const existing = new Set(
    (lessons.data ?? []).map((lesson) => `${lesson.enrollment_id}|${lesson.starts_at}`),
  );

  const suggestions: GeneratedLessonSuggestion[] = [];
  const startDate = new Date(`${input.date_from}T00:00:00`);
  const endDate = new Date(`${input.date_to}T00:00:00`);

  for (let cursor = startDate; cursor <= endDate; cursor = addDays(cursor, 1)) {
    const date = dateKey(cursor);
    for (const slot of activeSlots) {
      if (slot.weekday !== cursor.getDay()) continue;
      if (date < slot.valid_from) continue;
      if (slot.valid_until && date > slot.valid_until) continue;

      const startsAt = buildDateTime(date, slot.start_time).toISOString();
      const endsAt = buildDateTime(date, slot.end_time).toISOString();
      if (existing.has(`${slot.enrollment_id}|${startsAt}`)) continue;

      const enrollment = enrollmentMap.get(slot.enrollment_id);
      if (!enrollment || enrollment.status !== "active") continue;

      suggestions.push({
        enrollment_id: slot.enrollment_id,
        student_name: enrollment.student_name,
        starts_at: startsAt,
        ends_at: endsAt,
        weekly_slot_id: slot.id,
        conflicts: await detectConflicts(teacherId, startsAt, endsAt),
      });
    }
  }

  suggestions.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  if (!input.confirm) return { suggestions, created: [] };

  if (suggestions.length === 0) return { suggestions, created: [] };

  const { data: created, error } = await supabase
    .from("lessons")
    .insert(
      suggestions.map((suggestion) => ({
        teacher_id: teacherId,
        enrollment_id: suggestion.enrollment_id,
        plan_day_id: null,
        starts_at: suggestion.starts_at,
        ends_at: suggestion.ends_at,
        status: "scheduled" as const,
        completed_at: null,
        shared_notes: null,
        private_notes: null,
        title_snapshot: null,
        objective_snapshot: null,
        rescheduled_from_id: null,
      })),
    )
    .select("*");

  if (error) throw mapPostgrestError(error);
  return { suggestions, created: await enrichLessons(created ?? []) };
}

/* -------------------------------------------------------------------------- */
/* Agenda                                                                      */
/* -------------------------------------------------------------------------- */

async function lessonsInRange(
  teacherId: string,
  from: string,
  to: string,
): Promise<LessonListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lessons")
    .select("*")
    .eq("teacher_id", teacherId)
    .gte("starts_at", from)
    .lte("starts_at", to)
    .order("starts_at", { ascending: true });

  if (error) throw mapPostgrestError(error);
  return enrichLessons(data ?? []);
}

export async function getWeeklyAgenda(
  teacherId: string,
  weekStart?: string,
): Promise<{ week_start: string; lessons: LessonListItem[] }> {
  const base = weekStart ? new Date(`${weekStart}T00:00:00`) : new Date();
  const monday = startOfWeek(base);
  const from = startOfDayIso(monday);
  const to = endOfDayIso(addDays(monday, 6));
  return {
    week_start: dateKey(monday),
    lessons: await lessonsInRange(teacherId, from, to),
  };
}

export async function getDailyAgenda(
  teacherId: string,
  date?: string,
): Promise<{ date: string; lessons: LessonListItem[] }> {
  const day = date ? new Date(`${date}T00:00:00`) : new Date();
  return {
    date: dateKey(day),
    lessons: await lessonsInRange(teacherId, startOfDayIso(day), endOfDayIso(day)),
  };
}

export async function getLessonStats(
  teacherId: string,
  options: { enrollment_id?: string; from_date?: string; to_date?: string } = {},
): Promise<LessonStats> {
  const supabase = await createClient();
  let query = supabase.from("lessons").select("status").eq("teacher_id", teacherId);
  if (options.enrollment_id) query = query.eq("enrollment_id", options.enrollment_id);
  if (options.from_date) query = query.gte("starts_at", `${options.from_date}T00:00:00`);
  if (options.to_date) query = query.lte("starts_at", `${options.to_date}T23:59:59.999`);

  const { data, error } = await query;
  if (error) throw mapPostgrestError(error);

  const lessons = data ?? [];
  const completed = lessons.filter((item) => item.status === "completed").length;
  return {
    enrollment_id: options.enrollment_id ?? "",
    scheduled: lessons.filter((item) => item.status === "scheduled").length,
    completed,
    cancelled: lessons.filter((item) => item.status === "cancelled").length,
    no_show: lessons.filter((item) => item.status === "no_show").length,
    total: lessons.length,
    completion_rate:
      lessons.length === 0 ? 0 : Math.round((completed / lessons.length) * 100),
  };
}

/* -------------------------------------------------------------------------- */
/* Dashboard do professor                                                      */
/* -------------------------------------------------------------------------- */

export async function getTeacherDashboard(teacherId: string): Promise<DashboardData> {
  const supabase = await createClient();
  const now = new Date();
  const todayStart = startOfDayIso(now);
  const todayEnd = endOfDayIso(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const nowValue = now.toISOString();

  const [activeStudents, pendingInvites, activePlans, libraryVideos, todaysLessons, monthLessons, upcoming] =
    await Promise.all([
      supabase
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("teacher_id", teacherId)
        .eq("status", "active"),
      supabase
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("teacher_id", teacherId)
        .eq("status", "pending"),
      supabase
        .from("monthly_plans")
        .select("id", { count: "exact", head: true })
        .eq("teacher_id", teacherId)
        .eq("status", "published"),
      supabase
        .from("videos")
        .select("id", { count: "exact", head: true })
        .eq("teacher_id", teacherId)
        .eq("status", "ready"),
      supabase
        .from("lessons")
        .select("*")
        .eq("teacher_id", teacherId)
        .gte("starts_at", todayStart)
        .lte("starts_at", todayEnd)
        .order("starts_at", { ascending: true }),
      supabase
        .from("lessons")
        .select("status")
        .eq("teacher_id", teacherId)
        .gte("starts_at", monthStart)
        .lt("starts_at", monthEnd),
      supabase
        .from("lessons")
        .select("*")
        .eq("teacher_id", teacherId)
        .eq("status", "scheduled")
        .gte("starts_at", nowValue)
        .order("starts_at", { ascending: true })
        .limit(5),
    ]);

  for (const result of [activeStudents, pendingInvites, activePlans, libraryVideos, todaysLessons, monthLessons, upcoming]) {
    if (result.error) throw mapPostgrestError(result.error);
  }

  const monthRows = monthLessons.data ?? [];
  const todayRows = todaysLessons.data ?? [];

  return {
    active_students: activeStudents.count ?? 0,
    lessons_today: todayRows.filter((item) => item.status === "scheduled").length,
    completed_this_month: monthRows.filter((item) => item.status === "completed").length,
    cancelled_this_month: monthRows.filter((item) => item.status === "cancelled").length,
    no_show_this_month: monthRows.filter((item) => item.status === "no_show").length,
    upcoming_lessons: await enrichLessons(upcoming.data ?? []),
    next_lessons_today: await enrichLessons(todayRows),
    pending_invites: pendingInvites.count ?? 0,
    active_plans: activePlans.count ?? 0,
    library_videos: libraryVideos.count ?? 0,
  };
}
