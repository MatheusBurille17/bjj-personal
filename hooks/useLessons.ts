"use client";

import { useApi } from "./useApi";
import type { LessonListItem, WeeklySlotWithStudent } from "@/types/lesson";

/** Lista de aulas com filtros. */
export function useLessons(params: {
  enrollmentId?: string;
  statuses?: string[];
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const query = new URLSearchParams();
  if (params.enrollmentId) query.set("enrollment_id", params.enrollmentId);
  for (const status of params.statuses ?? []) query.append("status", status);
  if (params.fromDate) query.set("from_date", params.fromDate);
  if (params.toDate) query.set("to_date", params.toDate);
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 20));
  return useApi<LessonListItem[]>(`/api/lessons?${query}`);
}

/** Agenda semanal do professor. */
export function useWeeklyAgenda(weekStart?: string) {
  return useApi<{ week_start: string; lessons: LessonListItem[] }>(
    `/api/agenda/weekly${weekStart ? `?week_start=${weekStart}` : ""}`,
  );
}

/** Agenda diária do professor. */
export function useDailyAgenda(date?: string) {
  return useApi<{ date: string; lessons: LessonListItem[] }>(
    `/api/agenda/daily${date ? `?date=${date}` : ""}`,
  );
}

/** Horários recorrentes do professor ou de um aluno. */
export function useWeeklySlots(enrollmentId?: string) {
  return useApi<WeeklySlotWithStudent[]>(
    `/api/weekly-slots${enrollmentId ? `?enrollment_id=${enrollmentId}` : ""}`,
  );
}
