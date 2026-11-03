import { apiFetch, jsonBody } from "@/lib/api/client";
import type {
  Enrollment,
  EnrollmentDetail,
  EnrollmentListResponse,
  EnrollmentUpdateData,
  EnrollmentFormData,
} from "@/types/enrollment";

export function getEnrollments(params: {
  search?: string;
  status?: string[];
  page?: number;
  pageSize?: number;
}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  for (const status of params.status ?? []) query.append("status", status);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  return apiFetch<EnrollmentListResponse>(`/api/enrollments?${query}`);
}

export function getEnrollment(id: string) {
  return apiFetch<EnrollmentDetail>(`/api/enrollments/${id}`);
}

export function createEnrollment(data: EnrollmentFormData) {
  return apiFetch<{ enrollment: Enrollment; invite_url: string }>("/api/enrollments", {
    ...jsonBody(data),
  });
}

export function updateEnrollment(id: string, data: EnrollmentUpdateData) {
  return apiFetch<Enrollment>(`/api/enrollments/${id}`, {
    method: "PATCH",
    ...jsonBody(data),
  });
}

export function deleteEnrollment(id: string) {
  return apiFetch<{ success: boolean }>(`/api/enrollments/${id}`, { method: "DELETE" });
}

export function pauseEnrollment(id: string) {
  return apiFetch<Enrollment>(`/api/enrollments/${id}/pause`, { method: "POST" });
}

export function reactivateEnrollment(id: string) {
  return apiFetch<Enrollment>(`/api/enrollments/${id}/reactivate`, { method: "POST" });
}

export function archiveEnrollment(id: string) {
  return apiFetch<Enrollment>(`/api/enrollments/${id}/archive`, { method: "POST" });
}

export function resendInvitation(id: string) {
  return apiFetch<{ invite_url: string; invite_expires_at: string }>(
    `/api/enrollments/${id}/resend-invite`,
    { method: "POST" },
  );
}
