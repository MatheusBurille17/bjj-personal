"use client";

import * as React from "react";
import { apiFetch, jsonBody } from "@/lib/api/client";
import type { AuthResult, ProfileResponse, ProfileUpdateData, SignupData } from "@/types/auth";

/**
 * Estado de autenticação do cliente. A sessão real é mantida em cookie
 * httpOnly; este hook apenas consulta o perfil e dispara as mutações.
 */
export function useAuth() {
  const [data, setData] = React.useState<ProfileResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiFetch<ProfileResponse>("/api/profiles/me"));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  async function login(email: string, password: string) {
    const result = await apiFetch<AuthResult>("/api/auth/login", jsonBody({ email, password }));
    await refresh();
    return result;
  }

  async function signup(input: SignupData) {
    const result = await apiFetch<AuthResult>("/api/auth/signup", jsonBody(input));
    await refresh();
    return result;
  }

  async function logout() {
    await apiFetch<{ success: boolean }>("/api/auth/logout", { method: "POST" });
    setData(null);
  }

  async function updateProfile(input: ProfileUpdateData) {
    const result = await apiFetch<ProfileResponse>("/api/profiles/me", {
      method: "PATCH",
      ...jsonBody(input),
    });
    setData(result);
    return result;
  }

  async function refreshSession() {
    await apiFetch("/api/auth/refresh", { method: "POST" });
    await refresh();
  }

  return {
    user: data?.profile ?? null,
    profile: data?.profile ?? null,
    teacherProfile: data?.teacher ?? null,
    roles: data?.roles ?? { is_teacher: false, is_student: false },
    loading,
    login,
    signup,
    logout,
    updateProfile,
    refreshSession,
    refresh,
  };
}
