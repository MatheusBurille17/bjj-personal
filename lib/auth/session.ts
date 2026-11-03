import { cookies } from "next/headers";
import type {
  AuthResult,
  Session,
  TeacherProfile,
  User,
  UserProfile,
  UserRole,
  UserRoles,
} from "@/types/auth";
import { getDb } from "@/lib/db/store";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  sessionExpiresAt,
  signSession,
  verifySessionToken,
} from "./token";

export interface CurrentSession {
  user: User;
  profile: UserProfile;
  teacher: TeacherProfile | null;
  roles: UserRoles;
  activeRole: UserRole;
}

export function getUserRoles(userId: string): UserRoles {
  const db = getDb();
  const isTeacher = db.teachers.some((teacher) => teacher.id === userId);
  const isStudent = db.enrollments.some(
    (enrollment) =>
      enrollment.student_profile_id === userId &&
      enrollment.status !== "archived" &&
      enrollment.status !== "pending",
  );
  return { is_teacher: isTeacher, is_student: isStudent };
}

/** Carrega a sessão atual a partir do cookie assinado. */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const db = getDb();
  const userRecord = db.users.find((user) => user.id === payload.sub);
  const profile = db.profiles.find((item) => item.id === payload.sub);
  if (!userRecord || !profile) return null;

  const roles = getUserRoles(payload.sub);
  // A role da sessão só é válida se o usuário realmente tem aquela capacidade.
  const activeRole: UserRole =
    payload.role === "teacher" && roles.is_teacher
      ? "teacher"
      : payload.role === "student" && roles.is_student
        ? "student"
        : roles.is_teacher
          ? "teacher"
          : "student";

  return {
    user: {
      id: userRecord.id,
      email: userRecord.email,
      email_confirmed_at: userRecord.email_confirmed_at,
    },
    profile,
    teacher: db.teachers.find((teacher) => teacher.id === payload.sub) ?? null,
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

/** Cria/renova o cookie de sessão. */
export async function createSessionCookie(userId: string, role: UserRole): Promise<number> {
  const expires = sessionExpiresAt();
  const token = await signSession({ sub: userId, role, exp: expires });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return expires;
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/** Monta o objeto de autenticação retornado pelas rotas. */
export async function buildAuthResult(userId: string, activeRole: UserRole): Promise<AuthResult> {
  const db = getDb();
  const userRecord = db.users.find((user) => user.id === userId);
  const profile = db.profiles.find((item) => item.id === userId);
  const teacher = db.teachers.find((item) => item.id === userId) ?? null;
  if (!userRecord || !profile) throw new Error("NOT_FOUND");

  const expiresAt = await createSessionCookie(userId, activeRole);
  const session: Session = {
    access_token: await signSession({ sub: userId, role: activeRole, exp: expiresAt }),
    refresh_token: `${userId}.${expiresAt}`,
    expires_at: expiresAt,
    user: {
      id: userRecord.id,
      email: userRecord.email,
      email_confirmed_at: userRecord.email_confirmed_at,
    },
  };

  return {
    user: session.user,
    session,
    profile,
    teacher_profile: teacher ?? undefined,
    roles: getUserRoles(userId),
    active_role: activeRole,
  };
}

/** Retorna o primeiro perfil de professor (uso em demo/seed). */
export function getDefaultTeacher(): TeacherProfile | null {
  return getDb().teachers[0] ?? null;
}
