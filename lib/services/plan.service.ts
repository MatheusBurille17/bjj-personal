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
  PlanStatus,
} from "@/types/plan";
import type { Video } from "@/types/library";
import { ApiError, buildPagination } from "@/lib/middleware/errors";
import type { CreatePlanInput, CreatePlanDayInput } from "@/lib/validation/plan";
import { createClient } from "@/lib/supabase/server";
import { mapPostgrestError, unwrapMaybe, unwrapVoid } from "@/lib/supabase/errors";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

async function ownedPlan(planId: string, teacherId: string): Promise<MonthlyPlan> {
  const supabase = await createClient();
  const plan = unwrapMaybe(
    await supabase.from("monthly_plans").select("*").eq("id", planId).maybeSingle(),
  );
  if (!plan) throw ApiError.notFound("Plano não encontrado");
  if (plan.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");
  return plan;
}

async function loadPlanDays(planId: string): Promise<PlanDay[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plan_days")
    .select("*")
    .eq("monthly_plan_id", planId)
    .order("sort_order", { ascending: true });

  if (error) throw mapPostgrestError(error);
  return data ?? [];
}

async function loadVideosByDay(dayIds: string[]): Promise<Map<string, PlanDayVideoItem[]>> {
  const grouped = new Map<string, PlanDayVideoItem[]>();
  if (dayIds.length === 0) return grouped;

  const supabase = await createClient();
  const { data: associations, error: associationError } = await supabase
    .from("plan_day_videos")
    .select("*")
    .in("plan_day_id", dayIds)
    .order("sort_order", { ascending: true });

  if (associationError) throw mapPostgrestError(associationError);
  const rows = associations ?? [];
  if (rows.length === 0) return grouped;

  const videoIds = Array.from(new Set(rows.map((item) => item.video_id)));
  const { data: videos, error: videoError } = await supabase
    .from("videos")
    .select("*")
    .in("id", videoIds);

  if (videoError) throw mapPostgrestError(videoError);

  const videoMap = new Map((videos ?? []).map((video) => [video.id, video]));
  for (const association of rows) {
    const video = videoMap.get(association.video_id);
    if (!video) continue;
    const list = grouped.get(association.plan_day_id) ?? [];
    list.push({
      ...video,
      association_id: association.id,
      sort_order: association.sort_order,
    });
    grouped.set(association.plan_day_id, list);
  }
  return grouped;
}

async function loadPlanEnrollments(planId: string): Promise<PlanEnrollmentInfo[]> {
  const supabase = await createClient();
  const { data: associations, error } = await supabase
    .from("plan_enrollments")
    .select("*")
    .eq("monthly_plan_id", planId);

  if (error) throw mapPostgrestError(error);
  const rows = associations ?? [];
  if (rows.length === 0) return [];

  const enrollmentIds = Array.from(new Set(rows.map((item) => item.enrollment_id)));
  const { data: enrollments, error: enrollmentError } = await supabase
    .from("enrollments")
    .select("id, student_name, student_email, status")
    .in("id", enrollmentIds);

  if (enrollmentError) throw mapPostgrestError(enrollmentError);
  const map = new Map((enrollments ?? []).map((item) => [item.id, item]));

  return rows.map((association) => {
    const enrollment = map.get(association.enrollment_id);
    return {
      ...association,
      student_name: enrollment?.student_name ?? "Aluno",
      student_email: enrollment?.student_email ?? "",
      status: enrollment?.status ?? "archived",
    };
  });
}

async function toPlansWithCounts(plans: MonthlyPlan[]): Promise<MonthlyPlanWithCounts[]> {
  if (plans.length === 0) return [];
  const supabase = await createClient();
  const ids = plans.map((plan) => plan.id);

  const [days, associations] = await Promise.all([
    supabase.from("plan_days").select("monthly_plan_id").in("monthly_plan_id", ids),
    supabase
      .from("plan_enrollments")
      .select("monthly_plan_id")
      .in("monthly_plan_id", ids),
  ]);

  if (days.error) throw mapPostgrestError(days.error);
  if (associations.error) throw mapPostgrestError(associations.error);

  const dayCounts = new Map<string, number>();
  for (const item of days.data ?? []) {
    dayCounts.set(item.monthly_plan_id, (dayCounts.get(item.monthly_plan_id) ?? 0) + 1);
  }
  const enrolledCounts = new Map<string, number>();
  for (const item of associations.data ?? []) {
    enrolledCounts.set(
      item.monthly_plan_id,
      (enrolledCounts.get(item.monthly_plan_id) ?? 0) + 1,
    );
  }

  return plans.map((plan) => ({
    ...plan,
    plan_day_count: dayCounts.get(plan.id) ?? 0,
    enrolled_count: enrolledCounts.get(plan.id) ?? 0,
  }));
}

async function toPlanWithCounts(plan: MonthlyPlan): Promise<MonthlyPlanWithCounts> {
  const [withCounts] = await toPlansWithCounts([plan]);
  return withCounts;
}

async function dayWithVideos(day: PlanDay): Promise<PlanDayWithVideos> {
  const videos = (await loadVideosByDay([day.id])).get(day.id) ?? [];
  return { ...day, videos, video_count: videos.length };
}

/* -------------------------------------------------------------------------- */
/* Planos                                                                      */
/* -------------------------------------------------------------------------- */

export async function getPlans(
  teacherId: string,
  options: {
    search?: string;
    status?: string[];
    from_date?: string;
    to_date?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<{
  plans: MonthlyPlanWithCounts[];
  pagination: ReturnType<typeof buildPagination>;
}> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(Math.max(1, options.pageSize ?? 20), 100);
  const from = (page - 1) * pageSize;
  const statuses =
    options.status && options.status.length > 0 ? options.status : ["draft", "published"];

  let query = supabase
    .from("monthly_plans")
    .select("*", { count: "exact" })
    .eq("teacher_id", teacherId)
    .order("period_start", { ascending: false })
    .range(from, from + pageSize - 1);

  if (!statuses.includes("archived")) query = query.neq("status", "archived");
  query = query.in("status", statuses as PlanStatus[]);

  if (options.search?.trim()) query = query.ilike("title", `%${options.search.trim()}%`);

  if (options.from_date && options.to_date) {
    query = query.or(
      `and(period_start.gte.${options.from_date},period_start.lte.${options.to_date}),and(period_end.gte.${options.from_date},period_end.lte.${options.to_date})`,
    );
  } else if (options.from_date) {
    query = query.gte("period_start", options.from_date);
  } else if (options.to_date) {
    query = query.lte("period_end", options.to_date);
  }

  const { data, error, count } = await query;
  if (error) throw mapPostgrestError(error);

  return {
    plans: await toPlansWithCounts(data ?? []),
    pagination: buildPagination(count ?? 0, page, pageSize),
  };
}

export async function createPlan(
  teacherId: string,
  data: CreatePlanInput,
): Promise<MonthlyPlanWithCounts> {
  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("monthly_plans")
    .insert({
      teacher_id: teacherId,
      title: data.title,
      description: data.description ?? null,
      objective: data.objective ?? null,
      period_start: data.period_start,
      period_end: data.period_end,
      status: "draft",
      published_at: null,
      archived_at: null,
    })
    .select("*")
    .single();

  if (error) throw mapPostgrestError(error);
  return toPlanWithCounts(created);
}

export async function getPlanDetail(planId: string, teacherId: string): Promise<PlanDetail> {
  const plan = await ownedPlan(planId, teacherId);
  const days = await loadPlanDays(planId);
  const videosByDay = await loadVideosByDay(days.map((day) => day.id));
  const enrollments = await loadPlanEnrollments(planId);

  return {
    ...(await toPlanWithCounts(plan)),
    days: days.map((day) => {
      const videos = videosByDay.get(day.id) ?? [];
      return { ...day, videos, video_count: videos.length };
    }),
    enrollments,
  };
}

export async function updatePlan(
  planId: string,
  teacherId: string,
  data: UpdatePlanData,
): Promise<MonthlyPlanWithCounts> {
  const current = await ownedPlan(planId, teacherId);
  const periodStart = data.period_start ?? current.period_start;
  const periodEnd = data.period_end ?? current.period_end;
  if (periodEnd < periodStart) {
    throw ApiError.validation("A data final deve ser igual ou posterior à inicial");
  }

  const payload: {
    title?: string;
    description?: string | null;
    objective?: string | null;
    period_start?: string;
    period_end?: string;
  } = {};
  if (data.title !== undefined) payload.title = data.title;
  if (data.description !== undefined) payload.description = data.description;
  if (data.objective !== undefined) payload.objective = data.objective;
  if (data.period_start !== undefined) payload.period_start = data.period_start;
  if (data.period_end !== undefined) payload.period_end = data.period_end;

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("monthly_plans")
    .update(payload)
    .eq("id", planId)
    .select("*")
    .single();

  if (error) throw mapPostgrestError(error);
  return toPlanWithCounts(updated);
}

async function changePlanStatus(
  planId: string,
  teacherId: string,
  status: "draft" | "published" | "archived",
  extra: { published_at?: string; archived_at?: string | null } = {},
): Promise<MonthlyPlanWithCounts> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("monthly_plans")
    .update({ status, ...extra })
    .eq("id", planId)
    .select("*")
    .single();

  if (error) throw mapPostgrestError(error);
  return toPlanWithCounts(data);
}

/** Publica somente planos em rascunho. Não concede acesso automaticamente. */
export async function publishPlan(
  planId: string,
  teacherId: string,
): Promise<MonthlyPlanWithCounts> {
  const plan = await ownedPlan(planId, teacherId);
  if (plan.status === "published") throw ApiError.conflict("Este plano já está publicado");
  if (plan.status === "archived") {
    throw ApiError.conflict("Planos arquivados não podem ser publicados");
  }
  return changePlanStatus(planId, teacherId, "published", {
    published_at: new Date().toISOString(),
  });
}

/** Despublica mantendo published_at para auditoria. */
export async function unpublishPlan(
  planId: string,
  teacherId: string,
): Promise<MonthlyPlanWithCounts> {
  const plan = await ownedPlan(planId, teacherId);
  if (plan.status !== "published") {
    throw ApiError.conflict("Somente planos publicados podem ser despublicados");
  }
  return changePlanStatus(planId, teacherId, "draft");
}

export async function archivePlan(
  planId: string,
  teacherId: string,
): Promise<MonthlyPlanWithCounts> {
  const plan = await ownedPlan(planId, teacherId);
  if (plan.status === "archived") throw ApiError.conflict("Este plano já está arquivado");
  return changePlanStatus(planId, teacherId, "archived", {
    archived_at: plan.archived_at ?? new Date().toISOString(),
  });
}

export async function unarchivePlan(
  planId: string,
  teacherId: string,
): Promise<MonthlyPlanWithCounts> {
  const plan = await ownedPlan(planId, teacherId);
  if (plan.status !== "archived") {
    throw ApiError.conflict("Somente planos arquivados podem ser reativados");
  }
  return changePlanStatus(planId, teacherId, "draft");
}

/** Duplica plano, dias e vídeos, sem copiar acessos. */
export async function duplicatePlan(planId: string, teacherId: string): Promise<PlanDetail> {
  const source = await ownedPlan(planId, teacherId);
  const supabase = await createClient();

  const { data: newPlan, error: planError } = await supabase
    .from("monthly_plans")
    .insert({
      teacher_id: source.teacher_id,
      title: `${source.title} (Copy)`,
      description: source.description,
      objective: source.objective,
      period_start: source.period_start,
      period_end: source.period_end,
      status: "draft",
      published_at: null,
      archived_at: null,
    })
    .select("*")
    .single();

  if (planError) throw mapPostgrestError(planError);

  const days = await loadPlanDays(planId);
  if (days.length > 0) {
    const { data: newDays, error: dayError } = await supabase
      .from("plan_days")
      .insert(
        days.map((day) => ({
          monthly_plan_id: newPlan.id,
          teacher_id: teacherId,
          weekday: day.weekday,
          planned_date: day.planned_date,
          title: day.title,
          objective: day.objective,
          notes: day.notes,
          sort_order: day.sort_order,
        })),
      )
      .select("*");

    if (dayError) throw mapPostgrestError(dayError);

    const newDayByOrder = new Map(
      (newDays ?? []).map((day) => [day.sort_order, day.id] as const),
    );

    const associations = await supabase
      .from("plan_day_videos")
      .select("*")
      .in("plan_day_id", days.map((day) => day.id));
    if (associations.error) throw mapPostgrestError(associations.error);

    const rows = (associations.data ?? [])
      .map((association) => {
        const originalDay = days.find((day) => day.id === association.plan_day_id);
        const newDayId = originalDay
          ? newDayByOrder.get(originalDay.sort_order)
          : undefined;
        if (!newDayId) return null;
        return {
          plan_day_id: newDayId,
          video_id: association.video_id,
          sort_order: association.sort_order,
        };
      })
      .filter((row): row is { plan_day_id: string; video_id: string; sort_order: number } =>
        Boolean(row),
      );

    if (rows.length > 0) {
      const result = await supabase.from("plan_day_videos").insert(rows);
      unwrapVoid(result);
    }
  }

  return getPlanDetail(newPlan.id, teacherId);
}

/** Exclui apenas quando não há aulas referenciando os dias do plano. */
export async function deletePlan(planId: string, teacherId: string): Promise<void> {
  await ownedPlan(planId, teacherId);
  const supabase = await createClient();

  const days = await loadPlanDays(planId);
  if (days.length > 0) {
    const { count, error } = await supabase
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .in(
        "plan_day_id",
        days.map((day) => day.id),
      );

    if (error) throw mapPostgrestError(error);
    if ((count ?? 0) > 0) {
      throw ApiError.conflict(
        "Este plano possui aulas vinculadas e não pode ser excluído. Arquive o plano para preservar o histórico.",
      );
    }
  }

  unwrapVoid(await supabase.from("monthly_plans").delete().eq("id", planId));
}

/* -------------------------------------------------------------------------- */
/* Dias do plano                                                               */
/* -------------------------------------------------------------------------- */

export async function getPlanDays(
  planId: string,
  teacherId: string,
): Promise<PlanDayWithVideos[]> {
  await ownedPlan(planId, teacherId);
  const days = await loadPlanDays(planId);
  const videosByDay = await loadVideosByDay(days.map((day) => day.id));
  return days.map((day) => {
    const videos = videosByDay.get(day.id) ?? [];
    return { ...day, videos, video_count: videos.length };
  });
}

/** Vídeos de um dia específico, com verificação de propriedade do plano. */
export async function getPlanDayVideos(
  dayId: string,
  teacherId: string,
): Promise<PlanDayVideoItem[]> {
  const supabase = await createClient();
  const day = unwrapMaybe(
    await supabase.from("plan_days").select("*").eq("id", dayId).maybeSingle(),
  );
  if (!day) throw ApiError.notFound("Dia do plano não encontrado");
  await ownedPlan(day.monthly_plan_id, teacherId);
  return (await loadVideosByDay([dayId])).get(dayId) ?? [];
}

export async function createPlanDay(
  planId: string,
  teacherId: string,
  data: CreatePlanDayInput,
): Promise<PlanDayWithVideos> {
  const plan = await ownedPlan(planId, teacherId);
  if (plan.status === "archived") {
    throw ApiError.conflict("Planos arquivados não podem ser editados");
  }
  if (
    data.planned_date &&
    (data.planned_date < plan.period_start || data.planned_date > plan.period_end)
  ) {
    throw ApiError.validation("A data planejada deve estar dentro do período do plano", {
      fields: { planned_date: "Fora do período do plano" },
    });
  }

  const supabase = await createClient();
  let sortOrder = data.sort_order;
  if (sortOrder === undefined) {
    const last = await supabase
      .from("plan_days")
      .select("sort_order")
      .eq("monthly_plan_id", planId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    sortOrder = (last.data?.sort_order ?? 0) + 1;
  }

  const { data: created, error } = await supabase
    .from("plan_days")
    .insert({
      monthly_plan_id: planId,
      teacher_id: teacherId,
      weekday: data.weekday ?? null,
      planned_date: data.planned_date ?? null,
      title: data.title,
      objective: data.objective ?? null,
      notes: data.notes ?? null,
      sort_order: sortOrder,
    })
    .select("*")
    .single();

  if (error) throw mapPostgrestError(error);
  return { ...created, videos: [], video_count: 0 };
}

export async function updatePlanDay(
  dayId: string,
  teacherId: string,
  data: UpdatePlanDayData,
): Promise<PlanDayWithVideos> {
  const supabase = await createClient();
  const existing = unwrapMaybe(
    await supabase.from("plan_days").select("*").eq("id", dayId).maybeSingle(),
  );
  if (!existing) throw ApiError.notFound("Dia do plano não encontrado");
  const plan = await ownedPlan(existing.monthly_plan_id, teacherId);

  const nextDate =
    data.planned_date !== undefined ? data.planned_date : existing.planned_date;
  if (nextDate && (nextDate < plan.period_start || nextDate > plan.period_end)) {
    throw ApiError.validation("A data planejada deve estar dentro do período do plano", {
      fields: { planned_date: "Fora do período do plano" },
    });
  }

  const payload: {
    weekday?: number | null;
    planned_date?: string | null;
    title?: string;
    objective?: string | null;
    notes?: string | null;
    sort_order?: number;
  } = {};
  if (data.weekday !== undefined) payload.weekday = data.weekday;
  if (data.planned_date !== undefined) payload.planned_date = data.planned_date;
  if (data.title !== undefined) payload.title = data.title;
  if (data.objective !== undefined) payload.objective = data.objective;
  if (data.notes !== undefined) payload.notes = data.notes;
  if (data.sort_order !== undefined) payload.sort_order = data.sort_order;

  const { data: updated, error } = await supabase
    .from("plan_days")
    .update(payload)
    .eq("id", dayId)
    .select("*")
    .single();

  if (error) throw mapPostgrestError(error);
  return dayWithVideos(updated);
}

export async function reorderPlanDays(
  teacherId: string,
  items: Array<{ id: string; sort_order: number }>,
): Promise<void> {
  const supabase = await createClient();

  for (const item of items) {
    const day = unwrapMaybe(
      await supabase.from("plan_days").select("*").eq("id", item.id).maybeSingle(),
    );
    if (!day) throw ApiError.notFound("Dia do plano não encontrado");
    await ownedPlan(day.monthly_plan_id, teacherId);
  }

  await Promise.all(
    items.map(async (item) => {
      const result = await supabase
        .from("plan_days")
        .update({ sort_order: item.sort_order })
        .eq("id", item.id);
      unwrapVoid(result);
    }),
  );
}

/** Remove o dia; associações de vídeo caem em cascata. */
export async function deletePlanDay(
  dayId: string,
  teacherId: string,
): Promise<void> {
  const supabase = await createClient();
  const day = unwrapMaybe(
    await supabase.from("plan_days").select("*").eq("id", dayId).maybeSingle(),
  );
  if (!day) throw ApiError.notFound("Dia do plano não encontrado");
  await ownedPlan(day.monthly_plan_id, teacherId);

  unwrapVoid(await supabase.from("plan_days").delete().eq("id", dayId));
}

/* -------------------------------------------------------------------------- */
/* Vídeos dos dias                                                             */
/* -------------------------------------------------------------------------- */

export async function addVideoToPlanDay(
  dayId: string,
  teacherId: string,
  videoId: string,
  sortOrder?: number,
): Promise<PlanDayWithVideos> {
  const supabase = await createClient();
  const day = unwrapMaybe(
    await supabase.from("plan_days").select("*").eq("id", dayId).maybeSingle(),
  );
  if (!day) throw ApiError.notFound("Dia do plano não encontrado");
  await ownedPlan(day.monthly_plan_id, teacherId);

  const video = unwrapMaybe(
    await supabase.from("videos").select("*").eq("id", videoId).maybeSingle(),
  );
  if (!video) throw ApiError.notFound("Vídeo não encontrado");
  if (video.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");
  if (video.status === "archived") {
    throw ApiError.conflict("Vídeos arquivados não podem ser associados");
  }

  const existing = unwrapMaybe(
    await supabase
      .from("plan_day_videos")
      .select("id")
      .eq("plan_day_id", dayId)
      .eq("video_id", videoId)
      .maybeSingle(),
  );
  if (existing) throw ApiError.conflict("Este vídeo já está associado ao dia do plano");

  let order = sortOrder;
  if (order === undefined) {
    const last = await supabase
      .from("plan_day_videos")
      .select("sort_order")
      .eq("plan_day_id", dayId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    order = (last.data?.sort_order ?? 0) + 1;
  }

  unwrapVoid(
    await supabase.from("plan_day_videos").insert({
      plan_day_id: dayId,
      video_id: videoId,
      sort_order: order,
    }),
  );

  return dayWithVideos(day);
}

export async function removeVideoFromPlanDay(
  associationId: string,
  teacherId: string,
): Promise<void> {
  const supabase = await createClient();
  const association = unwrapMaybe(
    await supabase
      .from("plan_day_videos")
      .select("*")
      .eq("id", associationId)
      .maybeSingle(),
  );
  if (!association) throw ApiError.notFound("Associação não encontrada");

  const day = unwrapMaybe(
    await supabase
      .from("plan_days")
      .select("*")
      .eq("id", association.plan_day_id)
      .maybeSingle(),
  );
  if (!day) throw ApiError.notFound("Dia do plano não encontrado");
  await ownedPlan(day.monthly_plan_id, teacherId);

  unwrapVoid(
    await supabase.from("plan_day_videos").delete().eq("id", associationId),
  );

  const remaining = await supabase
    .from("plan_day_videos")
    .select("id")
    .eq("plan_day_id", association.plan_day_id)
    .order("sort_order", { ascending: true });

  if (remaining.error) throw mapPostgrestError(remaining.error);

  await Promise.all(
    (remaining.data ?? []).map(async (item, index) => {
      unwrapVoid(
        await supabase
          .from("plan_day_videos")
          .update({ sort_order: index + 1 })
          .eq("id", item.id),
      );
    }),
  );
}

export async function reorderPlanDayVideos(
  teacherId: string,
  items: Array<{ id: string; sort_order: number }>,
): Promise<void> {
  const supabase = await createClient();
  const planDayIds = new Set<string>();

  for (const item of items) {
    const association = unwrapMaybe(
      await supabase
        .from("plan_day_videos")
        .select("*")
        .eq("id", item.id)
        .maybeSingle(),
    );
    if (!association) throw ApiError.notFound("Associação não encontrada");

    const day = unwrapMaybe(
      await supabase
        .from("plan_days")
        .select("*")
        .eq("id", association.plan_day_id)
        .maybeSingle(),
    );
    if (!day) throw ApiError.notFound("Dia do plano não encontrado");
    await ownedPlan(day.monthly_plan_id, teacherId);
    planDayIds.add(association.plan_day_id);
  }

  if (planDayIds.size > 1) {
    throw ApiError.validation("Todos os vídeos devem pertencer ao mesmo dia do plano");
  }

  await Promise.all(
    items.map(async (item) => {
      unwrapVoid(
        await supabase
          .from("plan_day_videos")
          .update({ sort_order: item.sort_order })
          .eq("id", item.id),
      );
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Publicação para alunos                                                      */
/* -------------------------------------------------------------------------- */

export async function grantPlanAccess(
  planId: string,
  teacherId: string,
  enrollmentId: string,
): Promise<PlanEnrollmentInfo> {
  const plan = await ownedPlan(planId, teacherId);
  if (plan.status !== "published") {
    throw ApiError.validation("Publique o plano antes de liberá-lo para alunos");
  }

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

  const existing = unwrapMaybe(
    await supabase
      .from("plan_enrollments")
      .select("id")
      .eq("monthly_plan_id", planId)
      .eq("enrollment_id", enrollmentId)
      .maybeSingle(),
  );
  if (existing) throw ApiError.conflict("Este aluno já tem acesso ao plano");

  const { data: association, error } = await supabase
    .from("plan_enrollments")
    .insert({
      monthly_plan_id: planId,
      enrollment_id: enrollmentId,
    })
    .select("*")
    .single();

  if (error) throw mapPostgrestError(error);

  return {
    ...association,
    student_name: enrollment.student_name,
    student_email: enrollment.student_email,
    status: enrollment.status,
  };
}

export async function getPlanEnrollments(
  planId: string,
  teacherId: string,
): Promise<PlanEnrollmentInfo[]> {
  await ownedPlan(planId, teacherId);
  return loadPlanEnrollments(planId);
}

export async function revokePlanAccess(
  associationId: string,
  teacherId: string,
): Promise<void> {
  const supabase = await createClient();
  const association = unwrapMaybe(
    await supabase
      .from("plan_enrollments")
      .select("*")
      .eq("id", associationId)
      .maybeSingle(),
  );
  if (!association) throw ApiError.notFound("Associação não encontrada");
  await ownedPlan(association.monthly_plan_id, teacherId);

  unwrapVoid(await supabase.from("plan_enrollments").delete().eq("id", associationId));
}

/* -------------------------------------------------------------------------- */
/* Visão do aluno                                                              */
/* -------------------------------------------------------------------------- */

export async function getStudentPlans(
  studentId: string,
  enrollmentId?: string,
): Promise<StudentPlan[]> {
  const supabase = await createClient();

  const { data: enrollments, error: enrollmentError } = await supabase
    .from("student_enrollments")
    .select("*")
    .eq("student_profile_id", studentId)
    .eq("status", "active");

  if (enrollmentError) throw mapPostgrestError(enrollmentError);

  const activeEnrollments = (enrollments ?? []).filter(
    (item) => !enrollmentId || item.id === enrollmentId,
  );
  if (activeEnrollments.length === 0) return [];

  const enrollmentIds = activeEnrollments.map((item) => item.id);
  const { data: associations, error: associationError } = await supabase
    .from("plan_enrollments")
    .select("*")
    .in("enrollment_id", enrollmentIds);

  if (associationError) throw mapPostgrestError(associationError);
  const rows = associations ?? [];
  if (rows.length === 0) return [];

  const planIds = Array.from(new Set(rows.map((item) => item.monthly_plan_id)));
  const { data: plans, error: planError } = await supabase
    .from("monthly_plans")
    .select("*")
    .in("id", planIds)
    .eq("status", "published")
    .order("period_start", { ascending: false });

  if (planError) throw mapPostgrestError(planError);
  const publishedPlans = plans ?? [];
  if (publishedPlans.length === 0) return [];

  const { data: days, error: dayError } = await supabase
    .from("plan_days")
    .select("*")
    .in("monthly_plan_id", publishedPlans.map((plan) => plan.id))
    .order("sort_order", { ascending: true });

  if (dayError) throw mapPostgrestError(dayError);
  const allDays = days ?? [];
  const videosByDay = await loadVideosByDay(allDays.map((day) => day.id));

  const teacherIds = Array.from(new Set(publishedPlans.map((plan) => plan.teacher_id)));
  const { data: teachers, error: teacherError } = await supabase
    .from("teachers")
    .select("id, display_name")
    .in("id", teacherIds);

  if (teacherError) throw mapPostgrestError(teacherError);
  const teacherNames = new Map(
    (teachers ?? []).map((teacher) => [teacher.id, teacher.display_name]),
  );

  return publishedPlans.map((plan) => {
    const association = rows.find(
      (item) =>
        item.monthly_plan_id === plan.id && enrollmentIds.includes(item.enrollment_id),
    );
    const planDays = allDays
      .filter((day) => day.monthly_plan_id === plan.id)
      .map((day) => {
        const videos = videosByDay.get(day.id) ?? [];
        return { ...day, videos, video_count: videos.length };
      });

    return {
      ...plan,
      teacher_name: teacherNames.get(plan.teacher_id) ?? "Professor",
      enrollment_id: association?.enrollment_id ?? "",
      days: planDays,
    };
  });
}

export async function getStudentPlanDays(
  studentId: string,
  planId: string,
): Promise<PlanDayWithVideos[]> {
  const plans = await getStudentPlans(studentId);
  const plan = plans.find((item) => item.id === planId);
  if (!plan) throw ApiError.forbidden("Acesso negado");
  return plan.days;
}

export type { CreatePlanData, CreatePlanDayData, Video };
