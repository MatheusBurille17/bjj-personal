import type {
  DriveConnectionStatus,
  DriveFileMetadata,
  DriveFolderMapping,
  DriveFolderType,
  DriveUploadResult,
  PlaybackUrlResult,
  VideoStorageConfig,
} from "@/types/google-drive";
import { ApiError } from "@/lib/middleware/errors";
import { createClient } from "@/lib/supabase/server";
import { mapPostgrestError } from "@/lib/supabase/errors";
import {
  createPermission,
  deleteFile,
  ensureFolder,
  getDriveAbout,
  getFileMetadata,
  listFilesInFolder,
  moveFile,
  updateFileMetadata,
  uploadFile,
  verifyFileAccess,
} from "./google-drive-client";
import {
  disconnectDriveAccount,
  getDriveConnectionStatus,
  getValidDriveAccessToken,
} from "./google-drive-token.service";
import { validateVideoFile } from "./video-file-validation";
import { buildPlaybackUrl } from "./playback-token.service";

const METADATA_TTL_MS = 24 * 60 * 60 * 1000;
const PERMISSION_TTL_MS = 60 * 60 * 1000;
const LIST_TTL_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const metadataCache = new Map<string, CacheEntry<DriveFileMetadata>>();
const permissionCache = new Map<string, CacheEntry<boolean>>();
const listCache = new Map<string, CacheEntry<{ files: DriveFileMetadata[]; nextPageToken?: string }>>();

export function resetGoogleDriveCache(): void {
  metadataCache.clear();
  permissionCache.clear();
  listCache.clear();
}

function cached<T>(
  map: Map<string, CacheEntry<T>>,
  key: string,
): T | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    map.delete(key);
    return null;
  }
  return entry.value;
}

function putCache<T>(
  map: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttl: number,
): void {
  map.set(key, { value, expiresAt: Date.now() + ttl });
}

export function getRootFolderName(): string {
  return process.env.GOOGLE_DRIVE_FOLDER_ROOT || "Plataforma de Treinamento";
}

async function getConfig(userId: string): Promise<VideoStorageConfig | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("video_storage_config")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw mapPostgrestError(error);
  return (data as VideoStorageConfig | null) ?? null;
}

function mappingEntityId(entityId?: string | null): string {
  // O índice único (user_id, folder_type, entity_id) não lida bem com NULL.
  return entityId ?? "";
}

async function findMapping(
  userId: string,
  folderType: DriveFolderType,
  entityId?: string | null,
): Promise<DriveFolderMapping | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drive_folder_mappings")
    .select("*")
    .eq("user_id", userId)
    .eq("folder_type", folderType)
    .eq("entity_id", mappingEntityId(entityId))
    .maybeSingle();
  if (error) throw mapPostgrestError(error);
  return (data as DriveFolderMapping | null) ?? null;
}

async function storeMapping(input: {
  userId: string;
  folderType: DriveFolderType;
  entityId?: string | null;
  name: string;
  folderId: string;
  parentId?: string | null;
}): Promise<DriveFolderMapping> {
  const supabase = await createClient();
  const entityId = mappingEntityId(input.entityId);
  const existing = await findMapping(input.userId, input.folderType, input.entityId);

  if (existing) {
    const { data, error } = await supabase
      .from("drive_folder_mappings")
      .update({
        folder_name: input.name,
        google_drive_folder_id: input.folderId,
        parent_folder_id: input.parentId ?? null,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw mapPostgrestError(error);
    return data as DriveFolderMapping;
  }

  const { data, error } = await supabase
    .from("drive_folder_mappings")
    .insert({
      user_id: input.userId,
      folder_type: input.folderType,
      entity_id: entityId,
      folder_name: input.name,
      google_drive_folder_id: input.folderId,
      parent_folder_id: input.parentId ?? null,
    })
    .select("*")
    .single();
  if (error) throw mapPostgrestError(error);
  return data as DriveFolderMapping;
}

async function upsertConfig(
  userId: string,
  folders: {
    root: string;
    library: string;
    archive: string;
    personal?: string | null;
  },
): Promise<VideoStorageConfig> {
  const supabase = await createClient();
  const timestamp = new Date().toISOString();
  const existing = await getConfig(userId);

  if (existing) {
    const { data, error } = await supabase
      .from("video_storage_config")
      .update({
        root_folder_id: folders.root,
        library_folder_id: folders.library,
        archive_folder_id: folders.archive,
        personal_folder_id: folders.personal ?? existing.personal_folder_id,
        last_sync_at: timestamp,
        updated_at: timestamp,
      })
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error) throw mapPostgrestError(error);
    return data as VideoStorageConfig;
  }

  const { data, error } = await supabase
    .from("video_storage_config")
    .insert({
      user_id: userId,
      provider: "google_drive",
      root_folder_id: folders.root,
      library_folder_id: folders.library,
      archive_folder_id: folders.archive,
      personal_folder_id: folders.personal ?? null,
      last_sync_at: timestamp,
      updated_at: timestamp,
    })
    .select("*")
    .single();
  if (error) throw mapPostgrestError(error);
  return data as VideoStorageConfig;
}

async function markSync(userId: string): Promise<void> {
  const supabase = await createClient();
  const timestamp = new Date().toISOString();
  const { error } = await supabase
    .from("video_storage_config")
    .update({ last_sync_at: timestamp, updated_at: timestamp })
    .eq("user_id", userId);
  if (error) throw mapPostgrestError(error);
}

/**
 * Cria (ou recupera) a estrutura raiz:
 * Plataforma de Treinamento/Biblioteca, /Arquivo e /Vídeos Pessoais.
 * Idempotente por nome/pai.
 */
export async function ensureLibraryStructure(userId: string): Promise<{
  rootFolderId: string;
  libraryFolderId: string;
  archiveFolderId: string;
  personalFolderId: string;
}> {
  const accessToken = await getValidDriveAccessToken(userId);
  const rootName = getRootFolderName();

  const cachedConfig = await getConfig(userId);
  if (
    cachedConfig?.root_folder_id &&
    cachedConfig.library_folder_id &&
    cachedConfig.archive_folder_id &&
    cachedConfig.personal_folder_id
  ) {
    return {
      rootFolderId: cachedConfig.root_folder_id,
      libraryFolderId: cachedConfig.library_folder_id,
      archiveFolderId: cachedConfig.archive_folder_id,
      personalFolderId: cachedConfig.personal_folder_id,
    };
  }

  const root = await ensureFolder(accessToken, rootName);
  const library = await ensureFolder(accessToken, "Biblioteca", root.id);
  const archive = await ensureFolder(accessToken, "Arquivo", root.id);
  const personal = await ensureFolder(accessToken, "Vídeos Pessoais");

  const config = await upsertConfig(userId, {
    root: root.id,
    library: library.id,
    archive: archive.id,
    personal: personal.id,
  });

  await storeMapping({
    userId,
    folderType: "root",
    name: rootName,
    folderId: root.id,
  });
  await storeMapping({
    userId,
    folderType: "library",
    name: "Biblioteca",
    folderId: library.id,
    parentId: root.id,
  });
  await storeMapping({
    userId,
    folderType: "archive",
    name: "Arquivo",
    folderId: archive.id,
    parentId: root.id,
  });
  await storeMapping({
    userId,
    folderType: "personal",
    name: "Vídeos Pessoais",
    folderId: personal.id,
  });

  return {
    rootFolderId: config.root_folder_id,
    libraryFolderId: config.library_folder_id,
    archiveFolderId: config.archive_folder_id,
    personalFolderId: config.personal_folder_id ?? personal.id,
  };
}

export async function createTechniqueFolderIfNeeded(
  userId: string,
  techniqueId: string,
  techniqueName: string,
): Promise<string> {
  const mapping = await findMapping(userId, "technique", techniqueId);
  if (mapping) return mapping.google_drive_folder_id;

  const accessToken = await getValidDriveAccessToken(userId);
  const structure = await ensureLibraryStructure(userId);
  const folder = await ensureFolder(
    accessToken,
    techniqueName,
    structure.libraryFolderId,
  );
  await storeMapping({
    userId,
    folderType: "technique",
    entityId: techniqueId,
    name: techniqueName,
    folderId: folder.id,
    parentId: structure.libraryFolderId,
  });
  return folder.id;
}

export async function createModuleFolderIfNeeded(
  userId: string,
  techniqueId: string,
  moduleId: string,
  moduleName: string,
): Promise<string> {
  const mapping = await findMapping(userId, "module", moduleId);
  if (mapping) return mapping.google_drive_folder_id;

  const supabase = await createClient();
  const { data: technique } = await supabase
    .from("techniques")
    .select("name")
    .eq("id", techniqueId)
    .maybeSingle();

  const accessToken = await getValidDriveAccessToken(userId);
  const techniqueFolderId = await createTechniqueFolderIfNeeded(
    userId,
    techniqueId,
    technique?.name ?? "Técnica",
  );
  const folder = await ensureFolder(accessToken, moduleName, techniqueFolderId);
  await storeMapping({
    userId,
    folderType: "module",
    entityId: moduleId,
    name: moduleName,
    folderId: folder.id,
    parentId: techniqueFolderId,
  });
  return folder.id;
}

export async function getArchiveFolderId(userId: string): Promise<string> {
  const structure = await ensureLibraryStructure(userId);
  return structure.archiveFolderId;
}

export async function folderForUpload(
  userId: string,
  destination: "library" | "personal",
  techniqueId?: string | null,
  moduleId?: string | null,
): Promise<string> {
  if (destination === "personal") {
    const structure = await ensureLibraryStructure(userId);
    return structure.personalFolderId;
  }

  const supabase = await createClient();

  if (moduleId) {
    const { data: moduleRecord } = await supabase
      .from("modules")
      .select("id, name, technique_id")
      .eq("id", moduleId)
      .maybeSingle();
    if (moduleRecord) {
      return createModuleFolderIfNeeded(
        userId,
        moduleRecord.technique_id,
        moduleRecord.id,
        moduleRecord.name,
      );
    }
  }

  if (techniqueId) {
    const { data: technique } = await supabase
      .from("techniques")
      .select("name")
      .eq("id", techniqueId)
      .maybeSingle();
    return createTechniqueFolderIfNeeded(
      userId,
      techniqueId,
      technique?.name ?? "Técnica",
    );
  }

  const structure = await ensureLibraryStructure(userId);
  return structure.libraryFolderId;
}

/** Valida e envia o arquivo diretamente para a pasta correta do Drive. */
export async function uploadVideoFile(
  userId: string,
  file: File,
  options: {
    destination: "library" | "personal";
    techniqueId?: string | null;
    moduleId?: string | null;
  },
): Promise<DriveUploadResult> {
  const validation = await validateVideoFile(file);
  if (!validation.valid) {
    if (validation.code === "file_too_large") {
      throw new ApiError(413, "FILE_TOO_LARGE", validation.message ?? "Arquivo muito grande", {
        drive_error: "file_too_large",
      });
    }
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", validation.message ?? "Formato inválido", {
      drive_error: "invalid_file",
    });
  }

  const accessToken = await getValidDriveAccessToken(userId);
  const parentFolderId = await folderForUpload(
    userId,
    options.destination,
    options.techniqueId,
    options.moduleId,
  );

  const uploaded = await uploadFile(accessToken, {
    name: file.name,
    mimeType: validation.mimeType ?? file.type ?? "video/mp4",
    parentId: parentFolderId,
    file,
  });

  let metadata = uploaded;
  if (!uploaded.videoMediaMetadata?.durationMillis) {
    try {
      metadata = await getFileMetadata(accessToken, uploaded.id);
    } catch {
      metadata = uploaded;
    }
  }

  const result: DriveUploadResult = {
    fileId: metadata.id,
    fileName: metadata.name,
    size: metadata.size ? Number(metadata.size) : file.size,
    mimeType: metadata.mimeType,
    createdAt: metadata.createdTime ?? new Date().toISOString(),
    durationSeconds: metadata.videoMediaMetadata?.durationMillis
      ? Math.round(metadata.videoMediaMetadata.durationMillis / 1000)
      : null,
    webViewLink: metadata.webViewLink ?? null,
    thumbnailUrl: metadata.thumbnailLink ?? null,
  };

  putCache(metadataCache, `${userId}:${result.fileId}`, metadata, METADATA_TTL_MS);
  await markSync(userId);
  return result;
}

export async function getVideoMetadata(
  userId: string,
  fileId: string,
): Promise<DriveFileMetadata> {
  const cacheKey = `${userId}:${fileId}`;
  const cachedValue = cached(metadataCache, cacheKey);
  if (cachedValue) return cachedValue;

  const accessToken = await getValidDriveAccessToken(userId);
  const metadata = await getFileMetadata(accessToken, fileId);
  putCache(metadataCache, cacheKey, metadata, METADATA_TTL_MS);
  return metadata;
}

export async function checkPermission(
  userId: string,
  ownerUserId: string,
  fileId: string,
): Promise<boolean> {
  if (userId === ownerUserId) return true;
  const cacheKey = `${ownerUserId}:${fileId}:${userId}`;
  const cachedValue = cached(permissionCache, cacheKey);
  if (cachedValue !== null) return cachedValue;

  const supabase = await createClient();
  const { data: requester } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  const email = requester?.email;
  if (!email) return false;

  const accessToken = await getValidDriveAccessToken(ownerUserId);
  const allowed = await verifyFileAccess(accessToken, fileId, email);
  putCache(permissionCache, cacheKey, allowed, PERMISSION_TTL_MS);
  return allowed;
}

export async function createDrivePlaybackUrl(input: {
  videoId: string;
  requesterId: string;
  ownerUserId: string;
  driveFileId: string;
  expiresIn?: number;
}): Promise<PlaybackUrlResult> {
  const allowed = await checkPermission(
    input.requesterId,
    input.ownerUserId,
    input.driveFileId,
  );
  if (!allowed) {
    throw new ApiError(403, "FORBIDDEN", "Você não tem permissão para acessar este vídeo", {
      drive_error: "permission_denied",
    });
  }

  return buildPlaybackUrl({
    videoId: input.videoId,
    userId: input.requesterId,
    provider: "google_drive",
    driveFileId: input.driveFileId,
    expiresIn: input.expiresIn ?? 3600,
  });
}

export async function updateDriveFileMetadata(
  userId: string,
  fileId: string,
  input: { name?: string; description?: string | null },
): Promise<DriveFileMetadata> {
  const accessToken = await getValidDriveAccessToken(userId);
  const metadata = await updateFileMetadata(accessToken, fileId, input);
  putCache(
    metadataCache,
    `${userId}:${fileId}`,
    metadata,
    METADATA_TTL_MS,
  );
  return metadata;
}

export async function deleteVideoFile(
  userId: string,
  fileId: string,
): Promise<void> {
  const accessToken = await getValidDriveAccessToken(userId);
  await deleteFile(accessToken, fileId);
  metadataCache.delete(`${userId}:${fileId}`);
  permissionCache.forEach((_value, key) => {
    if (key.includes(fileId)) permissionCache.delete(key);
  });
}

export async function moveVideo(
  userId: string,
  fileId: string,
  destinationFolderId: string,
  currentParentId?: string | null,
): Promise<DriveFileMetadata> {
  const accessToken = await getValidDriveAccessToken(userId);
  const moved = await moveFile(
    accessToken,
    fileId,
    destinationFolderId,
    currentParentId,
  );
  metadataCache.delete(`${userId}:${fileId}`);
  return moved;
}

export async function listVideosInFolder(
  userId: string,
  folderId: string,
  options: { pageSize?: number; pageToken?: string } = {},
): Promise<{ files: DriveFileMetadata[]; nextPageToken?: string }> {
  const cacheKey = `${userId}:${folderId}:${options.pageToken ?? ""}`;
  const cachedValue = cached(listCache, cacheKey);
  if (cachedValue) return cachedValue;
  const accessToken = await getValidDriveAccessToken(userId);
  const result = await listFilesInFolder(accessToken, folderId, options);
  putCache(listCache, cacheKey, result, LIST_TTL_MS);
  return result;
}

export async function shareVideoWithUser(
  userId: string,
  fileId: string,
  email: string,
): Promise<void> {
  const accessToken = await getValidDriveAccessToken(userId);
  await createPermission(accessToken, fileId, email);
  permissionCache.clear();
}

export async function getDriveStatus(
  userId: string,
  options: { includeStorage?: boolean } = {},
): Promise<DriveConnectionStatus> {
  return getDriveConnectionStatus(userId, options);
}

export async function disconnectDrive(
  userId: string,
): Promise<{ success: boolean; revoked: boolean }> {
  const result = await disconnectDriveAccount(userId);
  resetGoogleDriveCache();
  return result;
}

export async function getDriveStorage(
  userId: string,
): Promise<{ email: string; storage: DriveConnectionStatus["storage"] }> {
  const accessToken = await getValidDriveAccessToken(userId);
  const about = await getDriveAbout(accessToken);
  return { email: about.email, storage: about.storage };
}

/** Garante que a pasta de módulo exista e retorna os IDs úteis. */
export async function ensureModuleStorage(
  userId: string,
  techniqueId: string,
  techniqueName: string,
  moduleId: string,
  moduleName: string,
): Promise<{
  techniqueFolderId: string;
  moduleFolderId: string;
  archiveFolderId: string;
}> {
  const techniqueFolderId = await createTechniqueFolderIfNeeded(
    userId,
    techniqueId,
    techniqueName,
  );
  const moduleFolderId = await createModuleFolderIfNeeded(
    userId,
    techniqueId,
    moduleId,
    moduleName,
  );
  const archiveFolderId = await getArchiveFolderId(userId);
  return { techniqueFolderId, moduleFolderId, archiveFolderId };
}


