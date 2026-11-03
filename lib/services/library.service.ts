import { randomUUID } from "node:crypto";
import type {
  Module,
  ModuleWithCounts,
  Technique,
  TechniqueAccess,
  TechniqueWithCounts,
  Video,
  VideoStatus,
  VideoWithContext,
} from "@/types/library";
import type {
  CreateModuleInput,
  CreateTechniqueInput,
  CreateVideoInput,
  UpdateModuleInput,
  UpdateTechniqueInput,
  UpdateVideoInput,
} from "@/lib/validation/library";
import { getDb, mutate, nowIso } from "@/lib/db/store";
import { ApiError, buildPagination, paginate } from "@/lib/middleware/errors";
import { DEMO_VIDEO_URL } from "@/lib/db/seed";
import { buildSignedPlaybackUrl } from "@/lib/mux/playback";
import { isMuxConfigured } from "@/lib/mux/client";

function ownedTechnique(techniqueId: string, teacherId: string): Technique {
  const technique = getDb().techniques.find((item) => item.id === techniqueId);
  if (!technique) throw ApiError.notFound("Técnica não encontrada");
  if (technique.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");
  return technique;
}

function ownedModule(moduleId: string, teacherId: string): Module {
  const moduleRecord = getDb().modules.find((item) => item.id === moduleId);
  if (!moduleRecord) throw ApiError.notFound("Módulo não encontrado");
  if (moduleRecord.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");
  return moduleRecord;
}

function ownedVideo(videoId: string, teacherId: string): Video {
  const video = getDb().videos.find((item) => item.id === videoId);
  if (!video) throw ApiError.notFound("Vídeo não encontrado");
  if (video.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");
  return video;
}

function nextSortOrder(items: Array<{ sort_order: number }>): number {
  return items.reduce((max, item) => Math.max(max, item.sort_order), 0) + 1;
}

/* -------------------------------------------------------------------------- */
/* Técnicas                                                                    */
/* -------------------------------------------------------------------------- */

export function getTechniques(
  teacherId: string,
  options: { includeArchived?: boolean; page?: number; pageSize?: number } = {},
): { techniques: TechniqueWithCounts[]; pagination: ReturnType<typeof buildPagination> } {
  const db = getDb();
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;

  let techniques = db.techniques.filter((item) => item.teacher_id === teacherId);
  if (!options.includeArchived) {
    techniques = techniques.filter((item) => item.status === "active");
  }
  techniques = techniques.sort((a, b) => a.sort_order - b.sort_order);

  const withCounts: TechniqueWithCounts[] = techniques.map((technique) => {
    const modules = db.modules.filter((item) => item.technique_id === technique.id);
    const videos = db.videos.filter((video) => video.technique_id === technique.id);
    return {
      ...technique,
      module_count: modules.length,
      video_count: videos.length,
    };
  });

  return {
    techniques: paginate(withCounts, page, pageSize),
    pagination: buildPagination(withCounts.length, page, pageSize),
  };
}

export function getLibraryTree(
  teacherId: string,
  includeArchived = false,
): {
  techniques: TechniqueWithCounts[];
  modules: Record<string, ModuleWithCounts[]>;
  videos: Record<string, Video[]>;
} {
  const all = getTechniques(teacherId, { pageSize: 100, includeArchived }).techniques;
  const modules: Record<string, ModuleWithCounts[]> = {};
  const videos: Record<string, Video[]> = {};

  for (const technique of all) {
    const techniqueModules = getModules(technique.id, teacherId, includeArchived);
    modules[technique.id] = techniqueModules;
    for (const moduleRecord of techniqueModules) {
      videos[moduleRecord.id] = getVideos(moduleRecord.id, teacherId, includeArchived);
    }
  }

  return { techniques: all, modules, videos };
}

export function createTechnique(teacherId: string, data: CreateTechniqueInput): Technique {
  const db = getDb();
  const timestamp = nowIso();
  const technique: Technique = {
    id: randomUUID(),
    teacher_id: teacherId,
    name: data.name,
    description: data.description ?? null,
    category: data.category ?? null,
    sort_order:
      data.sort_order ??
      nextSortOrder(db.techniques.filter((item) => item.teacher_id === teacherId)),
    status: "active",
    created_at: timestamp,
    updated_at: timestamp,
  };

  mutate((database) => {
    database.techniques.push(technique);
  });
  return technique;
}

export function updateTechnique(
  techniqueId: string,
  teacherId: string,
  data: UpdateTechniqueInput,
): Technique {
  ownedTechnique(techniqueId, teacherId);
  return mutate((db) => {
    const technique = db.techniques.find((item) => item.id === techniqueId);
    if (!technique) throw ApiError.notFound("Técnica não encontrada");
    if (data.name !== undefined) technique.name = data.name;
    if (data.description !== undefined) technique.description = data.description;
    if (data.category !== undefined) technique.category = data.category;
    if (data.sort_order !== undefined) technique.sort_order = data.sort_order;
    technique.updated_at = nowIso();
    return { ...technique };
  });
}

export function reorderTechniques(
  teacherId: string,
  items: Array<{ id: string; sort_order: number }>,
): void {
  for (const item of items) ownedTechnique(item.id, teacherId);
  mutate((db) => {
    for (const item of items) {
      const technique = db.techniques.find((record) => record.id === item.id);
      if (technique) {
        technique.sort_order = item.sort_order;
        technique.updated_at = nowIso();
      }
    }
  });
}

/** Arquiva a técnica e cascateia para módulos e vídeos (Requisito 5). */
export function archiveTechnique(techniqueId: string, teacherId: string): Technique {
  ownedTechnique(techniqueId, teacherId);
  return mutate((db) => {
    const technique = db.techniques.find((item) => item.id === techniqueId);
    if (!technique) throw ApiError.notFound("Técnica não encontrada");
    const timestamp = nowIso();
    technique.status = "archived";
    technique.updated_at = timestamp;

    const moduleIds = db.modules
      .filter((item) => item.technique_id === techniqueId)
      .map((item) => item.id);
    for (const moduleRecord of db.modules.filter((item) => item.technique_id === techniqueId)) {
      moduleRecord.status = "archived";
      moduleRecord.updated_at = timestamp;
    }
    for (const video of db.videos.filter((item) => moduleIds.includes(item.module_id))) {
      video.status = "archived";
      video.updated_at = timestamp;
    }
    return { ...technique };
  });
}

/** Reativa apenas a técnica; filhos permanecem arquivados (Requisito 6). */
export function unarchiveTechnique(techniqueId: string, teacherId: string): Technique {
  const technique = ownedTechnique(techniqueId, teacherId);
  if (technique.status === "active") {
    throw ApiError.conflict("Esta técnica já está ativa");
  }
  return mutate((db) => {
    const record = db.techniques.find((item) => item.id === techniqueId);
    if (!record) throw ApiError.notFound("Técnica não encontrada");
    record.status = "active";
    record.updated_at = nowIso();
    return { ...record };
  });
}

/* -------------------------------------------------------------------------- */
/* Módulos                                                                     */
/* -------------------------------------------------------------------------- */

export function getModules(
  techniqueId: string,
  teacherId: string,
  includeArchived = false,
): ModuleWithCounts[] {
  ownedTechnique(techniqueId, teacherId);
  const db = getDb();
  let modules = db.modules.filter((item) => item.technique_id === techniqueId);
  if (!includeArchived) modules = modules.filter((item) => item.status === "active");
  return modules
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((moduleRecord) => ({
      ...moduleRecord,
      video_count: db.videos.filter((video) => video.module_id === moduleRecord.id).length,
    }));
}

export function createModule(teacherId: string, data: CreateModuleInput): Module {
  const technique = ownedTechnique(data.technique_id, teacherId);
  if (technique.status === "archived") {
    throw ApiError.conflict("Não é possível adicionar módulos a uma técnica arquivada");
  }
  const db = getDb();
  const timestamp = nowIso();
  const moduleRecord: Module = {
    id: randomUUID(),
    technique_id: data.technique_id,
    teacher_id: teacherId,
    name: data.name,
    description: data.description ?? null,
    sort_order:
      data.sort_order ??
      nextSortOrder(db.modules.filter((item) => item.technique_id === data.technique_id)),
    status: "active",
    created_at: timestamp,
    updated_at: timestamp,
  };

  mutate((database) => {
    database.modules.push(moduleRecord);
  });
  return moduleRecord;
}

export function updateModule(
  moduleId: string,
  teacherId: string,
  data: UpdateModuleInput,
): Module {
  ownedModule(moduleId, teacherId);
  return mutate((db) => {
    const moduleRecord = db.modules.find((item) => item.id === moduleId);
    if (!moduleRecord) throw ApiError.notFound("Módulo não encontrado");
    if (data.name !== undefined) moduleRecord.name = data.name;
    if (data.description !== undefined) moduleRecord.description = data.description;
    if (data.sort_order !== undefined) moduleRecord.sort_order = data.sort_order;
    moduleRecord.updated_at = nowIso();
    return { ...moduleRecord };
  });
}

export function reorderModules(
  teacherId: string,
  items: Array<{ id: string; sort_order: number }>,
): void {
  for (const item of items) ownedModule(item.id, teacherId);
  mutate((db) => {
    for (const item of items) {
      const moduleRecord = db.modules.find((record) => record.id === item.id);
      if (moduleRecord) {
        moduleRecord.sort_order = item.sort_order;
        moduleRecord.updated_at = nowIso();
      }
    }
  });
}

export function moveModule(moduleId: string, teacherId: string, techniqueId: string): Module {
  ownedModule(moduleId, teacherId);
  const target = ownedTechnique(techniqueId, teacherId);
  if (target.status === "archived") {
    throw ApiError.conflict("Não é possível mover módulos para uma técnica arquivada");
  }
  return mutate((db) => {
    const moduleRecord = db.modules.find((item) => item.id === moduleId);
    if (!moduleRecord) throw ApiError.notFound("Módulo não encontrado");
    moduleRecord.technique_id = techniqueId;
    moduleRecord.updated_at = nowIso();
    return { ...moduleRecord };
  });
}

/** Arquiva o módulo e seus vídeos (Requisito 11). */
export function archiveModule(moduleId: string, teacherId: string): Module {
  ownedModule(moduleId, teacherId);
  return mutate((db) => {
    const moduleRecord = db.modules.find((item) => item.id === moduleId);
    if (!moduleRecord) throw ApiError.notFound("Módulo não encontrado");
    const timestamp = nowIso();
    moduleRecord.status = "archived";
    moduleRecord.updated_at = timestamp;
    for (const video of db.videos.filter((item) => item.module_id === moduleId)) {
      video.status = "archived";
      video.updated_at = timestamp;
    }
    return { ...moduleRecord };
  });
}

/* -------------------------------------------------------------------------- */
/* Vídeos                                                                      */
/* -------------------------------------------------------------------------- */

export function getVideos(
  moduleId: string,
  teacherId: string,
  includeArchived = false,
): Video[] {
  ownedModule(moduleId, teacherId);
  return getDb()
    .videos.filter((item) => item.module_id === moduleId)
    .filter((item) => includeArchived || item.status !== "archived")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function createVideo(teacherId: string, data: CreateVideoInput): Video {
  const moduleRecord = ownedModule(data.module_id, teacherId);
  if (moduleRecord.status === "archived") {
    throw ApiError.conflict("Não é possível adicionar vídeos a um módulo arquivado");
  }

  const timestamp = nowIso();
  const status: VideoStatus = data.status ?? "uploading";
  const video: Video = {
    id: randomUUID(),
    teacher_id: teacherId,
    module_id: data.module_id,
    technique_id: moduleRecord.technique_id,
    title: data.title,
    description: data.description ?? null,
    provider: isMuxConfigured() ? "mux" : "demo",
    provider_video_id: data.provider_video_id ?? `demo-${randomUUID()}`,
    thumbnail_url: data.thumbnail_url ?? null,
    playback_url:
      data.playback_url ?? (status === "ready" ? DEMO_VIDEO_URL : null),
    duration_seconds: data.duration_seconds ?? null,
    status,
    created_at: timestamp,
    updated_at: timestamp,
  };

  mutate((db) => {
    db.videos.push(video);
  });
  return video;
}

export function updateVideo(
  videoId: string,
  teacherId: string,
  data: UpdateVideoInput,
): Video {
  ownedVideo(videoId, teacherId);
  return mutate((db) => {
    const video = db.videos.find((item) => item.id === videoId);
    if (!video) throw ApiError.notFound("Vídeo não encontrado");
    if (data.title !== undefined) video.title = data.title;
    if (data.description !== undefined) video.description = data.description;
    if (data.thumbnail_url !== undefined) video.thumbnail_url = data.thumbnail_url;
    if (data.duration_seconds !== undefined) video.duration_seconds = data.duration_seconds;
    video.updated_at = nowIso();
    return { ...video };
  });
}

export function getVideo(videoId: string, teacherId: string): Video {
  return { ...ownedVideo(videoId, teacherId) };
}

export function setVideoStatus(videoId: string, teacherId: string, status: VideoStatus): Video {
  ownedVideo(videoId, teacherId);
  return mutate((db) => {
    const video = db.videos.find((item) => item.id === videoId);
    if (!video) throw ApiError.notFound("Vídeo não encontrado");
    video.status = status;
    if (status === "ready" && !video.playback_url) video.playback_url = DEMO_VIDEO_URL;
    video.updated_at = nowIso();
    return { ...video };
  });
}

export function archiveVideo(videoId: string, teacherId: string): Video {
  ownedVideo(videoId, teacherId);
  return mutate((db) => {
    const video = db.videos.find((item) => item.id === videoId);
    if (!video) throw ApiError.notFound("Vídeo não encontrado");
    video.status = "archived";
    video.updated_at = nowIso();
    return { ...video };
  });
}

/** Impede exclusão quando há referências em planos ou aulas (Requisito 23). */
export function deleteVideo(videoId: string, teacherId: string): void {
  ownedVideo(videoId, teacherId);
  const db = getDb();
  const planReferences = db.plan_day_videos.some((item) => item.video_id === videoId);
  const lessonReferences = db.lesson_videos.some((item) => item.video_id === videoId);

  if (planReferences || lessonReferences) {
    throw ApiError.conflict(
      "Este vídeo está associado a planos ou aulas e não pode ser excluído. Arquive o vídeo para preservar o histórico.",
    );
  }

  mutate((database) => {
    database.videos = database.videos.filter((item) => item.id !== videoId);
  });
}

/** Atualiza o status a partir do webhook do provedor (sem escopo de professor). */
export function applyVideoWebhook(
  providerVideoId: string,
  status: VideoStatus,
  metadata: { thumbnail_url?: string | null; duration_seconds?: number | null } = {},
): boolean {
  const db = getDb();
  const video = db.videos.find((item) => item.provider_video_id === providerVideoId);
  if (!video) return false;

  mutate((database) => {
    const record = database.videos.find((item) => item.id === video.id);
    if (!record) return;
    record.status = status;
    if (metadata.thumbnail_url !== undefined) record.thumbnail_url = metadata.thumbnail_url;
    if (metadata.duration_seconds !== undefined) record.duration_seconds = metadata.duration_seconds;
    if (status === "ready" && !record.playback_url) record.playback_url = DEMO_VIDEO_URL;
    record.updated_at = nowIso();
  });
  return true;
}

export function searchVideos(
  teacherId: string,
  options: { search?: string; includeArchived?: boolean; page?: number; pageSize?: number } = {},
): { videos: VideoWithContext[]; pagination: ReturnType<typeof buildPagination> } {
  const db = getDb();
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  const search = (options.search ?? "").trim().toLowerCase();

  let videos = db.videos.filter((item) => item.teacher_id === teacherId);
  if (!options.includeArchived) videos = videos.filter((item) => item.status !== "archived");
  if (search) videos = videos.filter((item) => item.title.toLowerCase().includes(search));

  const withContext: VideoWithContext[] = videos
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((video) => {
      const moduleRecord = db.modules.find((item) => item.id === video.module_id);
      const technique = db.techniques.find((item) => item.id === video.technique_id);
      return {
        ...video,
        module_name: moduleRecord?.name ?? "Módulo",
        technique_name: technique?.name ?? "Técnica",
      };
    });

  return {
    videos: paginate(withContext, page, pageSize),
    pagination: buildPagination(withContext.length, page, pageSize),
  };
}

/** Gera URL de reprodução para o professor, exigindo status ready. */
export function getTeacherPlaybackUrl(videoId: string, teacherId: string): string {
  const video = ownedVideo(videoId, teacherId);
  if (video.status !== "ready") {
    throw ApiError.conflict("O vídeo ainda não está disponível para reprodução");
  }
  const muxUrl = buildSignedPlaybackUrl(video.provider_video_id);
  const url = muxUrl ?? video.playback_url;
  if (!url) throw ApiError.conflict("URL de reprodução indisponível");
  return url;
}

/* -------------------------------------------------------------------------- */
/* Permissões de biblioteca                                                    */
/* -------------------------------------------------------------------------- */

export function grantTechniqueAccess(
  teacherId: string,
  enrollmentId: string,
  techniqueId: string,
): TechniqueAccess {
  const db = getDb();
  const enrollment = db.enrollments.find((item) => item.id === enrollmentId);
  if (!enrollment) throw ApiError.notFound("Aluno não encontrado");
  if (enrollment.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");
  const technique = ownedTechnique(techniqueId, teacherId);
  if (technique.status === "archived") throw ApiError.conflict("Técnica arquivada");

  const existing = db.student_technique_access.find(
    (item) =>
      item.enrollment_id === enrollmentId &&
      item.technique_id === techniqueId &&
      !item.revoked_at,
  );
  if (existing) throw ApiError.conflict("O aluno já tem acesso a esta técnica");

  const access: TechniqueAccess = {
    id: randomUUID(),
    teacher_id: teacherId,
    enrollment_id: enrollmentId,
    technique_id: techniqueId,
    module_id: null,
    video_id: null,
    granted_at: nowIso(),
    revoked_at: null,
  };
  mutate((database) => {
    database.student_technique_access.push(access);
  });
  return access;
}

export function revokeAccess(accessId: string, teacherId: string): void {
  const access = getDb().student_technique_access.find((item) => item.id === accessId);
  if (!access) throw ApiError.notFound("Permissão não encontrada");
  if (access.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");
  mutate((db) => {
    const record = db.student_technique_access.find((item) => item.id === accessId);
    if (record) record.revoked_at = nowIso();
  });
}

export function getAccessForEnrollment(
  enrollmentId: string,
  teacherId: string,
): Array<TechniqueAccess & { technique_name: string }> {
  const db = getDb();
  const enrollment = db.enrollments.find((item) => item.id === enrollmentId);
  if (!enrollment) throw ApiError.notFound("Aluno não encontrado");
  if (enrollment.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");

  return db.student_technique_access
    .filter((item) => item.enrollment_id === enrollmentId && !item.revoked_at)
    .map((item) => ({
      ...item,
      technique_name:
        db.techniques.find((technique) => technique.id === item.technique_id)?.name ?? "Técnica",
    }));
}
