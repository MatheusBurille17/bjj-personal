import type { ProfileResponse, TeacherProfile } from "@/types/auth";
import { getUserRoles } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { unwrapMaybe, unwrapVoid } from "@/lib/supabase/errors";
import { ApiError } from "@/lib/middleware/errors";
import {
  MAX_AVATAR_BYTES,
  isValidImageSize,
  isValidImageType,
} from "@/lib/utils/validation";

/** Retorna o perfil e, quando aplicável, a configuração de professor. */
export async function getProfileView(userId: string): Promise<ProfileResponse> {
  const supabase = await createClient();
  const [profile, teacher, roles] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("teachers").select("*").eq("id", userId).maybeSingle(),
    getUserRoles(userId, supabase),
  ]);

  const profileData = unwrapMaybe(profile);
  if (!profileData) throw ApiError.notFound("Perfil não encontrado");

  const teacherData = unwrapMaybe(teacher);
  return {
    profile: profileData,
    ...(teacherData ? { teacher: teacherData } : {}),
    roles,
  };
}

export async function getTeacherProfile(userId: string): Promise<TeacherProfile | null> {
  const supabase = await createClient();
  return unwrapMaybe(
    await supabase.from("teachers").select("*").eq("id", userId).maybeSingle(),
  );
}

/**
 * Perfil público do professor: somente dados de exibição.
 * Nunca inclui fuso horário, notas ou configurações internas.
 */
export async function getTeacherPublicProfile(
  teacherId: string,
  requesterId: string,
): Promise<{ id: string; display_name: string; avatar_url: string | null; bio: string | null }> {
  const supabase = await createClient();
  const [teacherResult, profileResult, enrollmentResult] = await Promise.all([
    supabase.from("teachers").select("*").eq("id", teacherId).maybeSingle(),
    supabase.from("profiles").select("*").eq("id", teacherId).maybeSingle(),
    supabase
      .from("enrollments")
      .select("id")
      .eq("teacher_id", teacherId)
      .eq("student_profile_id", requesterId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
  ]);

  const teacher = unwrapMaybe(teacherResult);
  const profile = unwrapMaybe(profileResult);
  const isEnrolledStudent = Boolean(unwrapMaybe(enrollmentResult));

  if (!teacher) throw ApiError.notFound("Professor não encontrado");
  if (teacherId !== requesterId && !isEnrolledStudent) {
    throw ApiError.forbidden("Acesso negado");
  }

  return {
    id: teacher.id,
    display_name: teacher.display_name,
    avatar_url: profile?.avatar_url ?? null,
    bio: teacher.bio,
  };
}

/**
 * Upload de avatar.
 *
 * O runtime Supabase mantém o avatar como data URL no perfil para que a imagem
 * continue visível mesmo com o bucket privado. O bucket `avatars` permanece
 * disponível para uma migração futura para URLs assinadas.
 */
export async function uploadAvatar(
  userId: string,
  file: File,
): Promise<{ avatar_url: string }> {
  if (!isValidImageType(file.type)) {
    throw ApiError.validation("Formato inválido. Envie JPEG, PNG ou WebP.");
  }
  if (!isValidImageSize(file.size)) {
    throw ApiError.validation(
      `A imagem deve ter no máximo ${MAX_AVATAR_BYTES / (1024 * 1024)}MB.`,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type};base64,${buffer.toString("base64")}`;

  const supabase = await createClient();
  const result = await supabase
    .from("profiles")
    .update({ avatar_url: dataUrl })
    .eq("id", userId);
  unwrapVoid(result);

  return { avatar_url: dataUrl };
}

export async function removeAvatar(userId: string): Promise<ProfileResponse> {
  const supabase = await createClient();
  const result = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", userId);
  unwrapVoid(result);

  return getProfileView(userId);
}
