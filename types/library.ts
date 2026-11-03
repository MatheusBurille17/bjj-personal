export type TechniqueStatus = "active" | "archived";
export type VideoStatus = "uploading" | "processing" | "ready" | "error" | "archived";

export interface Technique {
  id: string;
  teacher_id: string;
  name: string;
  description: string | null;
  category: string | null;
  sort_order: number;
  status: TechniqueStatus;
  created_at: string;
  updated_at: string;
}

export interface TechniqueWithCounts extends Technique {
  module_count: number;
  video_count: number;
}

export interface Module {
  id: string;
  technique_id: string;
  teacher_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  status: TechniqueStatus;
  created_at: string;
  updated_at: string;
}

export interface ModuleWithCounts extends Module {
  video_count: number;
}

export interface Video {
  id: string;
  teacher_id: string;
  module_id: string;
  technique_id: string;
  title: string;
  description: string | null;
  provider: string;
  provider_video_id: string;
  thumbnail_url: string | null;
  playback_url: string | null;
  duration_seconds: number | null;
  status: VideoStatus;
  created_at: string;
  updated_at: string;
  /** Google Drive / armazenamento de vídeo (opcionais para compatibilidade). */
  owner_id?: string | null;
  owner_role?: "teacher" | "student" | null;
  visibility?: "library" | "personal";
  size_bytes?: number | null;
  drive_file_url?: string | null;
  metadata_synced_at?: string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
  mux_id?: string | null;
}

export interface VideoWithContext extends Video {
  module_name: string;
  technique_name: string;
}

export interface CreateTechniqueData {
  name: string;
  description?: string | null;
  category?: string | null;
  sort_order?: number;
}

export interface UpdateTechniqueData {
  name?: string;
  description?: string | null;
  category?: string | null;
  sort_order?: number;
}

export interface CreateModuleData {
  technique_id: string;
  name: string;
  description?: string | null;
  sort_order?: number;
}

export interface UpdateModuleData {
  name?: string;
  description?: string | null;
  sort_order?: number;
}

export interface CreateVideoData {
  module_id: string;
  title: string;
  description?: string | null;
  provider_video_id?: string;
  thumbnail_url?: string | null;
  duration_seconds?: number | null;
  status?: VideoStatus;
  playback_url?: string | null;
}

export interface UpdateVideoData {
  title?: string;
  description?: string | null;
  thumbnail_url?: string | null;
  duration_seconds?: number | null;
}

export interface LibraryTree {
  techniques: TechniqueWithCounts[];
  modules: Record<string, ModuleWithCounts[]>;
  videos: Record<string, Video[]>;
}

export interface TechniqueAccess {
  id: string;
  teacher_id: string;
  enrollment_id: string;
  technique_id: string | null;
  module_id: string | null;
  video_id: string | null;
  granted_at: string;
  revoked_at: string | null;
}
