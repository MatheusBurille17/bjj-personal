import type { ProfileResponse, TeacherProfile } from "@/types/auth";
import { getDb, mutate, nowIso } from "@/lib/db/store";
import { getUserRoles } from "@/lib/auth/session";
import { ApiError } from "@/lib/middleware/errors";
import {
  MAX_AVATAR_BYTES,
  isValidImageSize,
  isValidImageType,
} from "@/lib/utils/validation";

/** Retorna o perfil e, quando aplicável, a configuração de professor. */
export function getProfileView(userId: string): ProfileResponse {
  const db = getDb();
  const profile = db.profiles.find((item) => item.id === userId);
  if (!profile) throw new ApiError(404, "NOT_FOUND", "Perfil não encontrado");

  const teacher = db.teachers.find((item) => item.id === userId) ?? null;
  return {
    profile,
    ...(teacher ? { teacher } : {}),
    roles: getUserRoles(userId),
  };
}

export function getTeacherProfile(userId: string): TeacherProfile | null {
  return getDb().teachers.find((item) => item.id === userId) ?? null;
}

/**
 * Perfil público do professor: somente dados de exibição.
 * Nunca inclui fuso horário, notas ou configurações internas (Req. 12.2/12.5).
 */
export function getTeacherPublicProfile(
  teacherId: string,
  requesterId: string,
): { id: string; display_name: string; avatar_url: string | null; bio: string | null } {
  const db = getDb();
  const teacher = db.teachers.find((item) => item.id === teacherId);
  if (!teacher) throw new ApiError(404, "NOT_FOUND", "Professor não encontrado");

  const isSelf = teacherId === requesterId;
  const isEnrolledStudent = db.enrollments.some(
    (enrollment) =>
      enrollment.teacher_id === teacherId &&
      enrollment.student_profile_id === requesterId &&
      enrollment.status === "active",
  );

  if (!isSelf && !isEnrolledStudent) {
    throw new ApiError(403, "FORBIDDEN", "Acesso negado");
  }

  const profile = db.profiles.find((item) => item.id === teacherId);
  return {
    id: teacher.id,
    display_name: teacher.display_name,
    avatar_url: profile?.avatar_url ?? null,
    bio: teacher.bio,
  };
}

/**
 * Processa o upload de avatar no modo local, convertendo a imagem em data URL.
 * A interface de armazenamento é equivalente ao bucket `avatars` do Supabase.
 */
export async function uploadAvatar(userId: string, file: File): Promise<{ avatar_url: string }> {
  if (!isValidImageType(file.type)) {
    throw ApiError.validation("Formato inválido. Envie JPEG, PNG ou WebP.");
  }
  if (!isValidImageSize(file.size)) {
    throw ApiError.validation(`A imagem deve ter no máximo ${MAX_AVATAR_BYTES / (1024 * 1024)}MB.`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type};base64,${buffer.toString("base64")}`;

  mutate((db) => {
    const profile = db.profiles.find((item) => item.id === userId);
    if (!profile) throw new ApiError(404, "NOT_FOUND", "Perfil não encontrado");
    profile.avatar_url = dataUrl;
    profile.updated_at = nowIso();
  });

  return { avatar_url: dataUrl };
}

export function removeAvatar(userId: string): ProfileResponse {
  mutate((db) => {
    const profile = db.profiles.find((item) => item.id === userId);
    if (profile) {
      profile.avatar_url = null;
      profile.updated_at = nowIso();
    }
  });
  return getProfileView(userId);
}
