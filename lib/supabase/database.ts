import type { UserProfile, TeacherProfile } from "@/types/auth";
import type { Enrollment } from "@/types/enrollment";
import type { Technique, Module, Video, TechniqueAccess } from "@/types/library";
import type {
  MonthlyPlan,
  PlanDay,
  PlanDayVideo,
  PlanEnrollment,
} from "@/types/plan";
import type { Lesson, LessonVideo, WeeklySlot } from "@/types/lesson";
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

/**
 * Mapeamento TypeScript do schema em `supabase/migrations`.
 *
 * As linhas do Postgres usam os mesmos nomes de coluna dos tipos de domínio
 * (`snake_case`), então reaproveitamos os tipos de `types/*`. `Insert`/`Update`
 * ficam parciais para não repetir todas as colunas em cada chamada.
 */
type Table<Row> = {
  Row: Row & Record<string, unknown>;
  Insert: Partial<Row> & Record<string, unknown>;
  Update: Partial<Row> & Record<string, unknown>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<UserProfile>;
      teachers: Table<TeacherProfile>;
      enrollments: Table<Enrollment>;
      techniques: Table<Technique>;
      modules: Table<Module>;
      videos: Table<Video>;
      monthly_plans: Table<MonthlyPlan>;
      plan_days: Table<PlanDay>;
      plan_day_videos: Table<PlanDayVideo>;
      plan_enrollments: Table<PlanEnrollment>;
      weekly_slots: Table<WeeklySlot>;
      lessons: Table<Lesson>;
      lesson_videos: Table<LessonVideo>;
      student_technique_access: Table<TechniqueAccess>;
      user_google_oauth: Table<GoogleOAuthRecord>;
      oauth_audit_logs: Table<OAuthAuditLogRecord>;
      oauth_used_authorization_codes: Table<UsedOAuthCodeRecord>;
      providers_oauth_tokens: Table<DriveOAuthTokenRecord>;
      video_storage_config: Table<VideoStorageConfig>;
      drive_folder_mappings: Table<DriveFolderMapping>;
      video_access_audit: Table<VideoAccessAuditRecord>;
      video_upload_sessions: Table<VideoUploadSession>;
      video_migration_jobs: Table<VideoMigrationJob>;
    };
    Views: {
      /** Vínculos visíveis ao aluno, sem `private_notes`. */
      student_enrollments: {
        Row: Omit<Enrollment, "private_notes"> & Record<string, unknown>;
        Relationships: [];
      };
      /** Vínculos do professor autenticado, com `private_notes`. */
      teacher_enrollments: {
        Row: Enrollment & Record<string, unknown>;
        Relationships: [];
      };
    };
    Functions: {
      student_has_plan: {
        Args: { plan_id: string; user_id: string } & Record<string, unknown>;
        Returns: boolean;
      };
      get_invite: {
        Args: { p_token: string } & Record<string, unknown>;
        Returns: Array<{
          enrollment_id: string;
          teacher_id: string;
          teacher_name: string;
          student_email: string;
          student_name: string;
          invite_expires_at: string;
        }>;
      };
      accept_invite: {
        Args: { p_token: string } & Record<string, unknown>;
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type SupabasePublicSchema = Database["public"];
export type TableName = keyof SupabasePublicSchema["Tables"];
