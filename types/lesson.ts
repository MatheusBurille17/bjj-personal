import type { PlanDay } from "./plan";
import type { Video } from "./library";

export type LessonStatus = "scheduled" | "completed" | "cancelled" | "no_show";
export type LessonVideoSource = "plan" | "manual";

export interface Lesson {
  id: string;
  teacher_id: string;
  enrollment_id: string;
  plan_day_id: string | null;
  starts_at: string;
  ends_at: string;
  status: LessonStatus;
  completed_at: string | null;
  shared_notes: string | null;
  private_notes: string | null;
  title_snapshot: string | null;
  objective_snapshot: string | null;
  rescheduled_from_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LessonVideo {
  id: string;
  lesson_id: string;
  video_id: string;
  source: LessonVideoSource;
  sort_order: number;
  created_at: string;
}

export interface LessonVideoWithVideo extends LessonVideo {
  video: Video;
}

export interface LessonListItem extends Lesson {
  student_name: string;
  student_email: string;
  enrollment_status: string;
  plan_day_title: string | null;
  video_count: number;
}

export interface LessonDetail extends LessonListItem {
  plan_day: PlanDay | null;
  videos: LessonVideoWithVideo[];
  teacher_name: string;
}

/** Visão do aluno: nunca inclui private_notes. */
export interface StudentLessonItem extends Omit<LessonListItem, "private_notes"> {
  teacher_name: string;
}

export interface StudentLessonDetail extends Omit<LessonDetail, "private_notes"> {
  teacher_name: string;
}

export interface WeeklySlot {
  id: string;
  teacher_id: string;
  enrollment_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  valid_from: string;
  valid_until: string | null;
  status: "active" | "paused";
  created_at: string;
  updated_at: string;
}

export interface WeeklySlotWithStudent extends WeeklySlot {
  student_name: string;
}

export interface CreateLessonData {
  enrollment_id: string;
  plan_day_id?: string | null;
  starts_at: string;
  ends_at: string;
  shared_notes?: string | null;
  private_notes?: string | null;
  override_conflict?: boolean;
}

export interface UpdateLessonData {
  starts_at?: string;
  ends_at?: string;
  plan_day_id?: string | null;
  shared_notes?: string | null;
  private_notes?: string | null;
  override_conflict?: boolean;
}

export interface CreateWeeklySlotData {
  enrollment_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  valid_from?: string;
  valid_until?: string | null;
}

export interface UpdateWeeklySlotData {
  weekday?: number;
  start_time?: string;
  end_time?: string;
  valid_from?: string;
  valid_until?: string | null;
}

export interface LessonStats {
  enrollment_id: string;
  scheduled: number;
  completed: number;
  cancelled: number;
  no_show: number;
  total: number;
  completion_rate: number;
}

export interface GeneratedLessonSuggestion {
  enrollment_id: string;
  student_name: string;
  starts_at: string;
  ends_at: string;
  weekly_slot_id: string;
  conflicts: LessonListItem[];
}

export interface DashboardData {
  active_students: number;
  lessons_today: number;
  completed_this_month: number;
  cancelled_this_month: number;
  no_show_this_month: number;
  upcoming_lessons: LessonListItem[];
  next_lessons_today: LessonListItem[];
  pending_invites: number;
  active_plans: number;
  library_videos: number;
}

export interface StudentDashboardData {
  next_lesson: StudentLessonItem | null;
  total_completed: number;
  recent_lessons: StudentLessonDetail[];
  upcoming_lessons: StudentLessonItem[];
  published_plans: number;
  authorized_videos: number;
  teachers: StudentTeacher[];
}

export interface StudentTeacher {
  enrollment_id: string;
  teacher_id: string;
  display_name: string;
  avatar_url: string | null;
  status: string;
  started_at: string;
  next_lesson: { id: string; starts_at: string } | null;
  completed_lessons: number;
}

export interface StudentStatistics {
  total_completed: number;
  first_completed_at: string | null;
  by_teacher: Array<{
    enrollment_id: string;
    teacher_name: string;
    completed: number;
  }>;
}

/** Opções de planejamento usadas no formulário de aula. */
export interface PlanDayOption {
  id: string;
  title: string;
  plan_title: string;
  weekday: number | null;
  planned_date: string | null;
}

export interface VideoOption {
  id: string;
  title: string;
  technique_name: string;
  module_name: string;
}
