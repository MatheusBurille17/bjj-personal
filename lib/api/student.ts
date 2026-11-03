import { apiFetch, jsonBody } from "@/lib/api/client";
import type { ProfileResponse, ProfileUpdateData } from "@/types/auth";
import type {
  StudentDashboardData,
  StudentLessonDetail,
  StudentLessonItem,
  StudentStatistics,
  StudentTeacher,
} from "@/types/lesson";
import type { StudentPlan, StudentLibraryTechnique, StudentTechniqueVideos } from "@/types/plan";

export function getMyProfile() {
  return apiFetch<ProfileResponse>("/api/profiles/me");
}

export function updateMyProfile(data: ProfileUpdateData) {
  return apiFetch<ProfileResponse>("/api/profiles/me", {
    method: "PATCH",
    ...jsonBody(data),
  });
}

export function getStudentDashboard() {
  return apiFetch<StudentDashboardData>("/api/student/dashboard");
}

export function getStudentAgenda() {
  return apiFetch<StudentLessonItem[]>("/api/student/agenda");
}

export function getStudentLesson(id: string) {
  return apiFetch<StudentLessonDetail>(`/api/student/lessons/${id}`);
}

export function getStudentPlans() {
  return apiFetch<StudentPlan[]>("/api/student/plans");
}

export function getStudentTechniques() {
  return apiFetch<StudentLibraryTechnique[]>("/api/student/library/techniques");
}

export function getStudentTechniqueVideos(id: string) {
  return apiFetch<StudentTechniqueVideos>(`/api/student/library/techniques/${id}/videos`);
}

export function getStudentVideoPlayback(id: string) {
  return apiFetch<{ playback_url: string }>(`/api/student/videos/${id}/playback-url`);
}

export function getStudentProfile() {
  return apiFetch<ProfileResponse>("/api/student/profile");
}

export function updateStudentProfile(data: ProfileUpdateData) {
  return apiFetch<ProfileResponse>("/api/student/profile", {
    method: "PATCH",
    ...jsonBody(data),
  });
}

export function getStudentTeachers() {
  return apiFetch<StudentTeacher[]>("/api/student/teachers");
}

export function getStudentStatistics() {
  return apiFetch<StudentStatistics>("/api/student/statistics");
}
