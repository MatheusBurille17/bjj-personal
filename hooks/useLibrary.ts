"use client";

import * as React from "react";
import { useApi } from "./useApi";
import type {
  ModuleWithCounts,
  TechniqueWithCounts,
  Video,
  VideoWithContext,
} from "@/types/library";

/** Técnicas do professor. */
export function useLibrary(includeArchived = false) {
  return useApi<TechniqueWithCounts[]>(
    `/api/library/techniques?includeArchived=${includeArchived}`,
  );
}

/** Módulos de uma técnica. */
export function useModules(techniqueId: string | null, includeArchived = false) {
  return useApi<ModuleWithCounts[]>(
    techniqueId
      ? `/api/library/techniques/${techniqueId}/modules?includeArchived=${includeArchived}`
      : null,
  );
}

/** Vídeos de um módulo. */
export function useVideos(moduleId: string | null, includeArchived = false) {
  return useApi<Video[]>(
    moduleId ? `/api/library/modules/${moduleId}/videos?includeArchived=${includeArchived}` : null,
  );
}

/** Busca global de vídeos com debounce de 300ms. */
export function useVideoSearch(term: string) {
  const [debounced, setDebounced] = React.useState(term);

  React.useEffect(() => {
    const timeout = setTimeout(() => setDebounced(term), 300);
    return () => clearTimeout(timeout);
  }, [term]);

  return useApi<VideoWithContext[]>(
    debounced.trim() ? `/api/library/search?search=${encodeURIComponent(debounced.trim())}` : null,
  );
}
