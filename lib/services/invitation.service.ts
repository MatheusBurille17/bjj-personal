import { randomBytes } from "node:crypto";
import type { AuthResult, InviteTokenData } from "@/types/auth";
import type { Enrollment } from "@/types/enrollment";
import { buildAuthResult } from "@/lib/auth/session";
import { createAnonClient, createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminClientAvailable } from "@/lib/supabase/admin";
import { mapPostgrestError, unwrapMaybe, unwrapVoid } from "@/lib/supabase/errors";
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
export async function sendInvitationEmail(
  enrollment: Enrollment,
  token: string,
): Promise<void> {
  const supabase = await createClient();
  const teacher = unwrapMaybe(
    await supabase
      .from("teachers")
      .select("display_name")
      .eq("id", enrollment.teacher_id)
      .maybeSingle(),
  );

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

/**
 * Valida um token de convite. Usa a RPC pública `get_invite`, que expõe apenas
 * os dados necessários para a tela e nunca as observações privadas.
 */
export async function verifyInviteToken(token: string): Promise<InviteTokenData> {
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("get_invite", { p_token: token });
  if (error) throw mapPostgrestError(error);

  const invite = data?.[0];
  if (!invite || !invite.invite_expires_at) {
    throw ApiError.notFound("Convite inválido ou já utilizado");
  }
  if (new Date(invite.invite_expires_at).getTime() <= Date.now()) {
    throw ApiError.notFound("Convite expirado. Solicite um novo convite ao professor.");
  }

  return {
    valid: true,
    teacher_id: invite.teacher_id,
    teacher_name: invite.teacher_name,
    student_email: invite.student_email,
    student_name: invite.student_name,
    enrollment_id: invite.enrollment_id,
    expires_at: invite.invite_expires_at,
  };
}

/**
 * Cria a conta do aluno a partir do convite e ativa o vínculo.
 *
 * A ativação é feita pela RPC `accept_invite`, que valida o token e usa
 * `auth.uid()` — o aluno não tem permissão de UPDATE direto em `enrollments`.
 */
export async function createStudentAccount(
  token: string,
  password: string,
  fullName: string,
): Promise<AuthResult> {
  const invite = await verifyInviteToken(token);
  const email = invite.student_email.toLowerCase();
  const supabase = await createClient();

  if (isAdminClientAvailable()) {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, signup_role: "student" },
    });

    if (error) {
      if (error.message.toLowerCase().includes("already")) {
        throw new ApiError(
          409,
          "CONFLICT",
          "Já existe uma conta com este e-mail. Entre nela e abra o convite novamente.",
        );
      }
      throw ApiError.validation(error.message);
    }

    const signIn = await supabase.auth.signInWithPassword({ email, password });
    if (signIn.error) throw ApiError.validation(signIn.error.message);

    await ensureStudentProfile(signIn.data.user.id, fullName, email);
  } else {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, signup_role: "student" } },
    });

    if (error) throw ApiError.validation(error.message);
    if (!data.user) throw ApiError.validation("Não foi possível criar a conta");
    if ((data.user.identities?.length ?? 0) === 0) {
      throw new ApiError(
        409,
        "CONFLICT",
        "Já existe uma conta com este e-mail. Entre nela e abra o convite novamente.",
      );
    }
    if (!data.session) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Conta criada. Confirme o e-mail para aceitar o convite ou configure SUPABASE_SECRET_KEY.",
      );
    }

    await ensureStudentProfile(data.user.id, fullName, email);
  }

  const accept = await supabase.rpc("accept_invite", { p_token: token });
  if (accept.error || !accept.data) {
    throw ApiError.validation("Convite inválido ou expirado. Solicite um novo convite.");
  }

  const userId = await currentUserId(supabase);
  return buildAuthResult(userId, "student");
}

async function ensureStudentProfile(
  userId: string,
  fullName: string,
  email: string,
): Promise<void> {
  const supabase = await createClient();
  const result = await supabase.from("profiles").upsert(
    {
      id: userId,
      full_name: fullName.trim().length >= 2 ? fullName.trim() : email.split("@")[0],
      email,
      avatar_url: null,
    },
    { onConflict: "id" },
  );
  unwrapVoid(result);
}

async function currentUserId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw ApiError.unauthorized();
  return user.id;
}
