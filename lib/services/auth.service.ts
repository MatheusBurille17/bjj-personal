import type { AuthResult, UserRole } from "@/types/auth";
import { buildAuthResult, ensureAccountRecords, getUserRoles } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminClientAvailable } from "@/lib/supabase/admin";
import { mapPostgrestError, unwrapVoid } from "@/lib/supabase/errors";
import { ApiError } from "@/lib/middleware/errors";
import { isValidTimezone } from "@/lib/utils/validation";
import type { ProfileUpdateInput, SignupInput } from "@/lib/validation/auth";
import { getProfileView } from "./profile.service";

export interface LoginInput {
  email: string;
  password: string;
}

const GENERIC_RECOVERY_MESSAGE =
  "Se existir uma conta com este e-mail, enviaremos um link de recuperação.";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

interface AuthErrorLike {
  message: string;
  status?: number;
  code?: string;
}

/** Traduz erros do Supabase Auth para o formato da API. */
function throwAuthError(error: AuthErrorLike): never {
  const message = error.message.toLowerCase();

  if (message.includes("already registered") || message.includes("already been registered")) {
    throw new ApiError(409, "CONFLICT", "Já existe uma conta com este e-mail");
  }
  if (message.includes("invalid login credentials")) {
    throw new ApiError(401, "UNAUTHORIZED", "E-mail ou senha inválidos");
  }
  if (message.includes("email not confirmed")) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Confirme seu e-mail antes de entrar. Verifique a caixa de entrada.",
    );
  }
  if (message.includes("password")) {
    throw ApiError.validation("A senha não atende aos requisitos mínimos");
  }

  console.error("[auth] erro do Supabase", error);
  throw new ApiError(400, "VALIDATION_ERROR", error.message);
}

async function insertTeacherRecords(
  userId: string,
  email: string,
  input: SignupInput,
): Promise<void> {
  const client = isAdminClientAvailable() ? createAdminClient() : await createClient();

  const profile = await client.from("profiles").upsert(
    {
      id: userId,
      full_name: input.fullName,
      email,
      avatar_url: null,
    },
    { onConflict: "id" },
  );
  unwrapVoid(profile);

  const teacher = await client.from("teachers").upsert(
    {
      id: userId,
      display_name: input.displayName,
      timezone: input.timezone,
      bio: null,
    },
    { onConflict: "id" },
  );
  unwrapVoid(teacher);
}

/**
 * Cria uma conta de professor com perfil e configuração de professor.
 * Usa o Admin API para confirmar o e-mail automaticamente quando a secret key
 * está disponível; caso contrário, exige confirmação por e-mail.
 */
export async function createTeacherAccount(input: SignupInput): Promise<AuthResult> {
  const email = input.email.toLowerCase();
  const supabase = await createClient();
  let userId: string;

  if (isAdminClientAvailable()) {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        full_name: input.fullName,
        display_name: input.displayName,
        timezone: input.timezone,
        signup_role: "teacher",
      },
    });

    if (error) throwAuthError(error);
    userId = data.user.id;

    const signIn = await supabase.auth.signInWithPassword({
      email,
      password: input.password,
    });
    if (signIn.error) throwAuthError(signIn.error);
  } else {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: input.password,
      options: {
        data: {
          full_name: input.fullName,
          display_name: input.displayName,
          timezone: input.timezone,
          signup_role: "teacher",
        },
      },
    });

    if (error) throwAuthError(error);
    if (!data.user) throw new ApiError(400, "VALIDATION_ERROR", "Não foi possível criar a conta");
    if (!data.session) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Conta criada. Confirme o e-mail para ativar o acesso ou configure SUPABASE_SECRET_KEY para confirmação automática.",
      );
    }
    userId = data.user.id;
  }

  await insertTeacherRecords(userId, email, input);
  return buildAuthResult(userId, "teacher");
}

/**
 * Autentica um usuário. A mensagem de erro é genérica para não revelar a
 * existência do e-mail.
 */
export async function login(input: LoginInput): Promise<AuthResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email.toLowerCase(),
    password: input.password,
  });

  if (error) {
    if (error.message.toLowerCase().includes("email not confirmed")) {
      throwAuthError(error);
    }
    throw new ApiError(401, "UNAUTHORIZED", "E-mail ou senha inválidos");
  }

  const userId = data.user.id;
  await ensureAccountRecords(supabase, data.user);
  const roles = await getUserRoles(userId, supabase);
  if (!roles.is_teacher && !roles.is_student) {
    await supabase.auth.signOut();
    throw new ApiError(403, "FORBIDDEN", "Sua conta ainda não possui um vínculo ativo");
  }

  return buildAuthResult(userId, roles.is_teacher ? "teacher" : "student");
}

/**
 * Inicia a recuperação de senha via Supabase Auth. Sempre retorna a mesma
 * mensagem, exista ou não a conta.
 */
export async function requestPasswordRecovery(email: string): Promise<{ message: string }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase(), {
    redirectTo: `${appUrl()}/reset-password`,
  });

  if (error) {
    console.error("[auth] falha ao solicitar recuperação", error);
  }

  return { message: GENERIC_RECOVERY_MESSAGE };
}

/**
 * Conclui a redefinição de senha.
 *
 * `token` pode ser o `code` enviado pelo Supabase no link de recuperação; nesse
 * caso a sessão é trocada antes de atualizar a senha. Se o usuário já chegou
 * autenticado pelo link, basta atualizar a senha.
 */
export async function resetPassword(token: string | undefined, password: string): Promise<void> {
  const supabase = await createClient();

  if (token) {
    const exchange = await supabase.auth.exchangeCodeForSession(token);
    if (exchange.error) {
      throw ApiError.validation("Link de recuperação inválido ou expirado");
    }
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) throwAuthError(error);
}

/** Alterna a visão ativa entre professor e aluno. */
export async function switchRole(userId: string, role: UserRole): Promise<AuthResult> {
  const roles = await getUserRoles(userId);
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
  const supabase = await createClient();
  const roles = await getUserRoles(userId, supabase);

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

  const profileUpdate: { full_name?: string; avatar_url?: string | null } = {};
  if (data.full_name !== undefined) profileUpdate.full_name = data.full_name;
  if (data.avatar_url !== undefined) profileUpdate.avatar_url = data.avatar_url;

  if (Object.keys(profileUpdate).length > 0) {
    const result = await supabase.from("profiles").update(profileUpdate).eq("id", userId);
    unwrapVoid(result);
  }

  if (roles.is_teacher) {
    const teacherUpdate: { display_name?: string; timezone?: string; bio?: string | null } = {};
    if (data.display_name !== undefined) teacherUpdate.display_name = data.display_name;
    if (data.timezone !== undefined) teacherUpdate.timezone = data.timezone;
    if (data.bio !== undefined) teacherUpdate.bio = data.bio;

    if (Object.keys(teacherUpdate).length > 0) {
      const result = await supabase.from("teachers").update(teacherUpdate).eq("id", userId);
      unwrapVoid(result);
    }
  }

  return getProfileView(userId);
}
