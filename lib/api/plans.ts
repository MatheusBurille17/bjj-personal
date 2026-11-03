import { apiFetch, jsonBody } from "@/lib/api/client";
import type {
  CreatePlanDayData,
  CreatePlanData,
  MonthlyPlanWithCounts,
  PlanDayWithVideos,
  PlanDetail,
  PlanEnrollmentInfo,
  StudentPlan,
  UpdatePlanData,
  UpdatePlanDayData,
} from "@/types/plan";

export function getPlans(params: {
  search?: string;
  status?: string[];
  from_date?: string;
  to_date?: string;
  page?: number;
  pageSize?: number;
}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  for (const status of params.status ?? []) query.append("status", status);
  if (params.from_date) query.set("from_date", params.from_date);
  if (params.to_date) query.set("to_date", params.to_date);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  return apiFetch<MonthlyPlanWithCounts[]>(`/api/plans?${query}`);
}

export function getPlan(id: string) {
  return apiFetch<PlanDetail>(`/api/plans/${id}`);
}

export function createPlan(data: CreatePlanData) {
  return apiFetch<MonthlyPlanWithCounts>("/api/plans", { ...jsonBody(data) });
}

export function updatePlan(id: string, data: UpdatePlanData) {
  return apiFetch<MonthlyPlanWithCounts>(`/api/plans/${id}`, {
    method: "PATCH",
    ...jsonBody(data),
  });
}

export function deletePlan(id: string) {
  return apiFetch<{ success: boolean }>(`/api/plans/${id}`, { method: "DELETE" });
}

export function planStatusAction(id: string, action: "publish" | "unpublish" | "archive" | "unarchive") {
  return apiFetch<MonthlyPlanWithCounts>(`/api/plans/${id}/${action}`, { method: "POST" });
}

export function duplicatePlan(id: string) {
  return apiFetch<PlanDetail>(`/api/plans/${id}/duplicate`, { method: "POST" });
}

export function getPlanDays(id: string) {
  return apiFetch<PlanDayWithVideos[]>(`/api/plans/${id}/days`);
}

export function createPlanDay(planId: string, data: CreatePlanDayData) {
  return apiFetch<PlanDayWithVideos>(`/api/plans/${planId}/days`, { ...jsonBody(data) });
}

export function updatePlanDay(dayId: string, data: UpdatePlanDayData) {
  return apiFetch<PlanDayWithVideos>(`/api/plans/days/${dayId}`, {
    method: "PATCH",
    ...jsonBody(data),
  });
}

export function deletePlanDay(dayId: string) {
  return apiFetch<{ success: boolean }>(`/api/plans/days/${dayId}`, { method: "DELETE" });
}

export function addPlanDayVideo(dayId: string, videoId: string) {
  return apiFetch<PlanDayWithVideos>(`/api/plans/days/${dayId}/videos`, {
    ...jsonBody({ video_id: videoId }),
  });
}

export function getPlanEnrollments(id: string) {
  return apiFetch<PlanEnrollmentInfo[]>(`/api/plans/${id}/enrollments`);
}

export function grantPlanAccess(id: string, enrollmentId: string) {
  return apiFetch<PlanEnrollmentInfo>(`/api/plans/${id}/enrollments`, {
    ...jsonBody({ enrollment_id: enrollmentId }),
  });
}

export function revokePlanAccess(associationId: string) {
  return apiFetch<{ success: boolean }>(`/api/plans/enrollments/${associationId}`, {
    method: "DELETE",
  });
}

export function getStudentPlans() {
  return apiFetch<StudentPlan[]>("/api/student/plans");
}
