import { randomUUID } from "node:crypto";
import type {
  Enrollment,
  EnrollmentDetail,
  EnrollmentListItem,
  EnrollmentListResponse,
  InviteResendResult,
  NextLessonInfo,
} from "@/types/enrollment";
import type { EnrollmentStatus } from "@/types/enrollment";
import { getDb, mutate, nowIso } from "@/lib/db/store";
import { ApiError, buildPagination, paginate } from "@/lib/middleware/errors";
import type {
  CreateEnrollmentInput,
  SearchEnrollmentsInput,
  UpdateEnrollmentInput,
} from "@/lib/validation/enrollment";
import { validateStatusTransition } from "@/lib/validation/enrollment";
import {
  buildInviteUrl,
  generateInviteToken,
  inviteExpiration,
  sendInvitationEmail,
} from "./invitation.service";

function nextScheduledLesson(enrollmentId: string): NextLessonInfo | null {
  const db = getDb();
  const now = Date.now();
  const lesson = db.lessons
    .filter(
      (item) =>
        item.enrollment_id === enrollmentId &&
        item.status === "scheduled" &&
        new Date(item.starts_at).getTime() >= now,
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

function completedCount(enrollmentId: string): number {
  return getDb().lessons.filter(
    (item) => item.enrollment_id === enrollmentId && item.status === "completed",
  ).length;
}

export function toEnrollmentListItem(enrollment: Enrollment): EnrollmentListItem {
  return {
    id: enrollment.id,
    student_name: enrollment.student_name,
    student_email: enrollment.student_email,
    student_phone: enrollment.student_phone,
    status: enrollment.status,
    started_at: enrollment.started_at,
    archived_at: enrollment.archived_at,
    invite_expires_at: enrollment.invite_expires_at,
    next_lesson: nextScheduledLesson(enrollment.id),
    completed_lessons_count: completedCount(enrollment.id),
  };
}

/** Busca um vínculo garantindo que pertence ao professor autenticado. */
export function getOwnedEnrollment(enrollmentId: string, teacherId: string): Enrollment {
  const enrollment = getDb().enrollments.find((item) => item.id === enrollmentId);
  if (!enrollment) throw ApiError.notFound("Aluno não encontrado");
  if (enrollment.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");
  return enrollment;
}

/**
 * Cria um vínculo pendente, gera token de convite e envia o e-mail.
 * Requisitos 1.1-1.9, 13.1-13.7.
 */
export async function createEnrollment(
  teacherId: string,
  data: CreateEnrollmentInput,
): Promise<{ enrollment: Enrollment; invite_url: string }> {
  const db = getDb();
  const email = data.student_email.toLowerCase();
  const duplicate = db.enrollments.some(
    (item) =>
      item.teacher_id === teacherId &&
      item.student_email.toLowerCase() === email &&
      (item.status === "active" || item.status === "pending"),
  );

  if (duplicate) {
    throw new ApiError(
      409,
      "CONFLICT",
      "Já existe um vínculo ativo ou pendente para este e-mail",
    );
  }

  const token = generateInviteToken();
  const timestamp = nowIso();
  const enrollment: Enrollment = {
    id: randomUUID(),
    teacher_id: teacherId,
    student_profile_id: null,
    student_name: data.student_name,
    student_email: email,
    student_phone: data.student_phone ?? null,
    status: "pending",
    started_at: data.started_at ?? timestamp,
    archived_at: null,
    private_notes: data.private_notes ?? null,
    invite_token: token,
    invite_expires_at: inviteExpiration(),
    created_at: timestamp,
    updated_at: timestamp,
  };

  mutate((database) => {
    database.enrollments.push(enrollment);
  });

  await sendInvitationEmail(enrollment, token);
  return { enrollment, invite_url: buildInviteUrl(token) };
}

/** Lista vínculos com busca, filtros e paginação (Requisitos 2-4, 20). */
export function getEnrollments(
  teacherId: string,
  options: SearchEnrollmentsInput,
): EnrollmentListResponse {
  const db = getDb();
  const statuses =
    options.status.length > 0
      ? options.status
      : (["active", "paused"] as EnrollmentStatus[]);

  const search = options.search.trim().toLowerCase();
  let items = db.enrollments.filter((item) => item.teacher_id === teacherId);

  if (!options.status.includes("archived")) {
    items = items.filter((item) => item.status !== "archived");
  }
  items = items.filter((item) => statuses.includes(item.status));

  if (search) {
    items = items.filter((item) => item.student_name.toLowerCase().includes(search));
  }

  items = items.sort((a, b) => a.student_name.localeCompare(b.student_name, "pt-BR"));

  const filtered = items.map(toEnrollmentListItem);
  const paginated = paginate(filtered, options.page, options.pageSize);

  return {
    enrollments: paginated,
    pagination: buildPagination(filtered.length, options.page, options.pageSize),
  };
}

/** Detalhe do vínculo com estatísticas (Requisito 5). */
export function getEnrollmentDetail(
  enrollmentId: string,
  teacherId: string,
): EnrollmentDetail {
  const enrollment = getOwnedEnrollment(enrollmentId, teacherId);
  const lessons = getDb().lessons.filter((item) => item.enrollment_id === enrollmentId);
  const scheduled = lessons.filter((item) => item.status === "scheduled").length;
  const completed = lessons.filter((item) => item.status === "completed").length;
  const durationDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(enrollment.started_at).getTime()) / (24 * 60 * 60 * 1000)),
  );

  return {
    ...toEnrollmentListItem(enrollment),
    private_notes: enrollment.private_notes,
    lessons_count: lessons.length,
    completed_lessons_count: completed,
    scheduled_lessons_count: scheduled,
    duration_days: durationDays,
  };
}

/** Atualiza dados cadastrais, sem alterar status (Requisito 6). */
export function updateEnrollment(
  enrollmentId: string,
  teacherId: string,
  data: UpdateEnrollmentInput,
): Enrollment {
  const current = getOwnedEnrollment(enrollmentId, teacherId);
  const email = data.student_email?.toLowerCase();

  if (email && email !== current.student_email.toLowerCase()) {
    const duplicate = getDb().enrollments.some(
      (item) =>
        item.id !== enrollmentId &&
        item.teacher_id === teacherId &&
        item.student_email.toLowerCase() === email &&
        (item.status === "active" || item.status === "pending"),
    );
    if (duplicate) {
      throw new ApiError(409, "CONFLICT", "Já existe um vínculo ativo ou pendente para este e-mail");
    }
  }

  return mutate((db) => {
    const enrollment = db.enrollments.find((item) => item.id === enrollmentId);
    if (!enrollment) throw ApiError.notFound("Aluno não encontrado");

    if (data.student_name !== undefined) enrollment.student_name = data.student_name;
    if (email !== undefined) enrollment.student_email = email;
    if (data.student_phone !== undefined) enrollment.student_phone = data.student_phone;
    if (data.private_notes !== undefined) enrollment.private_notes = data.private_notes;
    enrollment.updated_at = nowIso();
    return { ...enrollment };
  });
}

function changeStatus(
  enrollmentId: string,
  teacherId: string,
  target: EnrollmentStatus,
  extra?: (enrollment: Enrollment) => void,
): Enrollment {
  const enrollment = getOwnedEnrollment(enrollmentId, teacherId);
  const transition = validateStatusTransition(enrollment.status, target);
  if (!transition.valid) {
    throw new ApiError(409, "CONFLICT", transition.message);
  }

  return mutate((db) => {
    const record = db.enrollments.find((item) => item.id === enrollmentId);
    if (!record) throw ApiError.notFound("Aluno não encontrado");
    record.status = target;
    record.updated_at = nowIso();
    extra?.(record);
    return { ...record };
  });
}

export function pauseEnrollment(enrollmentId: string, teacherId: string): Enrollment {
  const enrollment = getOwnedEnrollment(enrollmentId, teacherId);
  if (enrollment.status !== "active") {
    throw new ApiError(409, "CONFLICT", "Apenas vínculos ativos podem ser pausados");
  }
  return changeStatus(enrollmentId, teacherId, "paused");
}

export function reactivateEnrollment(enrollmentId: string, teacherId: string): Enrollment {
  const enrollment = getOwnedEnrollment(enrollmentId, teacherId);
  if (enrollment.status !== "paused") {
    throw new ApiError(409, "CONFLICT", "Apenas vínculos pausados podem ser reativados");
  }
  return changeStatus(enrollmentId, teacherId, "active");
}

export function archiveEnrollment(enrollmentId: string, teacherId: string): Enrollment {
  const enrollment = getOwnedEnrollment(enrollmentId, teacherId);
  if (enrollment.status === "archived") {
    throw new ApiError(409, "CONFLICT", "Este vínculo já está arquivado");
  }
  return changeStatus(enrollmentId, teacherId, "archived", (record) => {
    record.archived_at = nowIso();
  });
}

/** Verifica se o vínculo pode ser excluído (Requisito 10). */
export function canDeleteEnrollment(enrollmentId: string): boolean {
  return !getDb().lessons.some((lesson) => lesson.enrollment_id === enrollmentId);
}

export function deleteEnrollment(enrollmentId: string, teacherId: string): void {
  getOwnedEnrollment(enrollmentId, teacherId);
  if (!canDeleteEnrollment(enrollmentId)) {
    throw new ApiError(
      409,
      "CONFLICT",
      "Este aluno possui histórico de aulas e não pode ser excluído. Arquive o vínculo para preservar o histórico.",
    );
  }
  mutate((db) => {
    db.enrollments = db.enrollments.filter((item) => item.id !== enrollmentId);
    db.plan_enrollments = db.plan_enrollments.filter((item) => item.enrollment_id !== enrollmentId);
    db.student_technique_access = db.student_technique_access.filter(
      (item) => item.enrollment_id !== enrollmentId,
    );
    db.weekly_slots = db.weekly_slots.filter((item) => item.enrollment_id !== enrollmentId);
  });
}

/** Reenvia o convite, invalidando o token anterior (Requisito 11). */
export async function resendInvitation(
  enrollmentId: string,
  teacherId: string,
): Promise<InviteResendResult> {
  const enrollment = getOwnedEnrollment(enrollmentId, teacherId);
  if (enrollment.status !== "pending") {
    throw new ApiError(409, "CONFLICT", "Somente convites pendentes podem ser reenviados");
  }

  const token = generateInviteToken();
  const expiresAt = inviteExpiration();
  const updated = mutate((db) => {
    const record = db.enrollments.find((item) => item.id === enrollmentId);
    if (!record) throw ApiError.notFound("Aluno não encontrado");
    record.invite_token = token;
    record.invite_expires_at = expiresAt;
    record.updated_at = nowIso();
    return { ...record };
  });

  await sendInvitationEmail(updated, token);
  return {
    enrollment_id: enrollmentId,
    invite_token: token,
    invite_expires_at: expiresAt,
    invite_url: buildInviteUrl(token),
  };
}

/** Retorna todos os vínculos ativos de um aluno (visão do portal). */
export function getStudentEnrollments(studentId: string): Enrollment[] {
  return getDb()
    .enrollments.filter(
      (item) => item.student_profile_id === studentId && item.status !== "archived",
    )
    .sort((a, b) => a.started_at.localeCompare(b.started_at));
}
