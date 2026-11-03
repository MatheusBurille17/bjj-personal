/**
 * Tipos da integração de armazenamento de vídeos no Google Drive.
 *
 * Tokens nunca são expostos ao cliente: apenas status, e-mail, drive_id e
 * quotas são retornados pela API.
 */

export type GoogleDriveProvider = "google_drive" | "mux" | "demo";

export type DriveFolderType =
  | "root"
  | "library"
  | "technique"
  | "module"
  | "archive"
  | "personal";

export interface DriveOAuthTokenRecord {
  id: string;
  user_id: string;
  provider: "google_drive";
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  token_iv: string;
  expires_at: string;
  scope: string;
  drive_id: string;
  google_email: string;
  created_at: string;
  updated_at: string;
}

export interface DriveOAuthTokenInput {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
  driveId: string;
  googleEmail: string;
}

export interface DriveConnectionStatus {
  connected: boolean;
  userEmail: string | null;
  driveId: string | null;
  expiresAt: string | null;
  lastSync: string | null;
  scope: string | null;
  storage: DriveStorageQuota | null;
}

export interface DriveStorageQuota {
  limit: number | null;
  usage: number | null;
  usageInDrive: number | null;
  usageInDriveTrash: number | null;
}

export interface VideoStorageConfig {
  id: string;
  user_id: string;
  provider: "google_drive";
  root_folder_id: string;
  library_folder_id: string;
  archive_folder_id: string;
  personal_folder_id: string | null;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DriveFolderMapping {
  id: string;
  user_id: string;
  folder_type: DriveFolderType;
  entity_id: string | null;
  folder_name: string;
  google_drive_folder_id: string;
  parent_folder_id: string | null;
  created_at: string;
}

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  size: number | string | null;
  createdTime: string | null;
  modifiedTime: string | null;
  webViewLink: string | null;
  webContentLink: string | null;
  thumbnailLink: string | null;
  durationMillis?: number | null;
  videoMediaMetadata?: {
    durationMillis?: number;
    width?: number;
    height?: number;
  };
  parents?: string[];
}

export interface DriveFolder {
  id: string;
  name: string;
  parents?: string[];
}

export interface DriveUploadResult {
  fileId: string;
  fileName: string;
  size: number;
  mimeType: string;
  createdAt: string;
  durationSeconds: number | null;
  webViewLink: string | null;
  thumbnailUrl: string | null;
}

export interface DrivePermission {
  id: string;
  type: string;
  role: string;
  emailAddress?: string;
  displayName?: string;
}

export interface VideoAccessAuditRecord {
  id: string;
  video_id: string;
  user_id: string;
  accessed_at: string;
  ip_address: string | null;
  user_agent: string | null;
  action: "playback" | "share" | "upload" | "delete" | "migrate";
  success: boolean;
  metadata: Record<string, unknown>;
}

export interface VideoUploadSession {
  id: string;
  user_id: string;
  destination: "library" | "personal";
  title: string;
  description: string | null;
  technique_id: string | null;
  module_id: string | null;
  file_name: string;
  mime_type: string;
  total_bytes: number;
  chunk_size: number;
  total_chunks: number;
  received_chunks: number[];
  drive_session_url: string | null;
  status: "initialized" | "uploading" | "completed" | "cancelled" | "expired";
  created_at: string;
  expires_at: string;
}

export interface VideoMigrationJob {
  id: string;
  user_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  total_videos: number;
  processed_videos: number;
  failed_videos: number;
  errors: Array<{ video_id: string; message: string }>;
  created_at: string;
  updated_at: string;
}

export interface PlaybackUrlResult {
  playback_url: string;
  expires_at: string;
  expires_in: number;
  provider: GoogleDriveProvider;
  video_id: string;
}

export interface VideoPlaybackTokenPayload {
  videoId: string;
  userId: string;
  provider: GoogleDriveProvider;
  driveFileId: string;
  exp: number;
  iat: number;
}

export type GoogleDriveErrorCode =
  | "token_expired"
  | "permission_denied"
  | "not_found"
  | "quota_exceeded"
  | "rate_limited"
  | "timeout"
  | "invalid_file"
  | "file_too_large"
  | "configuration_error"
  | "network_error"
  | "circuit_open"
  | "server_error";

export interface VideoUploadInput {
  file: File;
  destination: "library" | "personal";
  title: string;
  description?: string | null;
  technique_id?: string | null;
  module_id?: string | null;
}

export interface VideoFileValidationResult {
  valid: boolean;
  code?: "invalid_file" | "file_too_large";
  message?: string;
  extension?: string;
  mimeType?: string;
}
