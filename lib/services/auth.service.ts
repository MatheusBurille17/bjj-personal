import { randomBytes, randomUUID } from "node:crypto";
import type { AuthResult, UserRole } from "@/types/auth";
import { getDb, mutate, nowIso } from "@/lib/db/store";
import { buildAuthResult, getUserRoles } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { ApiError } from "@/lib/middleware/errors";
import { isValidTimezone } from "@/lib/utils/validation";
import { sendEmail } from "@/lib/resend/send";
import { passwordRecoveryEmail } from "@/lib/resend/templates";
import type { ProfileUpdateInput, SignupInput } from "@/lib/validation/auth";
import { getProfileView } from "./profile.service";

export interface LoginInput {
  email: string;
  password: string;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/**
 * Cria uma conta de professor com perfil e configuração de professor.
 * Requisitos 1.1, 1.5, 3.1, 3.3.
 */
export async function createTeacherAccount(input: SignupInput): Promise<AuthResult> {
  const email = input.email.toLowerCase();
  const db = getDb();

  if (db.users.some((user) => user.email.toLowerCase() === email)) {
    throw new ApiError(409, "CONFLICT", "Já existe uma conta com este e-mail");
  }

  const userId = randomUUID();
  const timestamp = nowIso();
  const passwordHash = hashPassword(input.password);

  mutate((database) => {
    database.users.push({
      id: userId,
      email,
      password_hash: passwordHash,
      email_confirmed_at: null,
      created_at: timestamp,
      updated_at: timestamp,
    });
    database.profiles.push({
      id: userId,
      full_name: input.fullName,
      email,
      avatar_url: null,
      created_at: timestamp,
      updated_at: timestamp,
    });
    database.teachers.push({
      id: userId,
      display_name: input.displayName,
      timezone: input.timezone,
      bio: null,
      created_at: timestamp,
      updated_at: timestamp,
    });
  });

  return buildAuthResult(userId, "teacher");
}

/**
 * Autentica um usuário e cria a sessão. A mensagem de erro é genérica para
 * não revelar a existência do e-mail (Requisitos 4.2, 5.6).
 */
export async function login(input: LoginInput): Promise<AuthResult> {
  const db = getDb();
  const user = db.users.find(
    (item) => item.email.toLowerCase() === input.email.toLowerCase(),
  );

  if (!user || !verifyPassword(input.password, user.password_hash)) {
    throw new ApiError(401, "UNAUTHORIZED", "E-mail ou senha inválidos");
  }

  const roles = getUserRoles(user.id);
  if (!roles.is_teacher && !roles.is_student) {
    throw new ApiError(403, "FORBIDDEN", "Sua conta ainda não possui um vínculo ativo");
  }

  const role: UserRole = roles.is_teacher ? "teacher" : "student";
  return buildAuthResult(user.id, role);
}

/**
 * Inicia a recuperação de senha. Sempre retorna sucesso, exista ou não a conta.
 */
export async function requestPasswordRecovery(email: string): Promise<{ message: string }> {
  const db = getDb();
  const user = db.users.find((item) => item.email.toLowerCase() === email.toLowerCase());
  const genericMessage =
    "Se existir uma conta com este e-mail, enviaremos um link de recuperação.";

  if (!user) return { message: genericMessage };

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const profile = db.profiles.find((item) => item.id === user.id);

  mutate((database) => {
    database.password_resets.push({
      id: randomUUID(),
      user_id: user.id,
      token,
      expires_at: expiresAt,
      used_at: null,
      created_at: nowIso(),
    });
  });

  const template = passwordRecoveryEmail({
    fullName: profile?.full_name ?? "aluno",
    resetUrl: `${appUrl()}/reset-password?token=${token}`,
  });

  await sendEmail({
    to: user.email,
    subject: template.subject,
    html: template.html,
    kind: "recovery",
    payload: { token, reset_url: `${appUrl()}/reset-password?token=${token}` },
  });

  return { message: genericMessage };
}

/** Conclui a redefinição de senha a partir de um token válido. */
export async function resetPassword(token: string, password: string): Promise<void> {
  const db = getDb();
  const record = db.password_resets.find(
    (item) => item.token === token && !item.used_at,
  );

  if (!record || new Date(record.expires_at).getTime() <= Date.now()) {
    throw new ApiError(400, "VALIDATION_ERROR", "Link de recuperação inválido ou expirado");
  }

  mutate((database) => {
    const user = database.users.find((item) => item.id === record.user_id);
    if (!user) throw new ApiError(404, "NOT_FOUND", "Conta não encontrada");
    user.password_hash = hashPassword(password);
    user.updated_at = nowIso();
    record.used_at = nowIso();
  });
}

/** Alterna a visão ativa entre professor e aluno. */
export async function switchRole(userId: string, role: UserRole): Promise<AuthResult> {
  const roles = getUserRoles(userId);
  if (role === "teacher" && !roles.is_teacher) {
    throw new ApiError(403, "FORBIDDEN", "Você não possui perfil de professor");
  }
  if (role === "student" && !roles.is_student) {
    throw new ApiError(403, "FORBIDDEN", "Você não possui vínculo de aluno");
  }
  return buildAuthResult(userId, role);
}

/** Atualiza o perfil do usuário autenticado. */
export async function updateOwnProfile(userId: string, data: ProfileUpdateInput) {
  const roles = getUserRoles(userId);
  if ((data.display_name !== undefined || data.timezone !== undefined) && !roles.is_teacher) {
    throw new ApiError(403, "FORBIDDEN", "Somente professores podem alterar estes campos");
  }
  if (data.timezone !== undefined && !isValidTimezone(data.timezone)) {
    throw ApiError.validation("Fuso horário inválido", {
      fields: { timezone: "Fuso horário inválido" },
    });
  }
  if (data.full_name !== undefined && data.full_name.trim().length < 2) {
    throw ApiError.validation("O nome deve ter pelo menos 2 caracteres", {
      fields: { full_name: "Nome muito curto" },
    });
  }
  if (data.display_name !== undefined && data.display_name.trim().length < 2) {
    throw ApiError.validation("O nome de exibição deve ter pelo menos 2 caracteres", {
      fields: { display_name: "Nome de exibição muito curto" },
    });
  }

  mutate((database) => {
    const profile = database.profiles.find((item) => item.id === userId);
    if (!profile) throw new ApiError(404, "NOT_FOUND", "Perfil não encontrado");
    const timestamp = nowIso();

    if (data.full_name !== undefined) profile.full_name = data.full_name;
    if (data.avatar_url !== undefined) profile.avatar_url = data.avatar_url;
    profile.updated_at = timestamp;

    if (roles.is_teacher && (data.display_name !== undefined || data.timezone !== undefined || data.bio !== undefined)) {
      const teacher = database.teachers.find((item) => item.id === userId);
      if (teacher) {
        if (data.display_name !== undefined) teacher.display_name = data.display_name;
        if (data.timezone !== undefined) teacher.timezone = data.timezone;
        if (data.bio !== undefined) teacher.bio = data.bio;
        teacher.updated_at = timestamp;
      }
    }
  });

  return getProfileView(userId);
}
