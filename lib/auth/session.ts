import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AuthResult,
  Session,
  TeacherProfile,
  User,
  UserProfile,
  UserRole,
  UserRoles,
} from "@/types/auth";
import type { Database } from "@/lib/supabase/database";
import { createClient } from "@/lib/supabase/server";
import { unwrapMaybe } from "@/lib/supabase/errors";
import { mapPostgrestError } from "@/lib/supabase/errors";
import { ApiError } from "@/lib/api-error";
import { ACTIVE_ROLE_COOKIE } from "./constants";

export { ACTIVE_ROLE_COOKIE };
export const ACTIVE_ROLE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export interface CurrentSession {
  user: User;
  profile: UserProfile;
  teacher: TeacherProfile | null;
  roles: UserRoles;
  activeRole: UserRole;
}

type Client = SupabaseClient<Database>;

async function loadRoles(userId: string, client: Client): Promise<UserRoles> {
  const [teacher, enrollment] = await Promise.all([
    client.from("teachers").select("id").eq("id", userId).maybeSingle(),
    client
      .from("enrollments")
      .select("id")
      .eq("student_profile_id", userId)
      .in("status", ["active", "paused"])
      .limit(1)
      .maybeSingle(),
  ]);

  if (teacher.error) throw mapPostgrestError(teacher.error);
  if (enrollment.error) throw mapPostgrestError(enrollment.error);

  return { is_teacher: Boolean(teacher.data), is_student: Boolean(enrollment.data) };
}

/** Papéis reais do usuário (independente da visão ativa). */
export async function getUserRoles(userId: string, client?: Client): Promise<UserRoles> {
  return loadRoles(userId, client ?? (await createClient()));
}

function resolveActiveRole(cookieRole: string | undefined, roles: UserRoles): UserRole {
  if (cookieRole === "teacher" && roles.is_teacher) return "teacher";
  if (cookieRole === "student" && roles.is_student) return "student";
  return roles.is_teacher ? "teacher" : "student";
}

interface SupabaseUserLike {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}

/**
 * Garante perfil (e professor, quando o cadastro foi de professor) para contas
 * criadas em fluxos que não conseguiram gravar as linhas na hora — por exemplo,
 * cadastro com confirmação de e-mail pendente.
 */
export async function ensureAccountRecords(
  supabase: Client,
  user: SupabaseUserLike,
): Promise<void> {
  const metadata = user.user_metadata ?? {};
  const email = user.email ?? "";
  const fullName =
    (typeof metadata.full_name === "string" && metadata.full_name) ||
    email.split("@")[0] ||
    "Usuário";

  const existingProfile = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (existingProfile.error) throw mapPostgrestError(existingProfile.error);

  if (!existingProfile.data) {
    const result = await supabase.from("profiles").upsert(
      {
        id: user.id,
        full_name: fullName,
        email,
        avatar_url:
          typeof metadata.avatar_url === "string" ? metadata.avatar_url : null,
      },
      { onConflict: "id" },
    );
    if (result.error) throw mapPostgrestError(result.error);
  }

  if (metadata.signup_role === "teacher") {
    const existingTeacher = await supabase
      .from("teachers")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (existingTeacher.error) throw mapPostgrestError(existingTeacher.error);

    if (!existingTeacher.data) {
      const displayName =
        (typeof metadata.display_name === "string" && metadata.display_name) || fullName;
      const timezone =
        (typeof metadata.timezone === "string" && metadata.timezone) ||
        "America/Sao_Paulo";
      const result = await supabase.from("teachers").upsert(
        {
          id: user.id,
          display_name: displayName,
          timezone,
          bio: null,
        },
        { onConflict: "id" },
      );
      if (result.error) throw mapPostgrestError(result.error);
    }
  }
}

/** Carrega a sessão atual a partir dos cookies do Supabase Auth. */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  await ensureAccountRecords(supabase, user);

  const [profile, teacher, roles] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("teachers").select("*").eq("id", user.id).maybeSingle(),
    loadRoles(user.id, supabase),
  ]);

  if (!profile.data) return null;

  const cookieStore = await cookies();
  const activeRole = resolveActiveRole(cookieStore.get(ACTIVE_ROLE_COOKIE)?.value, roles);

  return {
    user: {
      id: user.id,
      email: user.email ?? profile.data.email,
      email_confirmed_at: user.email_confirmed_at ?? null,
    },
    profile: profile.data,
    teacher: teacher.data ?? null,
    roles,
    activeRole,
  };
}

export async function requireSession(): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}

export async function requireTeacher(): Promise<CurrentSession & { teacher: TeacherProfile }> {
  const session = await getCurrentSession();
  if (!session) throw new Error("UNAUTHORIZED");
  if (!session.roles.is_teacher || !session.teacher) throw new Error("FORBIDDEN");
  return session as CurrentSession & { teacher: TeacherProfile };
}

export async function requireStudent(): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) throw new Error("UNAUTHORIZED");
  if (!session.roles.is_student) throw new Error("FORBIDDEN");
  return session;
}

/** Define a visão ativa (professor/aluno) usada pela navegação. */
export async function createSessionCookie(userId: string, role: UserRole): Promise<number> {
  const expiresAt = Math.floor(Date.now() / 1000) + ACTIVE_ROLE_MAX_AGE_SECONDS;
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ROLE_COOKIE, role, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACTIVE_ROLE_MAX_AGE_SECONDS,
  });
  return expiresAt;
}

/** Encerra a sessão do Supabase e limpa o cookie de visão ativa. */
export async function clearSessionCookie(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ROLE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/** Monta o objeto de autenticação retornado pelas rotas. */
export async function buildAuthResult(
  userId: string,
  activeRole: UserRole,
): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const [profile, teacher, roles] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("teachers").select("*").eq("id", userId).maybeSingle(),
    loadRoles(userId, supabase),
  ]);

  const profileData = unwrapMaybe(profile);
  if (!profileData) throw ApiError.notFound("Perfil não encontrado");

  const expiresAt = await createSessionCookie(userId, activeRole);
  const user: User = {
    id: userId,
    email: profileData.email,
    email_confirmed_at: session?.user.email_confirmed_at ?? null,
  };

  const authSession: Session = {
    access_token: session?.access_token ?? "",
    refresh_token: session?.refresh_token ?? "",
    expires_at: session?.expires_at ?? expiresAt,
    user,
  };

  return {
    user,
    session: authSession,
    profile: profileData,
    teacher_profile: teacher.data ?? undefined,
    roles,
    active_role: activeRole,
  };
}
