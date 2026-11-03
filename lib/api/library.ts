import { apiFetch } from "@/lib/api/client";
import type {
  CreateVideoData,
  LibraryTree,
  ModuleWithCounts,
  TechniqueWithCounts,
  Video,
  VideoWithContext,
} from "@/types/library";

export function getTechniques(includeArchived = false) {
  return apiFetch<TechniqueWithCounts[]>(
    `/api/library/techniques?includeArchived=${includeArchived}`,
  );
}

export function getModules(techniqueId: string, includeArchived = false) {
  return apiFetch<ModuleWithCounts[]>(
    `/api/library/techniques/${techniqueId}/modules?includeArchived=${includeArchived}`,
  );
}

export function getVideos(moduleId: string, includeArchived = false) {
  return apiFetch<Video[]>(
    `/api/library/modules/${moduleId}/videos?includeArchived=${includeArchived}`,
  );
}

export async function getLibraryTree(): Promise<LibraryTree> {
  const techniques = await getTechniques(true);
  const modules: LibraryTree["modules"] = {};
  const videos: LibraryTree["videos"] = {};

  for (const technique of techniques) {
    const techniqueModules = await getModules(technique.id, true);
    modules[technique.id] = techniqueModules;
    for (const moduleRecord of techniqueModules) {
      videos[moduleRecord.id] = await getVideos(moduleRecord.id, true);
    }
  }

  return { techniques, modules, videos };
}

export function searchVideos(search: string) {
  return apiFetch<VideoWithContext[]>(
    `/api/library/search?search=${encodeURIComponent(search)}`,
  );
}

export function createVideo(data: CreateVideoData) {
  return apiFetch<Video>("/api/library/videos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function getPlaybackUrl(videoId: string) {
  return apiFetch<{ playback_url: string }>(`/api/library/videos/${videoId}/playback`);
}
