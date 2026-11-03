import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";

const sessionState = vi.hoisted(() => ({ jar: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      sessionState.jar.has(name)
        ? { name, value: sessionState.jar.get(name) as string }
        : undefined,
    set: (name: string, value: string) => {
      sessionState.jar.set(name, value);
    },
    delete: (name: string) => {
      sessionState.jar.delete(name);
    },
    getAll: () => [],
  }),
}));

vi.mock("@/lib/services/google-drive-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/google-drive-client")>();
  return {
    ...actual,
    ensureFolder: vi.fn(),
    createFolder: vi.fn(),
    findFolder: vi.fn(),
    uploadFile: vi.fn(),
    getFileMetadata: vi.fn(),
    deleteFile: vi.fn(),
    moveFile: vi.fn(),
    updateFileMetadata: vi.fn(),
    listFilesInFolder: vi.fn(),
    listPermissions: vi.fn(),
    createPermission: vi.fn(),
    verifyFileAccess: vi.fn(),
    getDriveAbout: vi.fn(),
  };
});

import { createDemoDatabase, DEMO_IDS } from "@/lib/db/seed";
import { getDb, mutate, resetDb } from "@/lib/db/store";
import * as driveClient from "@/lib/services/google-drive-client";
import {
  createTechniqueFolderIfNeeded,
  createModuleFolderIfNeeded,
  ensureLibraryStructure,
  resetGoogleDriveCache,
} from "@/lib/services/google-drive.service";
import {
  disconnectDriveAccount,
  getDriveConnectionStatus,
  getDriveTokenRecord,
  getValidDriveAccessToken,
  storeDriveTokens,
} from "@/lib/services/google-drive-token.service";
import {
  archiveDriveModuleAssets,
  createDriveVideoRecord,
  getVideoPlayback,
  resetUploadSessions,
  updateVideoForUser,
  uploadLibraryVideo,
  uploadPersonalVideo,
} from "@/lib/services/video-storage.service";
import {
  buildPlaybackUrl,
  createPlaybackToken,
  verifyPlaybackToken,
} from "@/lib/services/playback-token.service";
import { validateVideoFile } from "@/lib/services/video-file-validation";
import { GoogleDriveError, toApiError } from "@/lib/google-drive-errors";
import { ApiError } from "@/lib/middleware/errors";

const SCOPES = "openid email https://www.googleapis.com/auth/drive.file";
const MP4_MAGIC = [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70];

function videoFile(name = "video.mp4", size = 64): File {
  const bytes = new Uint8Array(size);
  bytes.set(MP4_MAGIC, 0);
  return new File([bytes], name, { type: "video/mp4" });
}

function setMocks() {
  let counter = 0;
  vi.mocked(driveClient.ensureFolder).mockImplementation(async (_t, name) => ({
    id: `folder-${name.replace(/\s+/g, "-").toLowerCase()}-${counter}`,
    name,
  }));
  vi.mocked(driveClient.uploadFile).mockImplementation(async (_t, input) => {
    counter += 1;
    return {
      id: `drive-${counter}`,
      name: input.name,
      mimeType: input.mimeType,
      size: String(input.file.size),
      createdTime: new Date().toISOString(),
      modifiedTime: new Date().toISOString(),
      webViewLink: `https://drive.google.com/file/d/drive-${counter}/view`,
      webContentLink: null,
      thumbnailLink: null,
      videoMediaMetadata: { durationMillis: 60_000 },
    };
  });
  vi.mocked(driveClient.getFileMetadata).mockImplementation(async (_t, id) => ({
    id,
    name: "video.mp4",
    mimeType: "video/mp4",
    size: "1024",
    createdTime: new Date().toISOString(),
    modifiedTime: new Date().toISOString(),
    webViewLink: `https://drive.google.com/file/d/${id}/view`,
    webContentLink: null,
    thumbnailLink: null,
    videoMediaMetadata: { durationMillis: 60_000 },
  }));
  vi.mocked(driveClient.moveFile).mockImplementation(async (_t, id) => ({
    id,
    name: "video.mp4",
    mimeType: "video/mp4",
    size: "1024",
    createdTime: new Date().toISOString(),
    modifiedTime: new Date().toISOString(),
    webViewLink: null,
    webContentLink: null,
    thumbnailLink: null,
    videoMediaMetadata: { durationMillis: 60_000 },
  }));
  vi.mocked(driveClient.updateFileMetadata).mockImplementation(
    async (_t, id, input) => ({
      id,
      name: input.name ?? "video.mp4",
      mimeType: "video/mp4",
      size: "1024",
      createdTime: new Date().toISOString(),
      modifiedTime: new Date().toISOString(),
      webViewLink: null,
      webContentLink: null,
      thumbnailLink: null,
      videoMediaMetadata: { durationMillis: 60_000 },
    }),
  );
  vi.mocked(driveClient.verifyFileAccess).mockResolvedValue(true);
  vi.mocked(driveClient.getDriveAbout).mockResolvedValue({
    email: "user@gmail.com",
    displayName: "User",
    driveId: "user@gmail.com",
    storage: { limit: 1000, usage: 100, usageInDrive: 90, usageInDriveTrash: 10 },
  });
  vi.mocked(driveClient.deleteFile).mockResolvedValue(undefined);
  vi.mocked(driveClient.listFilesInFolder).mockResolvedValue({ files: [] });
}

async function storeTokens(userId: string, email = "user@gmail.com", expiresIn = 3600) {
  return storeDriveTokens(userId, {
    accessToken: "ya29.property-access",
    refreshToken: "1//property-refresh",
    expiresIn,
    scope: SCOPES,
    driveId: email,
    googleEmail: email,
  });
}

function clearTokens(userId: string) {
  mutate((db) => {
    db.providers_oauth_tokens = db.providers_oauth_tokens.filter(
      (record) => record.user_id !== userId,
    );
  });
}

beforeEach(() => {
  sessionState.jar.clear();
  resetDb(createDemoDatabase());
  resetGoogleDriveCache();
  resetUploadSessions();
  setMocks();
  // Evita logs extensos durante as 19 propriedades.
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("propriedades — Google Drive Video Storage", () => {
  it("Property 1: OAuth Token Encryption", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 20, maxLength: 200 }),
        async (userId, token) => {
          clearTokens(userId);
          await storeDriveTokens(userId, {
            accessToken: `ya29.${token}`,
            refreshToken: `1//${token}`,
            expiresIn: 3600,
            scope: SCOPES,
            driveId: userId,
            googleEmail: `${userId}@example.com`,
          });
          const record = getDriveTokenRecord(userId)!;
          expect(record.encrypted_access_token).not.toContain(`ya29.${token}`);
          expect(record.encrypted_refresh_token).not.toContain(`1//${token}`);
          await expect(getValidDriveAccessToken(userId)).resolves.toBe(`ya29.${token}`);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 2: Token Refresh on Expiry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (!String(url).includes("oauth2.googleapis.com/token")) {
          throw new Error("URL inesperada");
        }
        return new Response(
          JSON.stringify({
            access_token: "ya29.refreshed-property",
            expires_in: 3600,
            token_type: "Bearer",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({ min: 1, max: 299 }),
        async (userId, expiresIn) => {
          clearTokens(userId);
          await storeTokens(userId, "refresh@example.com", expiresIn);
          await expect(getValidDriveAccessToken(userId)).resolves.toBe(
            "ya29.refreshed-property",
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 3: Playback URL Expiration", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 7200 }), (expiresIn) => {
        const result = createPlaybackToken({
          videoId: "v1",
          userId: "u1",
          provider: "google_drive",
          driveFileId: "d1",
          expiresIn,
        });
        const payload = verifyPlaybackToken(result.token);
        expect(payload?.exp).toBe(payload!.iat + expiresIn);
        expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
      }),
      { numRuns: 100 },
    );
  });

  it("Property 4: Video Upload Creates Database Record", async () => {
    await storeTokens(DEMO_IDS.teacher);
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 2, maxLength: 100 }).filter((t) => t.trim().length >= 2),
        async (title) => {
          const video = await uploadLibraryVideo(DEMO_IDS.teacher, videoFile(), {
            title,
            moduleId: DEMO_IDS.moduleGuardFundamentals,
          });
          expect(video.provider).toBe("google_drive");
          expect(video.provider_video_id).toBeTruthy();
          expect(getDb().videos.some((item) => item.id === video.id)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 5: Folder Structure Hierarchy", async () => {
    await storeTokens(DEMO_IDS.teacher);
    await ensureLibraryStructure(DEMO_IDS.teacher);
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.string({ minLength: 2, maxLength: 40 }).filter((n) => n.trim().length >= 2),
        async (techniqueId, moduleId, name) => {
          const techniqueFolder = await createTechniqueFolderIfNeeded(
            DEMO_IDS.teacher,
            techniqueId,
            `Técnica ${name}`,
          );
          const moduleFolder = await createModuleFolderIfNeeded(
            DEMO_IDS.teacher,
            techniqueId,
            moduleId,
            `Módulo ${name}`,
          );
          expect(techniqueFolder).toBeTruthy();
          expect(moduleFolder).toBeTruthy();
          const mapping = getDb().drive_folder_mappings.find(
            (item) => item.folder_type === "module" && item.entity_id === moduleId,
          );
          expect(mapping?.parent_folder_id).toBe(techniqueFolder);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 6: Permission Verification Before Playback", async () => {
    await storeTokens(DEMO_IDS.teacher);
    const video = await uploadLibraryVideo(DEMO_IDS.teacher, videoFile(), {
      title: "Permissão",
      moduleId: DEMO_IDS.moduleGuardFundamentals,
    });
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (allowed) => {
        resetGoogleDriveCache();
        vi.mocked(driveClient.verifyFileAccess).mockResolvedValue(allowed);
        if (allowed) {
          await expect(
            getVideoPlayback(video.id, DEMO_IDS.lucas, "student"),
          ).resolves.toBeTruthy();
        } else {
          await expect(
            getVideoPlayback(video.id, DEMO_IDS.lucas, "student"),
          ).rejects.toMatchObject({ status: 403 });
        }
      }),
      { numRuns: 100 },
    );
  });

  it("Property 7: File Format Validation", async () => {
    const supported = ["mp4", "mov", "webm", "avi", "mkv", "flv", "wmv"];
    const magicFor = (extension: string): Uint8Array => {
      const bytes = new Uint8Array(32);
      switch (extension) {
        case "mp4":
        case "mov":
          bytes.set(MP4_MAGIC, 0);
          break;
        case "webm":
        case "mkv":
          bytes.set([0x1a, 0x45, 0xdf, 0xa3], 0);
          break;
        case "avi":
          bytes.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20], 0);
          break;
        case "flv":
          bytes.set([0x46, 0x4c, 0x56], 0);
          break;
        case "wmv":
          bytes.set(
            [
              0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9,
              0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c,
            ],
            0,
          );
          break;
      }
      return bytes;
    };

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...supported),
        fc.string({ minLength: 1, maxLength: 20 }),
        async (extension, name) => {
          const bytes = magicFor(extension);
          const result = await validateVideoFile(
            new File(
              [bytes.buffer as ArrayBuffer],
              `${name.replace(/\.[^.]+$/, "")}.${extension}`,
              { type: "video/mp4" },
            ),
          );
          expect(result.valid).toBe(true);
          const invalid = await validateVideoFile(
            new File([bytes.buffer as ArrayBuffer], `${name}.txt`, { type: "text/plain" }),
          );
          expect(invalid.valid).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 8: Metadata Extraction on Upload", async () => {
    await storeTokens(DEMO_IDS.teacher);
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 30, max: 3600 }),
        async (duration) => {
          vi.mocked(driveClient.uploadFile).mockResolvedValueOnce({
            id: `duration-${duration}`,
            name: "video.mp4",
            mimeType: "video/mp4",
            size: "2048",
            createdTime: new Date().toISOString(),
            modifiedTime: new Date().toISOString(),
            webViewLink: null,
            webContentLink: null,
            thumbnailLink: null,
            videoMediaMetadata: { durationMillis: duration * 1000 },
          });
          const video = await uploadLibraryVideo(DEMO_IDS.teacher, videoFile(), {
            title: "Duração",
            moduleId: DEMO_IDS.moduleGuardFundamentals,
          });
          expect(video.duration_seconds).toBe(duration);
          expect(video.size_bytes).toBe(2048);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 9: Access Audit Logging", async () => {
    await storeTokens(DEMO_IDS.teacher);
    const video = await uploadLibraryVideo(DEMO_IDS.teacher, videoFile(), {
      title: "Auditoria",
      moduleId: DEMO_IDS.moduleGuardFundamentals,
    });
    await fc.assert(
      fc.asyncProperty(
        fc.ipV4(),
        fc.string({ minLength: 1, maxLength: 80 }),
        async (ip, userAgent) => {
          await getVideoPlayback(video.id, DEMO_IDS.teacher, "teacher", {
            ip,
            userAgent,
          });
          const log = getDb()
            .video_access_audit.filter(
              (item) => item.video_id === video.id && item.ip_address === ip,
            )
            .at(-1);
          expect(log).toMatchObject({
            video_id: video.id,
            user_id: DEMO_IDS.teacher,
            ip_address: ip,
            user_agent: userAgent,
            action: "playback",
          });
          expect(log?.accessed_at).toBeTruthy();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 10: Token Disconnection Cleanup", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (userId) => {
        await storeTokens(userId);
        expect(getDriveTokenRecord(userId)).toBeTruthy();
        await disconnectDriveAccount(userId);
        expect(getDriveTokenRecord(userId)).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it("Property 11: Hybrid Provider Support", async () => {
    await storeTokens(DEMO_IDS.teacher);
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("google_drive", "mux", "demo"),
        async (provider) => {
          const video = createDriveVideoRecord({
            ownerId: DEMO_IDS.teacher,
            ownerRole: "teacher",
            visibility: "library",
            moduleId: DEMO_IDS.moduleGuardFundamentals,
            title: `Hybrid ${provider}`,
            providerVideoId: `provider-${provider}-${Math.random()}`,
            driveFileId: "drive-hybrid",
            sizeBytes: 10,
            durationSeconds: 10,
          });
          if (provider !== "google_drive") {
            mutate((db) => {
              const record = db.videos.find((item) => item.id === video.id);
              if (record) {
                record.provider = provider;
                record.playback_url = "https://example.com/video.mp4";
              }
            });
          }
          const result = await getVideoPlayback(
            video.id,
            DEMO_IDS.teacher,
            "teacher",
          );
          expect(result.provider).toBe(provider);
          expect(result.playback_url).toBeTruthy();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 12: Retry with Exponential Backoff", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 2 }), async (failures) => {
        let calls = 0;
        vi.stubGlobal(
          "fetch",
          vi.fn(async () => {
            calls += 1;
            if (calls <= failures) {
              return new Response(JSON.stringify({ error: "transient" }), {
                status: 500,
                headers: { "content-type": "application/json" },
              });
            }
            return new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }),
        );
        const result = await driveClient.driveRequest<{ ok: boolean }>(
          "token",
          "https://www.googleapis.com/drive/v3/files",
        );
        expect(result.ok).toBe(true);
        expect(calls).toBe(failures + 1);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 13: Precondition Check for Student Upload", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), fc.uuid(), async (connected, userId) => {
        clearTokens(userId);
        if (connected) await storeTokens(userId);
        if (connected) {
          await expect(
            uploadPersonalVideo(userId, videoFile(), { title: "Pessoal" }),
          ).resolves.toBeTruthy();
        } else {
          await expect(
            uploadPersonalVideo(userId, videoFile(), { title: "Pessoal" }),
          ).rejects.toMatchObject({ status: 404 });
        }
      }),
      { numRuns: 100 },
    );
  });

  it("Property 14: File Size Limit Enforcement", async () => {
    const max = Number(process.env.GOOGLE_DRIVE_MAX_FILE_BYTES) || 5 * 1024 * 1024 * 1024;
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(max, max + 1),
        async (size) => {
          const result = await validateVideoFile({
            name: "video.mp4",
            size,
            type: "video/mp4",
            slice: () => new Blob([new Uint8Array(MP4_MAGIC)]),
          } as unknown as File);
          if (size > max) {
            expect(result.valid).toBe(false);
            expect(result.code).toBe("file_too_large");
          } else {
            expect(result.valid).toBe(true);
          }
        },
      ),
      { numRuns: 20 },
    );
  });

  it("Property 15: Error Logging Without User Exposure", async () => {
    const codes = [
      "token_expired",
      "permission_denied",
      "not_found",
      "quota_exceeded",
      "rate_limited",
      "timeout",
      "configuration_error",
      "network_error",
      "server_error",
    ] as const;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...codes), async (code) => {
        const internal = new GoogleDriveError(code, {
          details: { internal_secret: "stack-trace-detail" },
        });
        const apiError = toApiError(internal) as ApiError;
        expect(apiError.message).not.toContain("stack-trace-detail");
        expect(apiError.details).toMatchObject({ drive_error: code });
      }),
      { numRuns: 100 },
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("Property 16: Playback URL Generation Under Demand", () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.integer({ min: 1, max: 7200 }),
        fc.integer({ min: 1, max: 1000 }),
        (videoId, expiresIn, offset) => {
          const a = buildPlaybackUrl({
            videoId,
            userId: "user",
            provider: "google_drive",
            driveFileId: "file",
            expiresIn,
            now: Date.now(),
          });
          const b = buildPlaybackUrl({
            videoId,
            userId: "user",
            provider: "google_drive",
            driveFileId: "file",
            expiresIn,
            now: Date.now() + offset * 1000,
          });
          expect(a.playback_url).not.toBe(b.playback_url);
          expect(getDb().videos.every((video) => !video.playback_url?.includes("/embed/"))).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 17: Token Status Display", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), fc.uuid(), async (connected, userId) => {
        clearTokens(userId);
        if (connected) await storeTokens(userId);
        const status = await getDriveConnectionStatus(userId);
        expect(status.connected).toBe(connected);
        if (connected) {
          expect(status.userEmail).toBe("user@gmail.com");
        } else {
          expect(status.userEmail).toBeNull();
        }
      }),
      { numRuns: 100 },
    );
  });

  it("Property 18: Module Archival Preserves Videos", async () => {
    await storeTokens(DEMO_IDS.teacher);
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (moduleId) => {
        const video = createDriveVideoRecord({
          ownerId: DEMO_IDS.teacher,
          ownerRole: "teacher",
          visibility: "library",
          moduleId: DEMO_IDS.moduleGuardFundamentals,
          title: "Arquivar",
          providerVideoId: `archive-${moduleId}`,
          driveFileId: `archive-${moduleId}`,
          sizeBytes: 10,
          durationSeconds: 10,
        });
        mutate((db) => {
          const record = db.videos.find((item) => item.id === video.id);
          if (record) record.module_id = moduleId;
        });
        await archiveDriveModuleAssets(DEMO_IDS.teacher, moduleId);
        const updated = getDb().videos.find((item) => item.id === video.id)!;
        expect(updated.status).toBe("archived");
        expect(updated.archived_at).toBeTruthy();
        expect(driveClient.moveFile).toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  it("Property 19: Metadata Synchronization", async () => {
    await storeTokens(DEMO_IDS.teacher);
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 2, maxLength: 100 }).filter((t) => t.trim().length >= 2),
        fc.string({ minLength: 1, maxLength: 200 }),
        async (title, description) => {
          const video = await uploadLibraryVideo(DEMO_IDS.teacher, videoFile(), {
            title: "Original",
            moduleId: DEMO_IDS.moduleGuardFundamentals,
          });
          const updated = await updateVideoForUser(
            video.id,
            DEMO_IDS.teacher,
            "teacher",
            { title, description },
          );
          expect(updated.title).toBe(title);
          expect(updated.description).toBe(description);
          expect(driveClient.updateFileMetadata).toHaveBeenCalledWith(
            "ya29.property-access",
            video.provider_video_id,
            expect.objectContaining({ name: title }),
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
