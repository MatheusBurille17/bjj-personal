import { apiFetch, jsonBody } from "@/lib/api/client";
import type {
  CreateLessonData,
  CreateWeeklySlotData,
  LessonDetail,
  LessonListItem,
  LessonStats,
  StudentLessonDetail,
  StudentLessonItem,
  UpdateLessonData,
  UpdateWeeklySlotData,
  WeeklySlotWithStudent,
} from "@/types/lesson";

export function getLessons(params: {
  enrollment_id?: string;
  status?: string[];
  from_date?: string;
  to_date?: string;
  page?: number;
  pageSize?: number;
}) {
  const query = new URLSearchParams();
  if (params.enrollment_id) query.set("enrollment_id", params.enrollment_id);
  for (const status of params.status ?? []) query.append("status", status);
  if (params.from_date) query.set("from_date", params.from_date);
  if (params.to_date) query.set("to_date", params.to_date);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  return apiFetch<LessonListItem[]>(`/api/lessons?${query}`);
}

export function getLesson(id: string) {
  return apiFetch<LessonDetail>(`/api/lessons/${id}`);
}

export function createLesson(data: CreateLessonData) {
  return apiFetch<LessonDetail>("/api/lessons", { ...jsonBody(data) });
}

export function updateLesson(id: string, data: UpdateLessonData) {
  return apiFetch<LessonDetail>(`/api/lessons/${id}`, {
    method: "PATCH",
    ...jsonBody(data),
  });
}

export function changeLessonStatus(
  id: string,
  data: {
    status: "completed" | "cancelled" | "no_show";
    shared_notes?: string | null;
    private_notes?: string | null;
    override_window?: boolean;
  },
) {
  return apiFetch<LessonDetail>(`/api/lessons/${id}/status`, {
    method: "PATCH",
    ...jsonBody(data),
  });
}

export function getWeeklyAgenda(weekStart?: string) {
  return apiFetch<{ week_start: string; lessons: LessonListItem[] }>(
    `/api/agenda/weekly${weekStart ? `?week_start=${weekStart}` : ""}`,
  );
}

export function getDailyAgenda(date?: string) {
  return apiFetch<{ date: string; lessons: LessonListItem[] }>(
    `/api/agenda/daily${date ? `?date=${date}` : ""}`,
  );
}

export function getWeeklySlots(enrollmentId?: string) {
  return apiFetch<WeeklySlotWithStudent[]>(
    `/api/weekly-slots${enrollmentId ? `?enrollment_id=${enrollmentId}` : ""}`,
  );
}

export function createWeeklySlot(data: CreateWeeklySlotData) {
  return apiFetch<WeeklySlotWithStudent>("/api/weekly-slots", { ...jsonBody(data) });
}

export function updateWeeklySlot(id: string, data: UpdateWeeklySlotData) {
  return apiFetch<WeeklySlotWithStudent>(`/api/weekly-slots/${id}`, {
    method: "PATCH",
    ...jsonBody(data),
  });
}

export function getLessonStats(enrollmentId?: string) {
  return apiFetch<LessonStats>(
    `/api/lessons/stats${enrollmentId ? `?enrollment_id=${enrollmentId}` : ""}`,
  );
}

export function getStudentUpcomingLessons() {
  return apiFetch<StudentLessonItem[]>("/api/student/lessons/upcoming");
}

export function getStudentHistory(page = 1) {
  return apiFetch<StudentLessonDetail[]>(`/api/student/lessons/history?page=${page}`);
}
