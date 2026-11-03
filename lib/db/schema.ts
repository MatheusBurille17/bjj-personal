import type {
  Technique,
  Module,
  Video,
  TechniqueAccess,
} from "@/types/library";
import type {
  MonthlyPlan,
  PlanDay,
  PlanDayVideo,
  PlanEnrollment,
} from "@/types/plan";
import type {
  Lesson,
  LessonVideo,
  WeeklySlot,
} from "@/types/lesson";
import type { Enrollment } from "@/types/enrollment";
import type { TeacherProfile, UserProfile } from "@/types/auth";
import type {
  GoogleOAuthRecord,
  OAuthAuditLogRecord,
  UsedOAuthCodeRecord,
} from "@/types/google-oauth";
import type {
  DriveFolderMapping,
  DriveOAuthTokenRecord,
  VideoAccessAuditRecord,
  VideoMigrationJob,
  VideoStorageConfig,
  VideoUploadSession,
} from "@/types/google-drive";

/** Registro interno de autenticação (equivalente a auth.users no Supabase). */
export interface AuthUserRecord {
  id: string;
  email: string;
  password_hash: string;
  email_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PasswordResetRecord {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface EmailOutboxRecord {
  id: string;
  to: string;
  subject: string;
  html: string;
  kind: "invite" | "recovery" | "notification";
  payload: Record<string, unknown>;
  created_at: string;
}

export interface Database {
  users: AuthUserRecord[];
  profiles: UserProfile[];
  teachers: TeacherProfile[];
  enrollments: Enrollment[];
  techniques: Technique[];
  modules: Module[];
  videos: Video[];
  monthly_plans: MonthlyPlan[];
  plan_days: PlanDay[];
  plan_day_videos: PlanDayVideo[];
  plan_enrollments: PlanEnrollment[];
  weekly_slots: WeeklySlot[];
  lessons: Lesson[];
  lesson_videos: LessonVideo[];
  student_technique_access: TechniqueAccess[];
  password_resets: PasswordResetRecord[];
  email_outbox: EmailOutboxRecord[];
  user_google_oauth: GoogleOAuthRecord[];
  oauth_audit_logs: OAuthAuditLogRecord[];
  oauth_used_codes: UsedOAuthCodeRecord[];
  providers_oauth_tokens: DriveOAuthTokenRecord[];
  video_storage_config: VideoStorageConfig[];
  drive_folder_mappings: DriveFolderMapping[];
  video_access_audit: VideoAccessAuditRecord[];
  video_upload_sessions: VideoUploadSession[];
  video_migration_jobs: VideoMigrationJob[];
}

export function emptyDatabase(): Database {
  return {
    users: [],
    profiles: [],
    teachers: [],
    enrollments: [],
    techniques: [],
    modules: [],
    videos: [],
    monthly_plans: [],
    plan_days: [],
    plan_day_videos: [],
    plan_enrollments: [],
    weekly_slots: [],
    lessons: [],
    lesson_videos: [],
    student_technique_access: [],
    password_resets: [],
    email_outbox: [],
    user_google_oauth: [],
    oauth_audit_logs: [],
    oauth_used_codes: [],
    providers_oauth_tokens: [],
    video_storage_config: [],
    drive_folder_mappings: [],
    video_access_audit: [],
    video_upload_sessions: [],
    video_migration_jobs: [],
  };
}
