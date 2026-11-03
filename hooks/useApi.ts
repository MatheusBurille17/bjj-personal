"use client";

import * as React from "react";
import { apiFetch } from "@/lib/api/client";

/** Hook genérico para consultas GET autenticadas. */
export function useApi<T>(path: string | null) {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(Boolean(path));
  const [error, setError] = React.useState<Error | null>(null);

  const refresh = React.useCallback(async () => {
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch<T>(path));
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error("Erro ao carregar dados"));
    } finally {
      setLoading(false);
    }
  }, [path]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh, setData };
}
