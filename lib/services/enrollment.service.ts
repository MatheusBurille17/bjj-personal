import type {
  Enrollment,
  EnrollmentDetail,
  EnrollmentListItem,
  EnrollmentListResponse,
  InviteResendResult,
  NextLessonInfo,
} from "@/types/enrollment";
import type { EnrollmentStatus } from "@/types/enrollment";
import { ApiError, buildPagination } from "@/lib/middleware/errors";
import type {
  CreateEnrollmentInput,
  SearchEnrollmentsInput,
  UpdateEnrollmentInput,
} from "@/lib/validation/enrollment";
import { validateStatusTransition } from "@/lib/validation/enrollment";
import { createClient } from "@/lib/supabase/server";
import { mapPostgrestError, unwrapMaybe, unwrapVoid } from "@/lib/supabase/errors";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import {
  buildInviteUrl,
  generateInviteToken,
  inviteExpiration,
  sendInvitationEmail,
} from "./invitation.service";

type Client = SupabaseClient<Database>;

interface LessonAggregate {
  enrollment_id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  id: string;
  title_snapshot: string | null;
}

async function loadLessonAggregates(
  supabase: Client,
  enrollmentIds: string[],
): Promise<Map<string, LessonAggregate[]>> {
  const grouped = new Map<string, LessonAggregate[]>();
  if (enrollmentIds.length === 0) return grouped;

  const { data, error } = await supabase
    .from("lessons")
    .select("id, enrollment_id, status, starts_at, ends_at, title_snapshot")
    .in("enrollment_id", enrollmentIds);

  if (error) throw mapPostgrestError(error);

  for (const lesson of data ?? []) {
    const list = grouped.get(lesson.enrollment_id) ?? [];
    list.push(lesson);
    grouped.set(lesson.enrollment_id, list);
  }
  return grouped;
}

function nextScheduledLesson(lessons: LessonAggregate[] | undefined): NextLessonInfo | null {
  const now = Date.now();
  const lesson = (lessons ?? [])
    .filter(
      (item) => item.status === "scheduled" && new Date(item.starts_at).getTime() >= now,
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];

  if (!lesson) return null;
  return {
    id: lesson.id,
    starts_at: lesson.starts_at,
    ends_at: lesson.ends_at,
    status: lesson.status,
    title: lesson.title_snapshot,
  };
}

function completedCount(lessons: LessonAggregate[] | undefined): number {
  return (lessons ?? []).filter((item) => item.status === "completed").length;
}

export function toEnrollmentListItem(
  enrollment: Enrollment,
  lessons?: LessonAggregate[],
): EnrollmentListItem {
  return {
    id: enrollment.id,
    student_name: enrollment.student_name,
    student_email: enrollment.student_email,
    student_phone: enrollment.student_phone,
    status: enrollment.status,
    started_at: enrollment.started_at,
    archived_at: enrollment.archived_at,
    invite_expires_at: enrollment.invite_expires_at,
    next_lesson: nextScheduledLesson(lessons),
    completed_lessons_count: completedCount(lessons),
  };
}

/** Busca um vínculo garantindo que pertence ao professor autenticado. */
export async function getOwnedEnrollment(
  enrollmentId: string,
  teacherId: string,
): Promise<Enrollment> {
  const supabase = await createClient();
  const enrollment = unwrapMaybe(
    await supabase
      .from("teacher_enrollments")
      .select("*")
      .eq("id", enrollmentId)
      .maybeSingle(),
  );

  if (!enrollment) throw ApiError.notFound("Aluno não encontrado");
  if (enrollment.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");
  return enrollment;
}

/**
 * Cria um vínculo pendente, gera token de convite e envia o e-mail.
 */
export async function createEnrollment(
  teacherId: string,
  data: CreateEnrollmentInput,
): Promise<{ enrollment: Enrollment; invite_url: string }> {
  const supabase = await createClient();
  const email = data.student_email.toLowerCase();

  const { data: duplicate, error: duplicateError } = await supabase
    .from("enrollments")
    .select("id")
    .eq("teacher_id", teacherId)
    .ilike("student_email", email)
    .in("status", ["active", "pending"])
    .limit(1)
    .maybeSingle();

  if (duplicateError) throw mapPostgrestError(duplicateError);
  if (duplicate) {
    throw new ApiError(
      409,
      "CONFLICT",
      "Já existe um vínculo ativo ou pendente para este e-mail",
    );
  }

  const token = generateInviteToken();
  const inserted = await supabase
    .from("enrollments")
    .insert({
      teacher_id: teacherId,
      student_profile_id: null,
      student_name: data.student_name,
      student_email: email,
      student_phone: data.student_phone ?? null,
      status: "pending",
      started_at: data.started_at ?? new Date().toISOString(),
      archived_at: null,
      private_notes: data.private_notes ?? null,
      invite_token: token,
      invite_expires_at: inviteExpiration(),
    })
    .select("id")
    .single();

  if (inserted.error) throw mapPostgrestError(inserted.error);

  const enrollment = await getOwnedEnrollment(inserted.data.id, teacherId);
  await sendInvitationEmail(enrollment, token);
  return { enrollment, invite_url: buildInviteUrl(token) };
}

/** Lista vínculos com busca, filtros e paginação. */
export async function getEnrollments(
  teacherId: string,
  options: SearchEnrollmentsInput,
): Promise<EnrollmentListResponse> {
  const supabase = await createClient();
  const statuses: EnrollmentStatus[] =
    options.status.length > 0
      ? options.status
      : (["active", "paused"] as EnrollmentStatus[]);

  const page = Math.max(1, options.page);
  const pageSize = Math.min(Math.max(1, options.pageSize), 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("teacher_enrollments")
    .select("*", { count: "exact" })
    .order("student_name", { ascending: true })
    .range(from, to);

  if (!options.status.includes("archived")) {
    query = query.neq("status", "archived");
  }
  query = query.in("status", statuses);

  const search = options.search.trim();
  if (search) {
    query = query.ilike("student_name", `%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) throw mapPostgrestError(error);

  const enrollments = (data ?? []) as Enrollment[];
  const aggregates = await loadLessonAggregates(
    supabase,
    enrollments.map((item) => item.id),
  );

  return {
    enrollments: enrollments.map((item) =>
      toEnrollmentListItem(item, aggregates.get(item.id)),
    ),
    pagination: buildPagination(count ?? 0, page, pageSize),
  };
}

/** Detalhe do vínculo com estatísticas. */
export async function getEnrollmentDetail(
  enrollmentId: string,
  teacherId: string,
): Promise<EnrollmentDetail> {
  const enrollment = await getOwnedEnrollment(enrollmentId, teacherId);
  const supabase = await createClient();
  const aggregates = await loadLessonAggregates(supabase, [enrollmentId]);
  const lessons = aggregates.get(enrollmentId) ?? [];

  const durationDays = Math.max(
    0,
    Math.floor(
      (Date.now() - new Date(enrollment.started_at).getTime()) / (24 * 60 * 60 * 1000),
    ),
  );

  return {
    ...toEnrollmentListItem(enrollment, lessons),
    private_notes: enrollment.private_notes,
    lessons_count: lessons.length,
    completed_lessons_count: lessons.filter((item) => item.status === "completed").length,
    scheduled_lessons_count: lessons.filter((item) => item.status === "scheduled").length,
    duration_days: durationDays,
  };
}

/** Atualiza dados cadastrais, sem alterar status. */
export async function updateEnrollment(
  enrollmentId: string,
  teacherId: string,
  data: UpdateEnrollmentInput,
): Promise<Enrollment> {
  const current = await getOwnedEnrollment(enrollmentId, teacherId);
  const supabase = await createClient();
  const email = data.student_email?.toLowerCase();

  if (email && email !== current.student_email.toLowerCase()) {
    const { data: duplicate, error } = await supabase
      .from("enrollments")
      .select("id")
      .neq("id", enrollmentId)
      .eq("teacher_id", teacherId)
      .ilike("student_email", email)
      .in("status", ["active", "pending"])
      .limit(1)
      .maybeSingle();

    if (error) throw mapPostgrestError(error);
    if (duplicate) {
      throw new ApiError(
        409,
        "CONFLICT",
        "Já existe um vínculo ativo ou pendente para este e-mail",
      );
    }
  }

  const payload: {
    student_name?: string;
    student_email?: string;
    student_phone?: string | null;
    private_notes?: string | null;
  } = {};
  if (data.student_name !== undefined) payload.student_name = data.student_name;
  if (email !== undefined) payload.student_email = email;
  if (data.student_phone !== undefined) payload.student_phone = data.student_phone;
  if (data.private_notes !== undefined) payload.private_notes = data.private_notes;

  unwrapVoid(
    await supabase.from("enrollments").update(payload).eq("id", enrollmentId),
  );

  return getOwnedEnrollment(enrollmentId, teacherId);
}

async function changeStatus(
  enrollmentId: string,
  teacherId: string,
  target: EnrollmentStatus,
  extra?: { archived_at?: string | null },
): Promise<Enrollment> {
  const enrollment = await getOwnedEnrollment(enrollmentId, teacherId);
  const transition = validateStatusTransition(enrollment.status, target);
  if (!transition.valid) {
    throw new ApiError(409, "CONFLICT", transition.message);
  }

  const supabase = await createClient();
  unwrapVoid(
    await supabase
      .from("enrollments")
      .update({ status: target, ...extra })
      .eq("id", enrollmentId),
  );

  return getOwnedEnrollment(enrollmentId, teacherId);
}

export async function pauseEnrollment(
  enrollmentId: string,
  teacherId: string,
): Promise<Enrollment> {
  const enrollment = await getOwnedEnrollment(enrollmentId, teacherId);
  if (enrollment.status !== "active") {
    throw new ApiError(409, "CONFLICT", "Apenas vínculos ativos podem ser pausados");
  }
  return changeStatus(enrollmentId, teacherId, "paused");
}

export async function reactivateEnrollment(
  enrollmentId: string,
  teacherId: string,
): Promise<Enrollment> {
  const enrollment = await getOwnedEnrollment(enrollmentId, teacherId);
  if (enrollment.status !== "paused") {
    throw new ApiError(409, "CONFLICT", "Apenas vínculos pausados podem ser reativados");
  }
  return changeStatus(enrollmentId, teacherId, "active");
}

export async function archiveEnrollment(
  enrollmentId: string,
  teacherId: string,
): Promise<Enrollment> {
  const enrollment = await getOwnedEnrollment(enrollmentId, teacherId);
  if (enrollment.status === "archived") {
    throw new ApiError(409, "CONFLICT", "Este vínculo já está arquivado");
  }
  return changeStatus(enrollmentId, teacherId, "archived", {
    archived_at: new Date().toISOString(),
  });
}

/** Verifica se o vínculo pode ser excluído. */
export async function canDeleteEnrollment(enrollmentId: string): Promise<boolean> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("lessons")
    .select("id", { count: "exact", head: true })
    .eq("enrollment_id", enrollmentId);

  if (error) throw mapPostgrestError(error);
  return (count ?? 0) === 0;
}

export async function deleteEnrollment(
  enrollmentId: string,
  teacherId: string,
): Promise<void> {
  await getOwnedEnrollment(enrollmentId, teacherId);
  if (!(await canDeleteEnrollment(enrollmentId))) {
    throw new ApiError(
      409,
      "CONFLICT",
      "Este aluno possui histórico de aulas e não pode ser excluído. Arquive o vínculo para preservar o histórico.",
    );
  }

  const supabase = await createClient();
  unwrapVoid(await supabase.from("enrollments").delete().eq("id", enrollmentId));
}

/** Reenvia o convite, invalidando o token anterior. */
export async function resendInvitation(
  enrollmentId: string,
  teacherId: string,
): Promise<InviteResendResult> {
  const enrollment = await getOwnedEnrollment(enrollmentId, teacherId);
  if (enrollment.status !== "pending") {
    throw new ApiError(409, "CONFLICT", "Somente convites pendentes podem ser reenviados");
  }

  const token = generateInviteToken();
  const expiresAt = inviteExpiration();
  const supabase = await createClient();
  unwrapVoid(
    await supabase
      .from("enrollments")
      .update({ invite_token: token, invite_expires_at: expiresAt })
      .eq("id", enrollmentId),
  );

  const updated = await getOwnedEnrollment(enrollmentId, teacherId);
  await sendInvitationEmail(updated, token);

  return {
    enrollment_id: enrollmentId,
    invite_token: token,
    invite_expires_at: expiresAt,
    invite_url: buildInviteUrl(token),
  };
}

/** Retorna todos os vínculos ativos de um aluno (visão do portal). */
export async function getStudentEnrollments(studentId: string): Promise<Enrollment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_enrollments")
    .select("*")
    .eq("student_profile_id", studentId)
    .neq("status", "archived")
    .order("started_at", { ascending: true });

  if (error) throw mapPostgrestError(error);

  return (data ?? []).map((row) => ({ ...row, private_notes: null })) as Enrollment[];
}
