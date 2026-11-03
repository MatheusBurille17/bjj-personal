"use client";

import { useApi } from "./useApi";
import type {
  StudentDashboardData,
  StudentLessonItem,
  StudentStatistics,
  StudentTeacher,
} from "@/types/lesson";
import type { StudentLibraryTechnique, StudentPlan } from "@/types/plan";

export function useStudentDashboard() {
  return useApi<StudentDashboardData>("/api/student/dashboard");
}

export function useStudentLessons() {
  return useApi<StudentLessonItem[]>("/api/student/agenda");
}

export function useStudentPlans() {
  return useApi<StudentPlan[]>("/api/student/plans");
}

export function useStudentLibrary() {
  return useApi<StudentLibraryTechnique[]>("/api/student/library/techniques");
}

export function useStudentTeachers() {
  return useApi<StudentTeacher[]>("/api/student/teachers");
}

export function useStudentStatistics() {
  return useApi<StudentStatistics>("/api/student/statistics");
}
