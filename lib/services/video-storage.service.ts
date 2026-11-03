import { randomUUID } from "node:crypto";
import type { Video } from "@/types/library";
import type {
  PlaybackUrlResult,
  VideoAccessAuditRecord,
  VideoMigrationJob,
  VideoUploadSession,
} from "@/types/google-drive";
import { getDb, mutate, nowIso } from "@/lib/db/store";
import { ApiError, buildPagination, paginate } from "@/lib/middleware/errors";
import { DEMO_VIDEO_URL } from "@/lib/db/seed";
import { buildSignedPlaybackUrl, signMuxPlaybackToken } from "@/lib/mux/playback";
import { isMuxConfigured } from "@/lib/mux/client";
import {
  createDrivePlaybackUrl,
  createModuleFolderIfNeeded,
  deleteVideoFile,
  getArchiveFolderId,
  getDriveStatus,
  getVideoMetadata as getDriveVideoMetadata,
  listVideosInFolder,
  moveVideo as moveDriveVideo,
  shareVideoWithUser,
  updateDriveFileMetadata,
  uploadVideoFile,
} from "./google-drive.service";
import {
  getDriveTokenRecord,
  getValidDriveAccessToken,
} from "./google-drive-token.service";
import { getSupabaseDriveRecord } from "./google-supabase-token.service";
import { validateVideoFile } from "./video-file-validation";
import { buildPlaybackUrl } from "./playback-token.service";

const CHUNK_SIZE = 5 * 1024 * 1024;
const SESSION_TTL_MS = 60 * 60 * 1000;
const uploadChunks = new Map<string, Map<number, Buffer>>();

export function resetUploadSessions(): void {
  uploadChunks.clear();
  mutate((db) => {
    db.video_upload_sessions = [];
  });
}

function activeEnrollmentIds(studentId: string): string[] {
  return getDb()
    .enrollments.filter(
      (enrollment) =>
        enrollment.student_profile_id === studentId &&
        enrollment.status === "active",
    )
    .map((enrollment) => enrollment.id);
}

function hasTechniqueAccess(studentId: string, techniqueId: string | null): boolean {
  if (!techniqueId) return false;
  const enrollments = activeEnrollmentIds(studentId);
  return getDb().student_technique_access.some(
    (access) =>
      enrollments.includes(access.enrollment_id) &&
      access.technique_id === techniqueId &&
      !access.revoked_at,
  );
}

function hasLessonVideoAccess(studentId: string, videoId: string): boolean {
  const db = getDb();
  const enrollmentIds = new Set(activeEnrollmentIds(studentId));
  const lessonIds = db.lessons
    .filter(
      (lesson) =>
        enrollmentIds.has(lesson.enrollment_id) &&
        (lesson.status === "scheduled" || lesson.status === "completed"),
    )
    .map((lesson) => lesson.id);
  return db.lesson_videos.some(
    (association) =>
      association.video_id === videoId && lessonIds.includes(association.lesson_id),
  );
}

function hasPlanVideoAccess(studentId: string, videoId: string): boolean {
  const db = getDb();
  const enrollmentIds = activeEnrollmentIds(studentId);
  const planIds = db.plan_enrollments
    .filter((association) => enrollmentIds.includes(association.enrollment_id))
    .map((association) => association.monthly_plan_id)
    .filter((planId) =>
      db.monthly_plans.some(
        (plan) => plan.id === planId && plan.status === "published",
      ),
    );
  const dayIds = db.plan_days
    .filter((day) => planIds.includes(day.monthly_plan_id))
    .map((day) => day.id);
  return db.plan_day_videos.some(
    (association) =>
      association.video_id === videoId && dayIds.includes(association.plan_day_id),
  );
}

function isInstructorOf(teacherId: string, studentId: string): boolean {
  return getDb().enrollments.some(
    (enrollment) =>
      enrollment.teacher_id === teacherId &&
      enrollment.student_profile_id === studentId &&
      enrollment.status === "active",
  );
}

export function canAccessVideo(
  video: Video,
  userId: string,
  role: "teacher" | "student",
): boolean {
  if (video.owner_id === userId || video.teacher_id === userId) return true;
  if (video.deleted_at || video.status === "archived") return false;

  if (video.visibility === "personal") {
    if (role === "teacher" && video.owner_id) {
      return isInstructorOf(userId, video.owner_id);
    }
    return video.owner_id === userId;
  }

  if (role === "student") {
    return (
      hasTechniqueAccess(userId, video.technique_id) ||
      hasLessonVideoAccess(userId, video.id) ||
      hasPlanVideoAccess(userId, video.id)
    );
  }

  return false;
}

function findVideo(videoId: string): Video {
  const video = getDb().videos.find((item) => item.id === videoId);
  if (!video) throw ApiError.notFound("Vídeo não encontrado");
  return video;
}

function authorizeVideo(
  videoId: string,
  userId: string,
  role: "teacher" | "student",
  options: { modify?: boolean } = {},
): Video {
  const video = findVideo(videoId);
  if (video.deleted_at) {
    throw new ApiError(410, "GONE", "Vídeo removido");
  }

  if (options.modify) {
    const owner = video.owner_id ?? video.teacher_id;
    if (owner !== userId && role !== "teacher") {
      throw ApiError.forbidden("Acesso negado");
    }
    if (role === "teacher" && video.teacher_id !== userId && video.owner_id !== userId) {
      throw ApiError.forbidden("Acesso negado");
    }
  } else if (!canAccessVideo(video, userId, role)) {
    throw ApiError.forbidden("Você não tem permissão para acessar este vídeo");
  }

  return video;
}

export interface CreateDriveVideoInput {
  ownerId: string;
  ownerRole: "teacher" | "student";
  visibility: "library" | "personal";
  moduleId?: string | null;
  title: string;
  description?: string | null;
  providerVideoId: string;
  driveFileId: string;
  sizeBytes: number;
  durationSeconds: number | null;
  thumbnailUrl?: string | null;
  mimeType?: string;
}

/** Cria o registro de vídeo com provider=google_drive (Propriedade 4). */
export function createDriveVideoRecord(input: CreateDriveVideoInput): Video {
  let teacherId = input.ownerId;
  let moduleId = input.moduleId ?? "";
  let techniqueId = "";

  if (input.visibility === "library") {
    if (!input.moduleId) {
      throw ApiError.validation("Informe o módulo para vídeos da biblioteca");
    }
    const moduleRecord = getDb().modules.find(
      (item) => item.id === input.moduleId,
    );
    if (!moduleRecord) throw ApiError.notFound("Módulo não encontrado");
    if (moduleRecord.teacher_id !== input.ownerId) {
      throw ApiError.forbidden("Acesso negado");
    }
    teacherId = moduleRecord.teacher_id;
    moduleId = moduleRecord.id;
    techniqueId = moduleRecord.technique_id;
  }

  const timestamp = nowIso();
  const video: Video = {
    id: randomUUID(),
    teacher_id: teacherId,
    module_id: moduleId,
    technique_id: techniqueId,
    title: input.title,
    description: input.description ?? null,
    provider: "google_drive",
    provider_video_id: input.driveFileId,
    thumbnail_url: input.thumbnailUrl ?? null,
    playback_url: null,
    duration_seconds: input.durationSeconds,
    status: "ready",
    created_at: timestamp,
    updated_at: timestamp,
    owner_id: input.ownerId,
    owner_role: input.ownerRole,
    visibility: input.visibility,
    size_bytes: input.sizeBytes,
    drive_file_url: `https://drive.google.com/file/d/${input.driveFileId}/view`,
    metadata_synced_at: timestamp,
    archived_at: null,
    deleted_at: null,
    mux_id: null,
  };

  mutate((db) => {
    db.videos.push(video);
  });
  recordVideoAccess(video.id, input.ownerId, {
    action: "upload",
    success: true,
    metadata: {
      provider: "google_drive",
      size_bytes: input.sizeBytes,
      mime_type: input.mimeType ?? null,
    },
  });
  return video;
}

export async function uploadLibraryVideo(
  teacherId: string,
  file: File,
  input: { title: string; description?: string | null; moduleId: string },
): Promise<Video> {
  const moduleRecord = getDb().modules.find((item) => item.id === input.moduleId);
  if (!moduleRecord) throw ApiError.notFound("Módulo não encontrado");
  if (moduleRecord.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");
  if (moduleRecord.status === "archived") {
    throw ApiError.conflict("Não é possível adicionar vídeos a um módulo arquivado");
  }

  const uploaded = await uploadVideoFile(teacherId, file, {
    destination: "library",
    techniqueId: moduleRecord.technique_id,
    moduleId: moduleRecord.id,
  });

  return createDriveVideoRecord({
    ownerId: teacherId,
    ownerRole: "teacher",
    visibility: "library",
    moduleId: moduleRecord.id,
    title: input.title,
    description: input.description ?? null,
    providerVideoId: uploaded.fileId,
    driveFileId: uploaded.fileId,
    sizeBytes: uploaded.size,
    durationSeconds: uploaded.durationSeconds,
    thumbnailUrl: uploaded.thumbnailUrl,
    mimeType: uploaded.mimeType,
  });
}

export async function uploadPersonalVideo(
  userId: string,
  file: File,
  input: { title: string; description?: string | null },
): Promise<Video> {
  const uploaded = await uploadVideoFile(userId, file, {
    destination: "personal",
  });
  return createDriveVideoRecord({
    ownerId: userId,
    ownerRole: "student",
    visibility: "personal",
    title: input.title,
    description: input.description ?? null,
    providerVideoId: uploaded.fileId,
    driveFileId: uploaded.fileId,
    sizeBytes: uploaded.size,
    durationSeconds: uploaded.durationSeconds,
    thumbnailUrl: uploaded.thumbnailUrl,
    mimeType: uploaded.mimeType,
  });
}

export async function getUserVideo(
  videoId: string,
  userId: string,
  role: "teacher" | "student",
): Promise<Video> {
  return { ...authorizeVideo(videoId, userId, role) };
}

export async function listUserVideos(
  userId: string,
  role: "teacher" | "student",
  filters: {
    technique_id?: string;
    module_id?: string;
    archived?: boolean;
    visibility?: "library" | "personal";
    page?: number;
    pageSize?: number;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ videos: Video[]; pagination: ReturnType<typeof buildPagination> }> {
  const db = getDb();
  let videos = db.videos.filter((video) => !video.deleted_at);

  if (filters.visibility) {
    videos = videos.filter(
      (video) => (video.visibility ?? "library") === filters.visibility,
    );
  }
  if (filters.technique_id) {
    videos = videos.filter((video) => video.technique_id === filters.technique_id);
  }
  if (filters.module_id) {
    videos = videos.filter((video) => video.module_id === filters.module_id);
  }
  if (filters.archived === true) {
    videos = videos.filter(
      (video) => video.status === "archived" || Boolean(video.archived_at),
    );
  } else {
    videos = videos.filter(
      (video) => video.status !== "archived" && !video.archived_at,
    );
  }

  if (role === "teacher") {
    videos = videos.filter(
      (video) =>
        video.teacher_id === userId || video.owner_id === userId,
    );
  } else {
    videos = videos.filter((video) => canAccessVideo(video, userId, role));
  }

  videos = videos.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? filters.limit ?? 20;
  const offset = filters.offset;
  const selected =
    offset !== undefined
      ? videos.slice(offset, offset + pageSize)
      : paginate(videos, page, pageSize);

  return {
    videos: selected,
    pagination: buildPagination(videos.length, page, pageSize),
  };
}

export async function getVideoPlayback(
  videoId: string,
  userId: string,
  role: "teacher" | "student",
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<PlaybackUrlResult & { video: Video }> {
  const video = authorizeVideo(videoId, userId, role);

  if (video.provider === "google_drive") {
    const ownerUserId = video.owner_id ?? video.teacher_id;
    const ownerToken = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? await getSupabaseDriveRecord(ownerUserId)
      : getDriveTokenRecord(ownerUserId);
    if (!ownerToken) {
      throw new ApiError(
        409,
        "CONFLICT",
        "A conta do Google Drive deste vídeo não está conectada.",
        { drive_error: "token_expired", requires_reauth: true },
      );
    }

    // Dono/verificação de existência; demais usuários passam pela permissão
    // de compartilhamento do Drive.
    if (userId === ownerUserId || video.teacher_id === userId) {
      await getDriveVideoMetadata(ownerUserId, video.provider_video_id);
    }

    const result = await createDrivePlaybackUrl({
      videoId: video.id,
      requesterId: userId,
      ownerUserId,
      driveFileId: video.provider_video_id,
    });
    recordVideoAccess(video.id, userId, {
      action: "playback",
      success: true,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { provider: "google_drive", expires_in: result.expires_in },
    });
    return { ...result, video };
  }

  if (video.status !== "ready") {
    throw ApiError.conflict("O vídeo ainda não está disponível para reprodução");
  }

  const muxUrl =
    video.provider === "mux"
      ? buildSignedPlaybackUrl(video.provider_video_id)
      : null;
  const legacyUrl = muxUrl ?? video.playback_url;
  if (!legacyUrl) throw ApiError.conflict("URL de reprodução indisponível");

  const result = buildPlaybackUrl({
    videoId: video.id,
    userId,
    provider: video.provider === "mux" ? "mux" : "demo",
    driveFileId: video.provider_video_id,
    expiresIn: video.provider === "mux" ? 86_400 : 3_600,
  });
  // O endpoint de embed resolve providers não-Drive usando este fallback.
  const playback_url = video.provider === "mux" ? legacyUrl : legacyUrl;

  recordVideoAccess(video.id, userId, {
    action: "playback",
    success: true,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { provider: video.provider },
  });
  return { ...result, playback_url, video };
}

export function recordVideoAccess(
  videoId: string,
  userId: string,
  input: {
    action: VideoAccessAuditRecord["action"];
    success?: boolean;
    ip?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown>;
  },
): VideoAccessAuditRecord {
  const record: VideoAccessAuditRecord = {
    id: randomUUID(),
    video_id: videoId,
    user_id: userId,
    accessed_at: nowIso(),
    ip_address: input.ip ?? null,
    user_agent: input.userAgent ?? null,
    action: input.action,
    success: input.success !== false,
    metadata: input.metadata ?? {},
  };
  mutate((db) => {
    db.video_access_audit.push(record);
  });
  return record;
}

export function listVideoAccessAudit(
  requesterId: string,
  role: "teacher" | "student",
  filters: {
    videoId?: string;
    userId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  } = {},
): { logs: VideoAccessAuditRecord[]; pagination: ReturnType<typeof buildPagination> } {
  const db = getDb();
  let logs = db.video_access_audit;

  if (role === "student") {
    logs = logs.filter((log) => log.user_id === requesterId);
  } else {
    const ownVideoIds = new Set(
      db.videos
        .filter(
          (video) =>
            video.teacher_id === requesterId || video.owner_id === requesterId,
        )
        .map((video) => video.id),
    );
    logs = logs.filter(
      (log) => ownVideoIds.has(log.video_id) || log.user_id === requesterId,
    );
  }

  if (filters.videoId) logs = logs.filter((log) => log.video_id === filters.videoId);
  if (filters.userId) logs = logs.filter((log) => log.user_id === filters.userId);
  if (filters.dateFrom) {
    logs = logs.filter((log) => log.accessed_at >= filters.dateFrom!);
  }
  if (filters.dateTo) {
    logs = logs.filter((log) => log.accessed_at <= filters.dateTo!);
  }

  const sorted = [...logs].sort((a, b) =>
    b.accessed_at.localeCompare(a.accessed_at),
  );
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  return {
    logs: paginate(sorted, page, pageSize),
    pagination: buildPagination(sorted.length, page, pageSize),
  };
}

export async function updateVideoForUser(
  videoId: string,
  userId: string,
  role: "teacher" | "student",
  data: { title?: string; description?: string | null },
): Promise<Video> {
  const video = authorizeVideo(videoId, userId, role, { modify: true });
  const ownerUserId = video.owner_id ?? video.teacher_id;

  if (video.provider === "google_drive") {
    try {
      await updateDriveFileMetadata(ownerUserId, video.provider_video_id, {
        name: data.title ?? video.title,
        description: data.description ?? video.description,
      });
    } catch (error) {
      console.warn("[google-drive] falha ao sincronizar metadados", {
        video_id: video.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return mutate((db) => {
    const record = db.videos.find((item) => item.id === videoId);
    if (!record) throw ApiError.notFound("Vídeo não encontrado");
    if (data.title !== undefined) record.title = data.title;
    if (data.description !== undefined) record.description = data.description;
    record.metadata_synced_at = nowIso();
    record.updated_at = nowIso();
    return { ...record };
  });
}

export async function deleteVideoForUser(
  videoId: string,
  userId: string,
  role: "teacher" | "student",
  options: { hard?: boolean } = {},
): Promise<{ success: boolean; hard: boolean; driveDeleted: boolean }> {
  const video = authorizeVideo(videoId, userId, role, { modify: true });
  const ownerUserId = video.owner_id ?? video.teacher_id;
  let driveDeleted = false;

  if (options.hard && video.provider === "google_drive") {
    try {
      await deleteVideoFile(ownerUserId, video.provider_video_id);
      driveDeleted = true;
    } catch (error) {
      console.warn("[google-drive] falha ao deletar arquivo", {
        video_id: video.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  mutate((db) => {
    const record = db.videos.find((item) => item.id === videoId);
    if (!record) return;
    record.deleted_at = nowIso();
    record.status = "archived";
    record.archived_at = record.archived_at ?? nowIso();
    record.updated_at = nowIso();
  });
  recordVideoAccess(video.id, userId, {
    action: "delete",
    success: true,
    metadata: { hard: options.hard === true, drive_deleted: driveDeleted },
  });
  return { success: true, hard: options.hard === true, driveDeleted };
}

export async function archiveDriveVideoAssets(
  userId: string,
  videoId: string,
): Promise<void> {
  const video = findVideo(videoId);
  const ownerUserId = video.owner_id ?? video.teacher_id;
  if (video.provider !== "google_drive") return;

  try {
    const folderId = await getArchiveFolderId(ownerUserId);
    await moveDriveVideo(ownerUserId, video.provider_video_id, folderId);
  } catch (error) {
    console.warn("[google-drive] falha ao mover vídeo para arquivo", {
      video_id: videoId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  mutate((db) => {
    const record = db.videos.find((item) => item.id === videoId);
    if (record) {
      record.archived_at = record.archived_at ?? nowIso();
      record.status = "archived";
      record.updated_at = nowIso();
    }
  });
}

export async function archiveDriveModuleAssets(
  userId: string,
  moduleId: string,
): Promise<void> {
  const videos = getDb().videos.filter(
    (video) => video.module_id === moduleId && video.provider === "google_drive",
  );
  for (const video of videos) {
    await archiveDriveVideoAssets(userId, video.id);
  }
}

export async function archiveDriveTechniqueAssets(
  userId: string,
  techniqueId: string,
): Promise<void> {
  const videos = getDb().videos.filter(
    (video) =>
      video.technique_id === techniqueId && video.provider === "google_drive",
  );
  for (const video of videos) {
    await archiveDriveVideoAssets(userId, video.id);
  }
}

export async function moveVideoForUser(
  videoId: string,
  userId: string,
  role: "teacher" | "student",
  destination: { destination_module_id?: string; archive?: boolean },
): Promise<{ video: Video; folder_id: string | null }> {
  const video = authorizeVideo(videoId, userId, role, { modify: true });
  const ownerUserId = video.owner_id ?? video.teacher_id;

  if (video.provider !== "google_drive") {
    throw ApiError.conflict("Apenas vídeos do Google Drive podem ser movidos");
  }

  let destinationFolderId: string;
  if (destination.archive) {
    destinationFolderId = await getArchiveFolderId(ownerUserId);
  } else if (destination.destination_module_id) {
    const moduleRecord = getDb().modules.find(
      (item) => item.id === destination.destination_module_id,
    );
    if (!moduleRecord) throw ApiError.notFound("Módulo de destino não encontrado");
    if (moduleRecord.teacher_id !== userId) throw ApiError.forbidden("Acesso negado");
    destinationFolderId = await createModuleFolderIfNeeded(
      userId,
      moduleRecord.technique_id,
      moduleRecord.id,
      moduleRecord.name,
    );
  } else {
    throw ApiError.validation("Informe o módulo de destino ou archive=true");
  }

  await moveDriveVideo(ownerUserId, video.provider_video_id, destinationFolderId);

  const updated = mutate((db) => {
    const record = db.videos.find((item) => item.id === videoId);
    if (!record) throw ApiError.notFound("Vídeo não encontrado");
    if (destination.archive) {
      record.status = "archived";
      record.archived_at = nowIso();
    } else if (destination.destination_module_id) {
      const moduleRecord = db.modules.find(
        (item) => item.id === destination.destination_module_id,
      );
      record.module_id = destination.destination_module_id;
      record.technique_id = moduleRecord?.technique_id ?? record.technique_id;
      if (record.status === "archived") record.status = "ready";
      record.archived_at = null;
    }
    record.updated_at = nowIso();
    return { ...record };
  });

  return { video: updated, folder_id: destinationFolderId };
}

export async function shareVideoForUser(
  videoId: string,
  userId: string,
  role: "teacher" | "student",
  email: string,
): Promise<void> {
  const video = authorizeVideo(videoId, userId, role, { modify: true });
  if (video.provider !== "google_drive") {
    throw ApiError.conflict("Compartilhamento disponível apenas para vídeos do Google Drive");
  }
  const ownerUserId = video.owner_id ?? video.teacher_id;
  await shareVideoWithUser(ownerUserId, video.provider_video_id, email);
  recordVideoAccess(video.id, userId, {
    action: "share",
    success: true,
    metadata: { shared_with: email },
  });
}

export async function refreshVideoMetadata(
  videoId: string,
  userId: string,
  role: "teacher" | "student",
): Promise<Video> {
  const video = authorizeVideo(videoId, userId, role);
  if (video.provider !== "google_drive") return { ...video };

  const metadata = await getDriveVideoMetadata(
    video.owner_id ?? video.teacher_id,
    video.provider_video_id,
  );
  return mutate((db) => {
    const record = db.videos.find((item) => item.id === videoId);
    if (!record) throw ApiError.notFound("Vídeo não encontrado");
    if (metadata.videoMediaMetadata?.durationMillis) {
      record.duration_seconds = Math.round(
        metadata.videoMediaMetadata.durationMillis / 1000,
      );
    }
    if (metadata.size) record.size_bytes = Number(metadata.size);
    if (metadata.thumbnailLink) record.thumbnail_url = metadata.thumbnailLink;
    record.metadata_synced_at = nowIso();
    record.updated_at = nowIso();
    return { ...record };
  });
}

/* -------------------------------------------------------------------------- */
/* Upload em chunks                                                            */
/* -------------------------------------------------------------------------- */

export function initializeUploadSession(
  userId: string,
  input: {
    title: string;
    description?: string | null;
    destination: "library" | "personal";
    fileName: string;
    mimeType: string;
    totalBytes: number;
    techniqueId?: string | null;
    moduleId?: string | null;
    chunkSize?: number;
  },
): VideoUploadSession {
  if (input.totalBytes <= 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "Arquivo vazio");
  }
  const maxBytes = Number(process.env.GOOGLE_DRIVE_MAX_FILE_BYTES) || 5 * 1024 * 1024 * 1024;
  if (input.totalBytes > maxBytes) {
    throw new ApiError(413, "FILE_TOO_LARGE", "O arquivo excede o limite de 5GB", {
      drive_error: "file_too_large",
    });
  }

  const chunkSize = input.chunkSize ?? CHUNK_SIZE;
  const totalChunks = Math.max(1, Math.ceil(input.totalBytes / chunkSize));
  const timestamp = nowIso();
  const session: VideoUploadSession = {
    id: randomUUID(),
    user_id: userId,
    destination: input.destination,
    title: input.title,
    description: input.description ?? null,
    technique_id: input.techniqueId ?? null,
    module_id: input.moduleId ?? null,
    file_name: input.fileName,
    mime_type: input.mimeType,
    total_bytes: input.totalBytes,
    chunk_size: chunkSize,
    total_chunks: totalChunks,
    received_chunks: [],
    drive_session_url: null,
    status: "initialized",
    created_at: timestamp,
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  };

  mutate((db) => {
    db.video_upload_sessions.push(session);
  });
  uploadChunks.set(session.id, new Map());
  return session;
}

export function getUploadSession(
  userId: string,
  sessionId: string,
): VideoUploadSession {
  const session = getDb().video_upload_sessions.find(
    (item) => item.id === sessionId,
  );
  if (!session) throw ApiError.notFound("Sessão de upload não encontrada");
  if (session.user_id !== userId) throw ApiError.forbidden("Acesso negado");
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    throw new ApiError(410, "GONE", "Sessão de upload expirada");
  }
  return session;
}

export function appendUploadChunk(
  userId: string,
  sessionId: string,
  chunkIndex: number,
  data: Uint8Array,
): {
  received_chunks: number[];
  total_chunks: number;
  bytes_uploaded: number;
  percentage: number;
  next_chunk: number | null;
} {
  const session = getUploadSession(userId, sessionId);
  if (session.status === "cancelled" || session.status === "completed") {
    throw ApiError.conflict("Sessão de upload encerrada");
  }
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= session.total_chunks) {
    throw ApiError.validation("Índice de chunk inválido");
  }

  const chunks = uploadChunks.get(sessionId) ?? new Map<number, Buffer>();
  chunks.set(chunkIndex, Buffer.from(data));
  uploadChunks.set(sessionId, chunks);

  const received = [...new Set([...session.received_chunks, chunkIndex])].sort(
    (a, b) => a - b,
  );
  const bytesUploaded = received.reduce(
    (total, index) => total + (chunks.get(index)?.length ?? 0),
    0,
  );

  mutate((db) => {
    const record = db.video_upload_sessions.find((item) => item.id === sessionId);
    if (record) {
      record.received_chunks = received;
      record.status = "uploading";
    }
  });

  const next =
    received.length >= session.total_chunks
      ? null
      : Array.from({ length: session.total_chunks }, (_, index) => index).find(
          (index) => !received.includes(index),
        ) ?? null;

  return {
    received_chunks: received,
    total_chunks: session.total_chunks,
    bytes_uploaded: bytesUploaded,
    percentage: Math.min(
      100,
      Math.round((bytesUploaded / session.total_bytes) * 100),
    ),
    next_chunk: next,
  };
}

export async function completeUploadSession(
  userId: string,
  sessionId: string,
): Promise<{ video: Video; session: VideoUploadSession }> {
  const session = getUploadSession(userId, sessionId);
  if (session.received_chunks.length !== session.total_chunks) {
    throw ApiError.validation("Ainda faltam chunks para concluir o upload");
  }
  const chunks = uploadChunks.get(sessionId) ?? new Map<number, Buffer>();
  const buffer = Buffer.concat(
    Array.from({ length: session.total_chunks }, (_, index) => {
      const chunk = chunks.get(index);
      if (!chunk) throw ApiError.validation(`Chunk ${index} ausente`);
      return chunk;
    }),
  );

  const file = new File([buffer], session.file_name, {
    type: session.mime_type,
  });
  const validation = await validateVideoFile(file);
  if (!validation.valid) {
    if (validation.code === "file_too_large") {
      throw new ApiError(413, "FILE_TOO_LARGE", validation.message ?? "Arquivo muito grande");
    }
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", validation.message ?? "Formato inválido");
  }

  const video =
    session.destination === "personal"
      ? await uploadPersonalVideo(userId, file, {
          title: session.title,
          description: session.description,
        })
      : await uploadLibraryVideo(userId, file, {
          title: session.title,
          description: session.description,
          moduleId: session.module_id ?? "",
        });

  const completed = mutate((db) => {
    const record = db.video_upload_sessions.find((item) => item.id === sessionId);
    if (record) {
      record.status = "completed";
      record.received_chunks = Array.from(
        { length: record.total_chunks },
        (_, index) => index,
      );
    }
    return record ? { ...record } : session;
  });
  uploadChunks.delete(sessionId);
  return { video, session: completed };
}

export function cancelUploadSession(
  userId: string,
  sessionId: string,
): VideoUploadSession {
  const session = getUploadSession(userId, sessionId);
  uploadChunks.delete(sessionId);
  return mutate((db) => {
    const record = db.video_upload_sessions.find((item) => item.id === sessionId);
    if (!record) return session;
    record.status = "cancelled";
    return { ...record };
  });
}

/* -------------------------------------------------------------------------- */
/* Migração Mux → Google Drive                                                 */
/* -------------------------------------------------------------------------- */

export function startMigrationJob(
  userId: string,
  videoIds?: string[],
  options: { autoStart?: boolean } = {},
): VideoMigrationJob {
  const videos = getDb().videos.filter(
    (video) =>
      (video.teacher_id === userId || video.owner_id === userId) &&
      video.provider === "mux" &&
      (!videoIds?.length || videoIds.includes(video.id)),
  );
  const timestamp = nowIso();
  const job: VideoMigrationJob = {
    id: randomUUID(),
    user_id: userId,
    status: "pending",
    total_videos: videos.length,
    processed_videos: 0,
    failed_videos: 0,
    errors: [],
    created_at: timestamp,
    updated_at: timestamp,
  };
  mutate((db) => {
    db.video_migration_jobs.push(job);
  });

  // Job assíncrono em processo. Em produção, usar fila (Bull/Redis).
  if (options.autoStart !== false) {
    queueMicrotask(() => {
      void runMigrationJob(job.id);
    });
  }
  return job;
}

export async function runMigrationJob(jobId: string): Promise<VideoMigrationJob> {
  const job = getDb().video_migration_jobs.find((item) => item.id === jobId);
  if (!job) throw ApiError.notFound("Job de migração não encontrado");

  mutate((db) => {
    const record = db.video_migration_jobs.find((item) => item.id === jobId);
    if (record) record.status = "running";
  });

  const videos = getDb().videos.filter(
    (video) =>
      (video.teacher_id === job.user_id || video.owner_id === job.user_id) &&
      video.provider === "mux",
  );

  for (const video of videos) {
    try {
      if (!getDriveTokenRecord(job.user_id)) {
        throw new Error("Google Drive não conectado");
      }
      const source = video.playback_url ?? DEMO_VIDEO_URL;
      const response = await fetch(source);
      if (!response.ok) throw new Error(`Falha ao baixar do Mux: ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      const file = new File([buffer], `${video.title}.mp4`, { type: "video/mp4" });
      const uploaded = await uploadVideoFile(job.user_id, file, {
        destination: "library",
        techniqueId: video.technique_id || null,
        moduleId: video.module_id || null,
      });

      mutate((db) => {
        const record = db.videos.find((item) => item.id === video.id);
        if (!record) return;
        record.mux_id = record.provider_video_id;
        record.provider = "google_drive";
        record.provider_video_id = uploaded.fileId;
        record.drive_file_url = `https://drive.google.com/file/d/${uploaded.fileId}/view`;
        record.size_bytes = uploaded.size;
        record.duration_seconds =
          uploaded.durationSeconds ?? record.duration_seconds;
        record.thumbnail_url = uploaded.thumbnailUrl ?? record.thumbnail_url;
        record.metadata_synced_at = nowIso();
        record.status = "ready";
        record.updated_at = nowIso();
      });
      recordVideoAccess(video.id, job.user_id, {
        action: "migrate",
        success: true,
        metadata: { from: "mux", to: "google_drive" },
      });
      mutate((db) => {
        const record = db.video_migration_jobs.find((item) => item.id === jobId);
        if (record) record.processed_videos += 1;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      mutate((db) => {
        const record = db.video_migration_jobs.find((item) => item.id === jobId);
        if (record) {
          record.failed_videos += 1;
          record.errors.push({ video_id: video.id, message });
        }
      });
    }
  }

  return mutate((db) => {
    const record = db.video_migration_jobs.find((item) => item.id === jobId);
    if (!record) throw ApiError.notFound("Job de migração não encontrado");
    record.status =
      record.processed_videos + record.failed_videos >= record.total_videos
        ? record.failed_videos === record.total_videos
          ? "failed"
          : "completed"
        : "running";
    record.updated_at = nowIso();
    return { ...record };
  });
}

export function getMigrationJob(userId: string, jobId: string): VideoMigrationJob {
  const job = getDb().video_migration_jobs.find((item) => item.id === jobId);
  if (!job) throw ApiError.notFound("Job de migração não encontrado");
  if (job.user_id !== userId) throw ApiError.forbidden("Acesso negado");
  return { ...job };
}

export async function getDriveVideoListing(
  userId: string,
  folderId: string,
  options: { pageSize?: number; pageToken?: string } = {},
) {
  return listVideosInFolder(userId, folderId, options);
}

export async function getVideoStorageStatus(userId: string) {
  return getDriveStatus(userId, { includeStorage: true });
}

export function getVideoProvider(video: Video): string {
  return video.provider;
}

export function getLegacyMuxPlaybackToken(playbackId: string): string | null {
  return signMuxPlaybackToken(playbackId);
}

export { isMuxConfigured, getValidDriveAccessToken };
