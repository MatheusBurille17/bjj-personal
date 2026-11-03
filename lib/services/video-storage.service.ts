import { randomUUID } from "node:crypto";
import type { Video } from "@/types/library";
import type {
  PlaybackUrlResult,
  VideoAccessAuditRecord,
  VideoMigrationJob,
  VideoUploadSession,
} from "@/types/google-drive";
import { ApiError, buildPagination } from "@/lib/middleware/errors";
import { DEMO_VIDEO_URL } from "@/lib/db/seed";
import { buildSignedPlaybackUrl, signMuxPlaybackToken } from "@/lib/mux/playback";
import { isMuxConfigured } from "@/lib/mux/client";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminClientAvailable } from "@/lib/supabase/admin";
import { mapPostgrestError } from "@/lib/supabase/errors";
import {
  createDrivePlaybackUrl,
  createModuleFolderIfNeeded,
  deleteVideoFile,
  folderForUpload,
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
import { createResumableSession, getFileMetadata } from "./google-drive-client";
import { supportedExtensions } from "./video-file-validation";
import { buildPlaybackUrl } from "./playback-token.service";

// Uploads grandes podem levar mais de uma hora em conexões lentas.
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
/** Tamanho de chunk usado pelo navegador (8 MiB). */
const RESUMABLE_CHUNK_SIZE = 8 * 1024 * 1024;
// Um vídeo por requisição mantém o download+upload dentro do tempo/memória da
// Function. O cliente/script repete até o job concluir.
const MIGRATION_BATCH_SIZE = 1;

function nowIso(): string {
  return new Date().toISOString();
}

type Role = "teacher" | "student";

function ownerOf(video: Video): string | null {
  return video.owner_id ?? video.teacher_id ?? null;
}

async function auditClient() {
  return isAdminClientAvailable() ? createAdminClient() : await createClient();
}

async function hasDriveToken(userId: string): Promise<boolean> {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return Boolean(await getSupabaseDriveRecord(userId));
  }
  return Boolean(getDriveTokenRecord(userId));
}

/**
 * Busca um vídeo respeitando o RLS. Se um professor não conseguir ver um vídeo
 * pessoal de um aluno, tenta via service role e valida o vínculo de instrutor.
 */
async function fetchVideoForAccess(
  videoId: string,
  userId: string,
  role: Role,
): Promise<Video | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("videos")
    .select("*")
    .eq("id", videoId)
    .maybeSingle();
  if (error) throw mapPostgrestError(error);
  if (data) return data as Video;

  if (role !== "teacher" || !isAdminClientAvailable()) return null;

  const admin = createAdminClient();
  const { data: adminVideo, error: adminError } = await admin
    .from("videos")
    .select("*")
    .eq("id", videoId)
    .maybeSingle();
  if (adminError) throw mapPostgrestError(adminError);
  if (!adminVideo || adminVideo.owner_role !== "student" || !adminVideo.owner_id) {
    return null;
  }

  const { data: enrollment, error: enrollmentError } = await supabase
    .from("enrollments")
    .select("id")
    .eq("teacher_id", userId)
    .eq("student_profile_id", adminVideo.owner_id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (enrollmentError) throw mapPostgrestError(enrollmentError);

  return enrollment ? (adminVideo as Video) : null;
}

async function findVideo(videoId: string): Promise<Video> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("videos")
    .select("*")
    .eq("id", videoId)
    .maybeSingle();
  if (error) throw mapPostgrestError(error);
  if (!data) throw ApiError.notFound("Vídeo não encontrado");
  return data as Video;
}

function assertCanModify(video: Video, userId: string): void {
  const owner = ownerOf(video);
  if (!owner || owner !== userId) {
    throw ApiError.forbidden("Acesso negado");
  }
}

async function authorizeVideo(
  videoId: string,
  userId: string,
  role: Role,
  options: { modify?: boolean } = {},
): Promise<Video> {
  const video = await fetchVideoForAccess(videoId, userId, role);
  if (!video) throw ApiError.notFound("Vídeo não encontrado");
  if (video.deleted_at) {
    throw new ApiError(410, "GONE", "Vídeo removido");
  }
  if (options.modify) assertCanModify(video, userId);
  return video;
}

export function canAccessVideo(
  video: Video,
  userId: string,
  role: Role,
): boolean {
  if (video.owner_id === userId || video.teacher_id === userId) return true;
  if (video.deleted_at || video.status === "archived") return false;
  if (video.visibility === "personal") return false;
  // Para vídeos da biblioteca o RLS já autoriza o aluno; esta função é apenas
  // um atalho síncrono usado por componentes/testes.
  return role === "student";
}

export interface CreateDriveVideoInput {
  ownerId: string;
  ownerRole: Role;
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

/** Cria o registro de vídeo com provider=google_drive. */
export async function createDriveVideoRecord(
  input: CreateDriveVideoInput,
): Promise<Video> {
  const supabase = await createClient();
  let teacherId: string | null = null;
  let moduleId: string | null = null;
  let techniqueId: string | null = null;

  if (input.visibility === "library") {
    if (!input.moduleId) {
      throw ApiError.validation("Informe o módulo para vídeos da biblioteca");
    }
    const { data: moduleRecord, error } = await supabase
      .from("modules")
      .select("id, teacher_id, technique_id")
      .eq("id", input.moduleId)
      .maybeSingle();
    if (error) throw mapPostgrestError(error);
    if (!moduleRecord) throw ApiError.notFound("Módulo não encontrado");
    if (moduleRecord.teacher_id !== input.ownerId) {
      throw ApiError.forbidden("Acesso negado");
    }
    teacherId = moduleRecord.teacher_id;
    moduleId = moduleRecord.id;
    techniqueId = moduleRecord.technique_id;
  }

  // Idempotência: se o complete for repetido com o mesmo arquivo, reaproveita
  // o registro já criado em vez de duplicar o vídeo.
  const { data: existing, error: existingError } = await supabase
    .from("videos")
    .select("*")
    .eq("provider", "google_drive")
    .eq("provider_video_id", input.driveFileId)
    .eq("owner_id", input.ownerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw mapPostgrestError(existingError);
  if (existing) return existing as Video;

  const timestamp = nowIso();
  const { data, error } = await supabase
    .from("videos")
    .insert({
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
      owner_id: input.ownerId,
      owner_role: input.ownerRole,
      visibility: input.visibility,
      size_bytes: input.sizeBytes,
      drive_file_url: `https://drive.google.com/file/d/${input.driveFileId}/view`,
      metadata_synced_at: timestamp,
      archived_at: null,
      deleted_at: null,
      mux_id: null,
      updated_at: timestamp,
    })
    .select("*")
    .single();
  if (error) throw mapPostgrestError(error);

  const video = data as Video;
  await recordVideoAccess(video.id, input.ownerId, {
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
  const supabase = await createClient();
  const { data: moduleRecord, error } = await supabase
    .from("modules")
    .select("id, teacher_id, technique_id, status")
    .eq("id", input.moduleId)
    .maybeSingle();
  if (error) throw mapPostgrestError(error);
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
  role: Role,
): Promise<Video> {
  return { ...(await authorizeVideo(videoId, userId, role)) };
}

export async function listUserVideos(
  userId: string,
  role: Role,
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
  void role;
  const supabase = await createClient();
  let query = supabase
    .from("videos")
    .select("*", { count: "exact" })
    .is("deleted_at", null);

  if (filters.visibility) {
    query = query.eq("visibility", filters.visibility);
  }
  if (filters.technique_id) {
    query = query.eq("technique_id", filters.technique_id);
  }
  if (filters.module_id) {
    query = query.eq("module_id", filters.module_id);
  }
  if (filters.archived === true) {
    query = query.or("status.eq.archived,archived_at.not.is.null");
  } else {
    query = query.neq("status", "archived").is("archived_at", null);
  }

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? filters.limit ?? 20;
  const from =
    filters.offset !== undefined ? filters.offset : (page - 1) * pageSize;

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) throw mapPostgrestError(error);

  return {
    videos: (data ?? []) as Video[],
    pagination: buildPagination(count ?? 0, page, pageSize),
  };
}

export async function getVideoPlayback(
  videoId: string,
  userId: string,
  role: Role,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<PlaybackUrlResult & { video: Video }> {
  const video = await authorizeVideo(videoId, userId, role);

  if (video.provider === "google_drive") {
    const ownerUserId = ownerOf(video);
    if (!ownerUserId) {
      throw new ApiError(
        409,
        "CONFLICT",
        "O vídeo não possui um proprietário válido no Drive.",
        { drive_error: "token_expired", requires_reauth: true },
      );
    }

    if (!(await hasDriveToken(ownerUserId))) {
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
    await recordVideoAccess(video.id, userId, {
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

  await recordVideoAccess(video.id, userId, {
    action: "playback",
    success: true,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { provider: video.provider },
  });
  return { ...result, playback_url: legacyUrl, video };
}

export async function recordVideoAccess(
  videoId: string,
  userId: string,
  input: {
    action: VideoAccessAuditRecord["action"];
    success?: boolean;
    ip?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<VideoAccessAuditRecord> {
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

  try {
    const client = await auditClient();
    const { error } = await client.from("video_access_audit").insert({ ...record });
    if (error) throw error;
  } catch (error) {
    console.warn("[video-audit] falha ao persistir acesso", {
      video_id: videoId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return record;
}

export async function listVideoAccessAudit(
  requesterId: string,
  role: Role,
  filters: {
    videoId?: string;
    userId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<{
  logs: VideoAccessAuditRecord[];
  pagination: ReturnType<typeof buildPagination>;
}> {
  void requesterId;
  void role;
  const supabase = await createClient();
  let query = supabase
    .from("video_access_audit")
    .select("*", { count: "exact" })
    .order("accessed_at", { ascending: false });

  if (filters.videoId) query = query.eq("video_id", filters.videoId);
  if (filters.userId) query = query.eq("user_id", filters.userId);
  if (filters.dateFrom) query = query.gte("accessed_at", filters.dateFrom);
  if (filters.dateTo) query = query.lte("accessed_at", filters.dateTo);

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw mapPostgrestError(error);

  return {
    logs: (data ?? []) as VideoAccessAuditRecord[],
    pagination: buildPagination(count ?? 0, page, pageSize),
  };
}

export async function updateVideoForUser(
  videoId: string,
  userId: string,
  role: Role,
  data: { title?: string; description?: string | null },
): Promise<Video> {
  const video = await authorizeVideo(videoId, userId, role, { modify: true });
  const ownerUserId = ownerOf(video);

  if (video.provider === "google_drive" && ownerUserId) {
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

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("videos")
    .update({
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined
        ? { description: data.description }
        : {}),
      metadata_synced_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", videoId)
    .select("*")
    .single();
  if (error) throw mapPostgrestError(error);
  return updated as Video;
}

export async function deleteVideoForUser(
  videoId: string,
  userId: string,
  role: Role,
  options: { hard?: boolean } = {},
): Promise<{ success: boolean; hard: boolean; driveDeleted: boolean }> {
  const video = await authorizeVideo(videoId, userId, role, { modify: true });
  const ownerUserId = ownerOf(video);
  let driveDeleted = false;

  if (options.hard && video.provider === "google_drive" && ownerUserId) {
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

  const timestamp = nowIso();
  const supabase = await createClient();
  const { error } = await supabase
    .from("videos")
    .update({
      deleted_at: timestamp,
      status: "archived",
      archived_at: video.archived_at ?? timestamp,
      updated_at: timestamp,
    })
    .eq("id", videoId);
  if (error) throw mapPostgrestError(error);

  await recordVideoAccess(video.id, userId, {
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
  const video = await findVideo(videoId);
  const ownerUserId = ownerOf(video);
  if (video.provider !== "google_drive" || !ownerUserId) return;

  try {
    const folderId = await getArchiveFolderId(ownerUserId);
    await moveDriveVideo(ownerUserId, video.provider_video_id, folderId);
  } catch (error) {
    console.warn("[google-drive] falha ao mover vídeo para arquivo", {
      video_id: videoId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const supabase = await createClient();
  const timestamp = nowIso();
  const { error } = await supabase
    .from("videos")
    .update({
      archived_at: video.archived_at ?? timestamp,
      status: "archived",
      updated_at: timestamp,
    })
    .eq("id", videoId);
  if (error) throw mapPostgrestError(error);
  void userId;
}

export async function archiveDriveModuleAssets(
  userId: string,
  moduleId: string,
): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("videos")
    .select("id")
    .eq("module_id", moduleId)
    .eq("provider", "google_drive")
    .is("deleted_at", null);
  if (error) throw mapPostgrestError(error);

  for (const video of data ?? []) {
    await archiveDriveVideoAssets(userId, video.id);
  }
}

export async function archiveDriveTechniqueAssets(
  userId: string,
  techniqueId: string,
): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("videos")
    .select("id")
    .eq("technique_id", techniqueId)
    .eq("provider", "google_drive")
    .is("deleted_at", null);
  if (error) throw mapPostgrestError(error);

  for (const video of data ?? []) {
    await archiveDriveVideoAssets(userId, video.id);
  }
}

export async function moveVideoForUser(
  videoId: string,
  userId: string,
  role: Role,
  destination: { destination_module_id?: string; archive?: boolean },
): Promise<{ video: Video; folder_id: string | null }> {
  const video = await authorizeVideo(videoId, userId, role, { modify: true });
  const ownerUserId = ownerOf(video);

  if (video.provider !== "google_drive" || !ownerUserId) {
    throw ApiError.conflict("Apenas vídeos do Google Drive podem ser movidos");
  }

  let destinationFolderId: string;
  let destinationModule: {
    id: string;
    technique_id: string;
  } | null = null;

  if (destination.archive) {
    destinationFolderId = await getArchiveFolderId(ownerUserId);
  } else if (destination.destination_module_id) {
    const supabase = await createClient();
    const { data: moduleRecord, error } = await supabase
      .from("modules")
      .select("id, teacher_id, technique_id, name")
      .eq("id", destination.destination_module_id)
      .maybeSingle();
    if (error) throw mapPostgrestError(error);
    if (!moduleRecord) throw ApiError.notFound("Módulo de destino não encontrado");
    if (moduleRecord.teacher_id !== userId) throw ApiError.forbidden("Acesso negado");

    destinationModule = {
      id: moduleRecord.id,
      technique_id: moduleRecord.technique_id,
    };
    destinationFolderId = await createModuleFolderIfNeeded(
      userId,
      moduleRecord.technique_id,
      moduleRecord.id,
      moduleRecord.name,
    );
  } else {
    throw ApiError.validation("Informe o módulo de destino ou archive=true");
  }

  await moveDriveVideo(
    ownerUserId,
    video.provider_video_id,
    destinationFolderId,
  );

  const timestamp = nowIso();
  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("videos")
    .update({
      ...(destination.archive
        ? { status: "archived", archived_at: timestamp }
        : {
            module_id: destinationModule?.id ?? video.module_id,
            technique_id: destinationModule?.technique_id ?? video.technique_id,
            status: "ready",
            archived_at: null,
          }),
      updated_at: timestamp,
    })
    .eq("id", videoId)
    .select("*")
    .single();
  if (error) throw mapPostgrestError(error);

  return { video: updated as Video, folder_id: destinationFolderId };
}

export async function shareVideoForUser(
  videoId: string,
  userId: string,
  role: Role,
  email: string,
): Promise<void> {
  const video = await authorizeVideo(videoId, userId, role, { modify: true });
  const ownerUserId = ownerOf(video);
  if (video.provider !== "google_drive" || !ownerUserId) {
    throw ApiError.conflict("Compartilhamento disponível apenas para vídeos do Google Drive");
  }

  await shareVideoWithUser(ownerUserId, video.provider_video_id, email);
  await recordVideoAccess(video.id, userId, {
    action: "share",
    success: true,
    metadata: { shared_with: email },
  });
}

export async function refreshVideoMetadata(
  videoId: string,
  userId: string,
  role: Role,
): Promise<Video> {
  const video = await authorizeVideo(videoId, userId, role);
  const ownerUserId = ownerOf(video);
  if (video.provider !== "google_drive" || !ownerUserId) return { ...video };

  const metadata = await getDriveVideoMetadata(
    ownerUserId,
    video.provider_video_id,
  );

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("videos")
    .update({
      ...(metadata.videoMediaMetadata?.durationMillis
        ? {
            duration_seconds: Math.round(
              metadata.videoMediaMetadata.durationMillis / 1000,
            ),
          }
        : {}),
      ...(metadata.size ? { size_bytes: Number(metadata.size) } : {}),
      ...(metadata.thumbnailLink
        ? { thumbnail_url: metadata.thumbnailLink }
        : {}),
      metadata_synced_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", videoId)
    .select("*")
    .single();
  if (error) throw mapPostgrestError(error);
  return updated as Video;
}

/* -------------------------------------------------------------------------- */
/* Upload resumable direto no Drive                                            */
/* -------------------------------------------------------------------------- */

export interface InitializeUploadInput {
  title: string;
  description?: string | null;
  destination: "library" | "personal";
  fileName: string;
  mimeType: string;
  totalBytes: number;
  techniqueId?: string | null;
  moduleId?: string | null;
}

export interface InitializeUploadResult {
  session: VideoUploadSession;
  uploadUrl: string;
}

export async function initializeUploadSession(
  userId: string,
  input: InitializeUploadInput,
): Promise<InitializeUploadResult> {
  if (!Number.isFinite(input.totalBytes) || input.totalBytes <= 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "Arquivo vazio");
  }
  if (input.title.trim().length < 2 || input.title.trim().length > 200) {
    throw ApiError.validation(
      "O título deve ter entre 2 e 200 caracteres",
    );
  }
  if ((input.description ?? "").length > 2000) {
    throw ApiError.validation(
      "A descrição deve ter no máximo 2000 caracteres",
    );
  }

  const extension = input.fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!supportedExtensions().includes(extension)) {
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Formato de arquivo não suportado",
      { drive_error: "invalid_file" },
    );
  }
  const maxBytes =
    Number(process.env.GOOGLE_DRIVE_MAX_FILE_BYTES) || 5 * 1024 * 1024 * 1024;
  if (input.totalBytes > maxBytes) {
    throw new ApiError(413, "FILE_TOO_LARGE", "O arquivo excede o limite de 5GB", {
      drive_error: "file_too_large",
    });
  }

  const supabase = await createClient();
  let techniqueId = input.techniqueId ?? null;
  let moduleId = input.moduleId ?? null;

  if (input.destination === "library") {
    if (!moduleId) {
      throw ApiError.validation("Selecione o módulo de destino");
    }
    const { data: moduleRecord, error } = await supabase
      .from("modules")
      .select("id, teacher_id, technique_id, status")
      .eq("id", moduleId)
      .maybeSingle();
    if (error) throw mapPostgrestError(error);
    if (!moduleRecord) throw ApiError.notFound("Módulo não encontrado");
    if (moduleRecord.teacher_id !== userId) throw ApiError.forbidden("Acesso negado");
    if (moduleRecord.status === "archived") {
      throw ApiError.conflict("Não é possível adicionar vídeos a um módulo arquivado");
    }
    techniqueId = moduleRecord.technique_id;
    moduleId = moduleRecord.id;
  } else {
    techniqueId = null;
    moduleId = null;
  }

  const accessToken = await getValidDriveAccessToken(userId);
  const parentFolderId = await folderForUpload(
    userId,
    input.destination,
    techniqueId,
    moduleId,
  );
  const uploadUrl = await createResumableSession(accessToken, {
    name: input.fileName,
    mimeType: input.mimeType,
    parentId: parentFolderId,
    size: input.totalBytes,
  });

  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const chunkSize = Math.min(input.totalBytes, RESUMABLE_CHUNK_SIZE);
  const totalChunks = Math.max(1, Math.ceil(input.totalBytes / chunkSize));
  const { data, error } = await supabase
    .from("video_upload_sessions")
    .insert({
      user_id: userId,
      destination: input.destination,
      title: input.title,
      description: input.description ?? null,
      technique_id: techniqueId,
      module_id: moduleId,
      file_name: input.fileName,
      mime_type: input.mimeType,
      total_bytes: input.totalBytes,
      chunk_size: chunkSize,
      total_chunks: totalChunks,
      received_chunks: [],
      drive_session_url: uploadUrl,
      status: "initialized",
      expires_at: expiresAt,
    })
    .select("*")
    .single();
  if (error) throw mapPostgrestError(error);

  return { session: data as VideoUploadSession, uploadUrl };
}

export async function getUploadSession(
  userId: string,
  sessionId: string,
): Promise<VideoUploadSession> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("video_upload_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw mapPostgrestError(error);
  if (!data) throw ApiError.notFound("Sessão de upload não encontrada");

  const session = data as VideoUploadSession;
  if (session.status === "completed") return session;
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await supabase
      .from("video_upload_sessions")
      .update({ status: "expired" })
      .eq("id", session.id);
    throw new ApiError(410, "GONE", "Sessão de upload expirada");
  }
  return session;
}

export interface CompleteUploadInput {
  fileId: string;
  size?: number;
  mimeType?: string;
}

export async function completeUploadSession(
  userId: string,
  sessionId: string,
  input: CompleteUploadInput,
): Promise<{ video: Video; session: VideoUploadSession }> {
  if (!input.fileId) {
    throw ApiError.validation("file_id do Google Drive é obrigatório");
  }

  const session = await getUploadSession(userId, sessionId);
  if (session.status === "cancelled") {
    throw ApiError.conflict("Sessão de upload encerrada");
  }
  if (session.status === "completed") {
    // Requisição repetida após sucesso (ex.: resposta perdida): devolve o vídeo
    // já criado em vez de falhar.
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("videos")
      .select("*")
      .eq("provider", "google_drive")
      .eq("provider_video_id", input.fileId)
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      return { video: existing as Video, session };
    }
    throw ApiError.conflict("Sessão de upload encerrada");
  }

  const accessToken = await getValidDriveAccessToken(userId);
  const metadata = await getFileMetadata(accessToken, input.fileId);

  const video = await createDriveVideoRecord({
    ownerId: userId,
    ownerRole: session.destination === "personal" ? "student" : "teacher",
    visibility: session.destination,
    moduleId: session.module_id,
    title: session.title,
    description: session.description,
    providerVideoId: input.fileId,
    driveFileId: input.fileId,
    sizeBytes:
      input.size ??
      (metadata.size ? Number(metadata.size) : session.total_bytes),
    durationSeconds: metadata.videoMediaMetadata?.durationMillis
      ? Math.round(metadata.videoMediaMetadata.durationMillis / 1000)
      : null,
    thumbnailUrl: metadata.thumbnailLink ?? null,
    mimeType: metadata.mimeType ?? input.mimeType ?? session.mime_type,
  });

  const supabase = await createClient();
  const { data: completed, error } = await supabase
    .from("video_upload_sessions")
    .update({
      status: "completed",
      received_chunks: Array.from(
        { length: session.total_chunks },
        (_, index) => index,
      ),
    })
    .eq("id", sessionId)
    .select("*")
    .single();
  if (error) throw mapPostgrestError(error);

  return { video, session: completed as VideoUploadSession };
}

export async function cancelUploadSession(
  userId: string,
  sessionId: string,
): Promise<VideoUploadSession> {
  const session = await getUploadSession(userId, sessionId);
  if (session.status === "completed") return session;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("video_upload_sessions")
    .update({ status: "cancelled" })
    .eq("id", sessionId)
    .select("*")
    .single();
  if (error) throw mapPostgrestError(error);
  return (data as VideoUploadSession) ?? session;
}

/** Compatibilidade com testes antigos. */
export function resetUploadSessions(): void {
  // As sessões agora vivem no Supabase (RLS por usuário).
}

/* -------------------------------------------------------------------------- */
/* Migração Mux → Google Drive (execução sob demanda)                          */
/* -------------------------------------------------------------------------- */

export async function startMigrationJob(
  userId: string,
  videoIds?: string[],
): Promise<VideoMigrationJob> {
  const supabase = await createClient();
  let countQuery = supabase
    .from("videos")
    .select("id", { count: "exact", head: true })
    .eq("provider", "mux")
    .is("deleted_at", null);
  if (videoIds?.length) countQuery = countQuery.in("id", videoIds);

  const { count, error: countError } = await countQuery;
  if (countError) throw mapPostgrestError(countError);

  const { data, error } = await supabase
    .from("video_migration_jobs")
    .insert({
      user_id: userId,
      status: "pending",
      total_videos: count ?? 0,
      processed_videos: 0,
      failed_videos: 0,
      errors: [],
    })
    .select("*")
    .single();
  if (error) throw mapPostgrestError(error);
  return data as VideoMigrationJob;
}

export async function runMigrationJob(
  userId: string,
  jobId: string,
  options: { limit?: number } = {},
): Promise<VideoMigrationJob> {
  const supabase = await createClient();
  const { data: jobData, error: jobError } = await supabase
    .from("video_migration_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();
  if (jobError) throw mapPostgrestError(jobError);
  if (!jobData) throw ApiError.notFound("Job de migração não encontrado");

  let job = jobData as VideoMigrationJob;
  if (job.status === "completed" || job.status === "cancelled") return job;

  const running = await supabase
    .from("video_migration_jobs")
    .update({ status: "running", updated_at: nowIso() })
    .eq("id", jobId)
    .select("*")
    .single();
  if (running.error) throw mapPostgrestError(running.error);
  job = running.data as VideoMigrationJob;

  const limit = Math.max(
    1,
    Math.min(options.limit ?? MIGRATION_BATCH_SIZE, 10),
  );
  let processed = job.processed_videos;
  let failed = job.failed_videos;
  const errors = [...job.errors];

  // Não tenta novamente vídeos que já falharam neste job (evita loop infinito).
  const attemptedIds = Array.from(
    new Set(
      errors
        .map((item) => item.video_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  let videosQuery = supabase
    .from("videos")
    .select("*")
    .eq("provider", "mux")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (attemptedIds.length > 0) {
    videosQuery = videosQuery.not("id", "in", `(${attemptedIds.join(",")})`);
  }

  const { data: videos, error: videosError } = await videosQuery;
  if (videosError) throw mapPostgrestError(videosError);

  for (const raw of (videos ?? []) as Video[]) {
    try {
      if (!raw.module_id) {
        throw new Error("Vídeo sem módulo de destino");
      }
      const source = raw.playback_url ?? DEMO_VIDEO_URL;
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`Falha ao baixar do Mux: ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const file = new File([buffer], `${raw.title}.mp4`, { type: "video/mp4" });
      const uploaded = await uploadVideoFile(userId, file, {
        destination: "library",
        techniqueId: raw.technique_id,
        moduleId: raw.module_id,
      });

      const { error: updateError } = await supabase
        .from("videos")
        .update({
          mux_id: raw.provider_video_id,
          provider: "google_drive",
          provider_video_id: uploaded.fileId,
          drive_file_url: `https://drive.google.com/file/d/${uploaded.fileId}/view`,
          size_bytes: uploaded.size,
          duration_seconds: uploaded.durationSeconds ?? raw.duration_seconds,
          thumbnail_url: uploaded.thumbnailUrl ?? raw.thumbnail_url,
          metadata_synced_at: nowIso(),
          status: "ready",
          updated_at: nowIso(),
        })
        .eq("id", raw.id);
      if (updateError) throw mapPostgrestError(updateError);

      await recordVideoAccess(raw.id, userId, {
        action: "migrate",
        success: true,
        metadata: { from: "mux", to: "google_drive" },
      });
      processed += 1;
    } catch (error) {
      failed += 1;
      errors.push({
        video_id: raw.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const remaining = Math.max(
    0,
    job.total_videos - processed - failed,
  );

  const status: VideoMigrationJob["status"] =
    remaining === 0
      ? processed === 0 && failed > 0
        ? "failed"
        : "completed"
      : "running";

  const { data: updated, error: updateJobError } = await supabase
    .from("video_migration_jobs")
    .update({
      status,
      processed_videos: processed,
      failed_videos: failed,
      errors,
      updated_at: nowIso(),
    })
    .eq("id", jobId)
    .select("*")
    .single();
  if (updateJobError) throw mapPostgrestError(updateJobError);
  return updated as VideoMigrationJob;
}

export async function getMigrationJob(
  userId: string,
  jobId: string,
): Promise<VideoMigrationJob> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("video_migration_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw mapPostgrestError(error);
  if (!data) throw ApiError.notFound("Job de migração não encontrado");
  return data as VideoMigrationJob;
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
