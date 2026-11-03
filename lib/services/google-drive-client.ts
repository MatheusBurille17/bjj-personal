import type {
  DriveFileMetadata,
  DriveFolder,
  DrivePermission,
  DriveStorageQuota,
} from "@/types/google-drive";
import { GoogleDriveError } from "@/lib/google-drive-errors";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const DEFAULT_TIMEOUT_MS = 30_000;
const FILE_FIELDS =
  "id,name,mimeType,size,createdTime,modifiedTime,webViewLink,webContentLink,thumbnailLink,parents,videoMediaMetadata(durationMillis)";

interface CircuitState {
  failures: number;
  openUntil: number;
}

const circuit: CircuitState = { failures: 0, openUntil: 0 };

function maxRetries(): number {
  const parsed = Number(process.env.GOOGLE_DRIVE_MAX_RETRIES);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 10) : 3;
}

function retryBaseMs(): number {
  const parsed = Number(process.env.GOOGLE_DRIVE_RETRY_BASE_MS);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1_000;
}

function circuitOpenMs(): number {
  const parsed = Number(process.env.GOOGLE_DRIVE_CIRCUIT_BREAKER_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5 * 60 * 1000;
}

export function resetCircuitBreaker(): void {
  circuit.failures = 0;
  circuit.openUntil = 0;
}

export function getCircuitState(): Readonly<CircuitState> {
  return { ...circuit };
}

function assertCircuitClosed(now = Date.now()): void {
  if (circuit.openUntil > now) {
    throw new GoogleDriveError("circuit_open", {
      details: { retry_after_ms: circuit.openUntil - now },
    });
  }
  if (circuit.openUntil > 0) {
    circuit.openUntil = 0;
    circuit.failures = 0;
  }
}

function recordFailure(): void {
  circuit.failures += 1;
  if (circuit.failures >= 5) {
    circuit.openUntil = Date.now() + circuitOpenMs();
  }
}

function recordSuccess(): void {
  circuit.failures = 0;
  circuit.openUntil = 0;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(response: Response): number | null {
  const raw = response.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = new Date(raw).getTime();
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function errorForResponse(
  response: Response,
  payload: Record<string, unknown> | null,
): GoogleDriveError {
  const reason =
    typeof payload?.error === "object" && payload.error
      ? String(
          (payload.error as { errors?: Array<{ reason?: string }> }).errors?.[0]
            ?.reason ?? "",
        )
      : "";

  if (response.status === 401) return new GoogleDriveError("token_expired");
  if (response.status === 403) {
    if (reason.includes("quota") || reason.includes("storageQuota")) {
      return new GoogleDriveError("quota_exceeded");
    }
    return new GoogleDriveError("permission_denied");
  }
  if (response.status === 404) return new GoogleDriveError("not_found");
  if (response.status === 429) return new GoogleDriveError("rate_limited");
  if (response.status >= 500) return new GoogleDriveError("server_error");
  return new GoogleDriveError("server_error", {
    statusCode: response.status,
    details: { reason },
  });
}

interface RequestOptions {
  retries?: number;
  timeoutMs?: number;
  /** Body de upload pode ser grande; não aplicamos timeout curto por padrão. */
  signal?: AbortSignal;
}

/**
 * Executa chamadas ao Google Drive com timeout, retry exponencial e circuit
 * breaker. Erros técnicos são convertidos em `GoogleDriveError`.
 */
export async function driveRequest<T>(
  accessToken: string,
  url: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  assertCircuitClosed();
  const retries = options.retries ?? maxRetries();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: options.signal ?? AbortSignal.timeout(timeoutMs),
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(init.headers ?? {}),
        },
      });

      const text = await response.text();
      const payload = text ? (JSON.parse(text) as Record<string, unknown>) : null;

      if (response.ok) {
        recordSuccess();
        return payload as T;
      }

      const error = errorForResponse(response, payload);
      const transient =
        response.status === 429 || response.status >= 500;
      if (!transient) {
        recordFailure();
        throw error;
      }

      recordFailure();
      lastError = error;
      if (attempt >= retries) throw error;

      const retryAfter = parseRetryAfter(response);
      const delay = retryAfter ?? retryBaseMs() * 2 ** attempt;
      await sleep(delay);
    } catch (caught) {
      if (caught instanceof GoogleDriveError) throw caught;
      if (caught instanceof DOMException && caught.name === "TimeoutError") {
        lastError = new GoogleDriveError("timeout");
      } else {
        lastError = new GoogleDriveError("network_error", {
          message: caught instanceof Error ? caught.message : String(caught),
        });
      }
      recordFailure();
      if (attempt >= retries) throw lastError;
      await sleep(retryBaseMs() * 2 ** attempt);
    }
  }

  throw lastError instanceof GoogleDriveError
    ? lastError
    : new GoogleDriveError("server_error");
}

function escapeQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export async function getDriveAbout(
  accessToken: string,
): Promise<{ email: string; displayName: string; driveId: string; storage: DriveStorageQuota }> {
  const data = await driveRequest<{
    user?: { emailAddress?: string; displayName?: string };
    storageQuota?: {
      limit?: string;
      usage?: string;
      usageInDrive?: string;
      usageInDriveTrash?: string;
    };
  }>(
    accessToken,
    `${DRIVE_API}/about?fields=user(displayName,emailAddress),storageQuota(limit,usage,usageInDrive,usageInDriveTrash)`,
  );
  return {
    email: data.user?.emailAddress ?? "",
    displayName: data.user?.displayName ?? "",
    driveId: data.user?.emailAddress ?? "",
    storage: {
      limit: data.storageQuota?.limit ? Number(data.storageQuota.limit) : null,
      usage: data.storageQuota?.usage ? Number(data.storageQuota.usage) : null,
      usageInDrive: data.storageQuota?.usageInDrive
        ? Number(data.storageQuota.usageInDrive)
        : null,
      usageInDriveTrash: data.storageQuota?.usageInDriveTrash
        ? Number(data.storageQuota.usageInDriveTrash)
        : null,
    },
  };
}

export async function findFolder(
  accessToken: string,
  name: string,
  parentId?: string | null,
): Promise<DriveFolder | null> {
  const clauses = [
    `mimeType='${FOLDER_MIME}'`,
    `name='${escapeQuery(name)}'`,
    "trashed=false",
  ];
  if (parentId) clauses.push(`'${parentId}' in parents`);
  const query = encodeURIComponent(clauses.join(" and "));
  const data = await driveRequest<{ files?: DriveFolder[] }>(
    accessToken,
    `${DRIVE_API}/files?q=${query}&fields=files(id,name,parents)&pageSize=1&spaces=drive`,
  );
  return data.files?.[0] ?? null;
}

export async function createFolder(
  accessToken: string,
  name: string,
  parentId?: string | null,
): Promise<DriveFolder> {
  const body: Record<string, unknown> = { name, mimeType: FOLDER_MIME };
  if (parentId) body.parents = [parentId];
  const data = await driveRequest<DriveFolder>(
    accessToken,
    `${DRIVE_API}/files?fields=id,name,parents`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return data;
}

/** Idempotente: procura pelo nome no pai antes de criar. */
export async function ensureFolder(
  accessToken: string,
  name: string,
  parentId?: string | null,
): Promise<DriveFolder> {
  const existing = await findFolder(accessToken, name, parentId);
  if (existing) return existing;
  return createFolder(accessToken, name, parentId);
}

export async function getFileMetadata(
  accessToken: string,
  fileId: string,
): Promise<DriveFileMetadata> {
  return driveRequest<DriveFileMetadata>(
    accessToken,
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(FILE_FIELDS)}`,
  );
}

export async function listFilesInFolder(
  accessToken: string,
  folderId: string,
  options: { pageSize?: number; pageToken?: string } = {},
): Promise<{ files: DriveFileMetadata[]; nextPageToken?: string }> {
  const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const params = new URLSearchParams({
    q: query,
    fields: "nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,thumbnailLink)",
    pageSize: String(options.pageSize ?? 100),
    spaces: "drive",
  });
  if (options.pageToken) params.set("pageToken", options.pageToken);
  return driveRequest<{ files: DriveFileMetadata[]; nextPageToken?: string }>(
    accessToken,
    `${DRIVE_API}/files?${params.toString()}`,
  );
}

export async function deleteFile(
  accessToken: string,
  fileId: string,
): Promise<void> {
  await driveRequest<unknown>(
    accessToken,
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}`,
    { method: "DELETE" },
  );
}

export async function moveFile(
  accessToken: string,
  fileId: string,
  destinationFolderId: string,
  currentParentId?: string | null,
): Promise<DriveFileMetadata> {
  const params = new URLSearchParams({ addParents: destinationFolderId });
  if (currentParentId) params.set("removeParents", currentParentId);
  return driveRequest<DriveFileMetadata>(
    accessToken,
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?${params.toString()}&fields=${encodeURIComponent(FILE_FIELDS)}`,
    { method: "PATCH" },
  );
}

export async function updateFileMetadata(
  accessToken: string,
  fileId: string,
  input: { name?: string; description?: string | null },
): Promise<DriveFileMetadata> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.description !== undefined) body.description = input.description ?? "";
  return driveRequest<DriveFileMetadata>(
    accessToken,
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(FILE_FIELDS)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export async function listPermissions(
  accessToken: string,
  fileId: string,
): Promise<DrivePermission[]> {
  const data = await driveRequest<{ permissions?: DrivePermission[] }>(
    accessToken,
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions?fields=permissions(id,type,role,emailAddress,displayName)`,
  );
  return data.permissions ?? [];
}

export async function createPermission(
  accessToken: string,
  fileId: string,
  email: string,
  role: "reader" | "commenter" | "writer" = "reader",
): Promise<DrivePermission> {
  return driveRequest<DrivePermission>(
    accessToken,
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=false&fields=id,type,role,emailAddress,displayName`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "user", role, emailAddress: email }),
    },
  );
}

export async function verifyFileAccess(
  accessToken: string,
  fileId: string,
  granteeEmail?: string,
): Promise<boolean> {
  try {
    await getFileMetadata(accessToken, fileId);
    if (!granteeEmail) return true;
    const permissions = await listPermissions(accessToken, fileId);
    return permissions.some(
      (permission) =>
        permission.emailAddress?.toLowerCase() === granteeEmail.toLowerCase(),
    );
  } catch (error) {
    if (error instanceof GoogleDriveError && error.code === "not_found") {
      return false;
    }
    throw error;
  }
}

/**
 * Upload multipart para arquivos pequenos/médios. Para arquivos grandes, use
 * as sessões resumable dos endpoints de chunk.
 */
export async function uploadFile(
  accessToken: string,
  input: {
    name: string;
    mimeType: string;
    parentId: string;
    file: Blob;
  },
): Promise<DriveFileMetadata> {
  const metadata = JSON.stringify({
    name: input.name,
    mimeType: input.mimeType,
    parents: [input.parentId],
  });
  const form = new FormData();
  form.append(
    "metadata",
    new Blob([metadata], { type: "application/json" }),
    "metadata.json",
  );
  form.append("file", input.file, input.name);

  return driveRequest<DriveFileMetadata>(
    accessToken,
    `${UPLOAD_API}/files?uploadType=multipart&fields=${encodeURIComponent(FILE_FIELDS)}`,
    { method: "POST", body: form },
    { timeoutMs: 30 * 60 * 1000, retries: 1 },
  );
}

/** Cria uma sessão resumable do Google Drive (para uploads em chunks). */
export async function createResumableSession(
  accessToken: string,
  input: { name: string; mimeType: string; parentId: string; size: number },
): Promise<string> {
  const response = await fetch(
    `${UPLOAD_API}/files?uploadType=resumable&fields=${encodeURIComponent(FILE_FIELDS)}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json; charset=UTF-8",
        "x-upload-content-type": input.mimeType,
        "x-upload-content-length": String(input.size),
      },
      body: JSON.stringify({
        name: input.name,
        mimeType: input.mimeType,
        parents: [input.parentId],
      }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw errorForResponse(response, null);
  }
  const location = response.headers.get("location");
  if (!location) {
    throw new GoogleDriveError("server_error", {
      message: "Google Drive não retornou a URL da sessão resumable",
    });
  }
  return location;
}

/** Envia bytes completos para uma sessão resumable já criada. */
export async function uploadToResumableSession(
  sessionUrl: string,
  blob: Blob,
  mimeType: string,
): Promise<DriveFileMetadata> {
  const response = await fetch(sessionUrl, {
    method: "PUT",
    headers: {
      "content-type": mimeType,
      "content-length": String(blob.size),
    },
    body: blob,
    signal: AbortSignal.timeout(30 * 60 * 1000),
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  if (!response.ok) throw errorForResponse(response, payload);
  return payload as unknown as DriveFileMetadata;
}

export { FOLDER_MIME };
