"use client";

import * as React from "react";
import { apiFetch, jsonBody } from "@/lib/api/client";
import type {
  Enrollment,
  EnrollmentDetail,
  EnrollmentListResponse,
  EnrollmentStatus,
} from "@/types/enrollment";
import { useApi } from "./useApi";

/** Lista de vínculos com busca, filtro e paginação. */
export function useEnrollments(initial?: {
  search?: string;
  status?: EnrollmentStatus[];
  page?: number;
  pageSize?: number;
}) {
  const [search, setSearch] = React.useState(initial?.search ?? "");
  const [statuses, setStatuses] = React.useState<EnrollmentStatus[]>(
    initial?.status ?? ["active", "paused", "pending"],
  );
  const [page, setPage] = React.useState(initial?.page ?? 1);
  const pageSize = initial?.pageSize ?? 20;

  const query = new URLSearchParams();
  if (search.trim()) query.set("search", search.trim());
  for (const status of statuses) query.append("status", status);
  query.set("page", String(page));
  query.set("pageSize", String(pageSize));

  const state = useApi<EnrollmentListResponse>(`/api/enrollments?${query}`);

  return {
    enrollments: state.data?.enrollments ?? [],
    pagination: state.data?.pagination ?? null,
    loading: state.loading,
    error: state.error,
    search,
    setSearch: (value: string) => {
      setSearch(value);
      setPage(1);
    },
    statuses,
    toggleStatus: (status: EnrollmentStatus) => {
      setStatuses((current) =>
        current.includes(status)
          ? current.filter((item) => item !== status)
          : [...current, status],
      );
      setPage(1);
    },
    page,
    goToPage: setPage,
    refresh: state.refresh,
  };
}

/** Detalhe de um vínculo e ações de ciclo de vida. */
export function useEnrollment(id: string | null) {
  const state = useApi<EnrollmentDetail>(id ? `/api/enrollments/${id}` : null);
  const [acting, setActing] = React.useState(false);

  async function run(action: "pause" | "reactivate" | "archive" | "delete" | "resend") {
    if (!id) return null;
    setActing(true);
    try {
      if (action === "delete") {
        await apiFetch(`/api/enrollments/${id}`, { method: "DELETE" });
      } else if (action === "resend") {
        await apiFetch(`/api/enrollments/${id}/resend-invite`, { method: "POST" });
      } else {
        await apiFetch(`/api/enrollments/${id}/${action}`, { method: "POST" });
      }
      await state.refresh();
      return true;
    } finally {
      setActing(false);
    }
  }

  async function update(data: Partial<Pick<Enrollment, "student_name" | "student_email" | "student_phone" | "private_notes">>) {
    if (!id) return null;
    const result = await apiFetch<Enrollment>(`/api/enrollments/${id}`, {
      method: "PATCH",
      ...jsonBody(data),
    });
    await state.refresh();
    return result;
  }

  return {
    enrollment: state.data,
    loading: state.loading,
    error: state.error,
    acting,
    refresh: state.refresh,
    pause: () => run("pause"),
    reactivate: () => run("reactivate"),
    archive: () => run("archive"),
    remove: () => run("delete"),
    resendInvite: () => run("resend"),
    update,
  };
}
