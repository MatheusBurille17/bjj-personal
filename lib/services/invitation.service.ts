import { randomBytes, randomUUID } from "node:crypto";
import type { AuthResult, InviteTokenData } from "@/types/auth";
import type { Enrollment } from "@/types/enrollment";
import { getDb, mutate, nowIso } from "@/lib/db/store";
import { hashPassword } from "@/lib/auth/password";
import { buildAuthResult } from "@/lib/auth/session";
import { ApiError } from "@/lib/middleware/errors";
import { sendEmail } from "@/lib/resend/send";
import { invitationEmail } from "@/lib/resend/templates";

const INVITE_TTL_DAYS = 7;

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/** Gera um token URL-safe de 64 caracteres com 256 bits de entropia. */
export function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export function inviteExpiration(): string {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function buildInviteUrl(token: string): string {
  return `${appUrl()}/invite/${token}`;
}

/** Envia o e-mail de convite. Falhas não interrompem a criação do vínculo. */
export async function sendInvitationEmail(enrollment: Enrollment, token: string): Promise<void> {
  const db = getDb();
  const teacher = db.teachers.find((item) => item.id === enrollment.teacher_id);
  const template = invitationEmail({
    teacherName: teacher?.display_name ?? "Seu professor",
    studentName: enrollment.student_name,
    inviteUrl: buildInviteUrl(token),
    expiresAt: enrollment.invite_expires_at ?? inviteExpiration(),
  });

  await sendEmail({
    to: enrollment.student_email,
    subject: template.subject,
    html: template.html,
    kind: "invite",
    payload: {
      enrollment_id: enrollment.id,
      invite_token: token,
      invite_url: buildInviteUrl(token),
    },
  });
}

/** Valida um token de convite e retorna os dados necessários para a tela. */
export function verifyInviteToken(token: string): InviteTokenData {
  const db = getDb();
  const enrollment = db.enrollments.find(
    (item) => item.invite_token === token && item.status === "pending",
  );

  if (!enrollment || !enrollment.invite_expires_at) {
    throw new ApiError(404, "NOT_FOUND", "Convite inválido ou já utilizado");
  }
  if (new Date(enrollment.invite_expires_at).getTime() <= Date.now()) {
    throw new ApiError(404, "NOT_FOUND", "Convite expirado. Solicite um novo convite ao professor.");
  }

  const teacher = db.teachers.find((item) => item.id === enrollment.teacher_id);
  return {
    valid: true,
    teacher_id: enrollment.teacher_id,
    teacher_name: teacher?.display_name ?? "Professor",
    student_email: enrollment.student_email,
    student_name: enrollment.student_name,
    enrollment_id: enrollment.id,
    expires_at: enrollment.invite_expires_at,
  };
}

/**
 * Cria a conta do aluno a partir do convite (ou vincula uma conta existente)
 * e ativa o vínculo (Requisitos 7.5, 7.6, 12.2-12.4).
 */
export async function createStudentAccount(
  token: string,
  password: string,
  fullName: string,
): Promise<AuthResult> {
  const invite = verifyInviteToken(token);
  const db = getDb();
  const timestamp = nowIso();
  let studentId = db.users.find(
    (user) => user.email.toLowerCase() === invite.student_email.toLowerCase(),
  )?.id;

  if (!studentId) {
    studentId = randomUUID();
    const passwordHash = hashPassword(password);
    mutate((database) => {
      database.users.push({
        id: studentId as string,
        email: invite.student_email.toLowerCase(),
        password_hash: passwordHash,
        email_confirmed_at: null,
        created_at: timestamp,
        updated_at: timestamp,
      });
      database.profiles.push({
        id: studentId as string,
        full_name: fullName,
        email: invite.student_email.toLowerCase(),
        avatar_url: null,
        created_at: timestamp,
        updated_at: timestamp,
      });
    });
  } else {
    mutate((database) => {
      const location = database.profiles.find((item) => item.id === studentId);
      if (location && fullName.trim().length >= 2) {
        location.full_name = fullName.trim();
        location.updated_at = timestamp;
      }
    });
  }

  mutate((database) => {
    const enrollment = database.enrollments.find((item) => item.id === invite.enrollment_id);
    if (!enrollment) throw new ApiError(404, "NOT_FOUND", "Convite não encontrado");
    enrollment.status = "active";
    enrollment.student_profile_id = studentId as string;
    enrollment.invite_token = null;
    enrollment.invite_expires_at = null;
    enrollment.updated_at = timestamp;
  });

  return buildAuthResult(studentId, "student");
}
