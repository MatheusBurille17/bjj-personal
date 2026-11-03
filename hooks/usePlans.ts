"use client";

import * as React from "react";
import { apiFetch } from "@/lib/api/client";
import type {
  PlanDayWithVideos,
  PlanDetail,
  PlanEnrollmentInfo,
  PlanListResponse,
} from "@/types/plan";
import { useApi } from "./useApi";

/** Lista de planos do professor. */
export function usePlans(params: {
  search?: string;
  statuses?: string[];
  page?: number;
  pageSize?: number;
} = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  for (const status of params.statuses ?? ["draft", "published"]) query.append("status", status);
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 20));
  return useApi<PlanListResponse>(`/api/plans?${query}`);
}

/** Dias de um plano, com vídeos associados. */
export function usePlanDays(planId: string | null) {
  return useApi<PlanDayWithVideos[]>(planId ? `/api/plans/${planId}/days` : null);
}

/** Alunos com acesso a um plano. */
export function usePlanEnrollments(planId: string | null) {
  const state = useApi<PlanEnrollmentInfo[]>(
    planId ? `/api/plans/${planId}/enrollments` : null,
  );

  async function grant(enrollmentId: string) {
    if (!planId) return;
    await apiFetch(`/api/plans/${planId}/enrollments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollment_id: enrollmentId }),
    });
    await state.refresh();
  }

  async function revoke(associationId: string) {
    await apiFetch(`/api/plans/enrollments/${associationId}`, { method: "DELETE" });
    await state.refresh();
  }

  return { ...state, grant, revoke, enrollments: state.data ?? [] };
}

/** Pequeno helper para recarregar o plano após mutações. */
export function usePlan(planId: string | null) {
  const state = useApi<PlanDetail>(planId ? `/api/plans/${planId}` : null);
  return { ...state, plan: state.data };
}

export function usePlanList(plans: PlanDetail[]) {
  return React.useMemo(() => plans.slice(), [plans]);
}
