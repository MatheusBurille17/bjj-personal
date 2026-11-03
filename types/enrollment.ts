import type { PaginationMeta } from "./api";

export type EnrollmentStatus = "pending" | "active" | "paused" | "archived";

export interface Enrollment {
  id: string;
  teacher_id: string;
  student_profile_id: string | null;
  student_name: string;
  student_email: string;
  student_phone: string | null;
  status: EnrollmentStatus;
  started_at: string;
  archived_at: string | null;
  private_notes: string | null;
  invite_token: string | null;
  invite_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NextLessonInfo {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  title: string | null;
}

export interface EnrollmentListItem {
  id: string;
  student_name: string;
  student_email: string;
  student_phone: string | null;
  status: EnrollmentStatus;
  started_at: string;
  archived_at: string | null;
  invite_expires_at: string | null;
  next_lesson: NextLessonInfo | null;
  completed_lessons_count: number;
}

export interface EnrollmentDetail extends EnrollmentListItem {
  private_notes: string | null;
  lessons_count: number;
  completed_lessons_count: number;
  scheduled_lessons_count: number;
  duration_days: number;
}

export interface EnrollmentFormData {
  student_name: string;
  student_email: string;
  student_phone?: string | null;
  private_notes?: string | null;
  started_at?: string;
}

export interface EnrollmentUpdateData {
  student_name?: string;
  student_email?: string;
  student_phone?: string | null;
  private_notes?: string | null;
}

export interface EnrollmentListResponse {
  enrollments: EnrollmentListItem[];
  pagination: PaginationMeta;
}

export interface InviteResendResult {
  enrollment_id: string;
  invite_token: string;
  invite_expires_at: string;
  invite_url: string;
}
