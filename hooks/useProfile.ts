"use client";

import { apiFetch } from "@/lib/api/client";
import type { ProfileResponse, ProfileUpdateData } from "@/types/auth";
import { useApi } from "./useApi";

/** Perfil do usuário autenticado com atualização de dados e avatar. */
export function useProfile() {
  const state = useApi<ProfileResponse>("/api/profiles/me");

  async function updateProfile(data: ProfileUpdateData) {
    const result = await apiFetch<ProfileResponse>("/api/profiles/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    state.setData(result);
    return result;
  }

  async function uploadAvatar(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const result = await apiFetch<{ avatar_url: string }>("/api/storage/avatar/upload", {
      method: "POST",
      body: formData,
    });
    await state.refresh();
    return result.avatar_url;
  }

  return {
    profile: state.data?.profile ?? null,
    teacherProfile: state.data?.teacher ?? null,
    roles: state.data?.roles ?? { is_teacher: false, is_student: false },
    loading: state.loading,
    error: state.error,
    refresh: state.refresh,
    updateProfile,
    uploadAvatar,
  };
}
