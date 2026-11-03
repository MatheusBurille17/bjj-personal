export interface User {
  id: string;
  email: string;
  email_confirmed_at?: string | null;
}

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeacherProfile {
  id: string;
  display_name: string;
  timezone: string;
  bio: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRoles {
  is_teacher: boolean;
  is_student: boolean;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: User;
}

export interface AuthResult {
  user: User;
  session: Session;
  profile: UserProfile;
  teacher_profile?: TeacherProfile;
  roles: UserRoles;
  active_role: UserRole;
}

export type UserRole = "teacher" | "student";

export interface SignupData {
  email: string;
  password: string;
  fullName: string;
  displayName?: string;
  timezone?: string;
}

export interface ProfileUpdateData {
  full_name?: string;
  avatar_url?: string | null;
  display_name?: string;
  timezone?: string;
  bio?: string | null;
}

export interface InviteTokenData {
  valid: boolean;
  teacher_id: string;
  teacher_name: string;
  student_email: string;
  student_name: string;
  enrollment_id: string;
  expires_at: string;
  error?: string;
}

export interface ProfileResponse {
  profile: UserProfile;
  teacher?: TeacherProfile;
  roles: UserRoles;
}
