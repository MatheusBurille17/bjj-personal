import type { Video, VideoStatus } from "./library";
import type { PaginationMeta } from "./api";

export type PlanStatus = "draft" | "published" | "archived";
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface MonthlyPlan {
  id: string;
  teacher_id: string;
  title: string;
  description: string | null;
  objective: string | null;
  period_start: string;
  period_end: string;
  status: PlanStatus;
  published_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MonthlyPlanWithCounts extends MonthlyPlan {
  plan_day_count: number;
  enrolled_count: number;
}

export interface PlanDay {
  id: string;
  monthly_plan_id: string;
  teacher_id: string;
  weekday: number | null;
  planned_date: string | null;
  title: string;
  objective: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PlanDayVideo {
  id: string;
  plan_day_id: string;
  video_id: string;
  sort_order: number;
  created_at: string;
}

export interface PlanDayVideoItem extends Video {
  association_id: string;
  sort_order: number;
}

export interface PlanDayWithVideos extends PlanDay {
  videos: PlanDayVideoItem[];
  video_count: number;
}

export interface PlanDetail extends MonthlyPlanWithCounts {
  days: PlanDayWithVideos[];
  enrollments: PlanEnrollmentInfo[];
}

export interface PlanListResponse {
  plans: MonthlyPlanWithCounts[];
  pagination: PaginationMeta;
}

export interface PlanEnrollment {
  id: string;
  monthly_plan_id: string;
  enrollment_id: string;
  published_at: string;
}

export interface PlanEnrollmentInfo extends PlanEnrollment {
  student_name: string;
  student_email: string;
  status: string;
}

export interface CreatePlanData {
  title: string;
  description?: string | null;
  objective?: string | null;
  period_start: string;
  period_end: string;
}

export interface UpdatePlanData {
  title?: string;
  description?: string | null;
  objective?: string | null;
  period_start?: string;
  period_end?: string;
}

export interface CreatePlanDayData {
  weekday?: number | null;
  planned_date?: string | null;
  title: string;
  objective?: string | null;
  notes?: string | null;
  sort_order?: number;
}

export interface UpdatePlanDayData {
  weekday?: number | null;
  planned_date?: string | null;
  title?: string;
  objective?: string | null;
  notes?: string | null;
  sort_order?: number;
}

export interface StudentPlan extends MonthlyPlan {
  teacher_name: string;
  enrollment_id: string;
  days: PlanDayWithVideos[];
}

export interface StudentLibraryTechnique {
  id: string;
  teacher_id: string;
  teacher_name: string;
  name: string;
  description: string | null;
  module_count: number;
  video_count: number;
  access_id: string;
}

export interface StudentVideo extends Video {
  module_name: string;
  technique_name: string;
  teacher_name: string;
  access_source: "technique" | "lesson";
}

export interface StudentTechniqueVideos {
  technique: StudentLibraryTechnique;
  modules: Array<{
    id: string;
    name: string;
    description: string | null;
    videos: StudentVideo[];
  }>;
  source: "technique" | "lesson";
}

export type { VideoStatus };
