import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    getAll: () =>
      [...sessionState.jar.entries()].map(([name, value]) => ({ name, value })),
  }),
}));

vi.mock("@/lib/services/google-drive-client", () => ({
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
  createResumableSession: vi.fn(),
  uploadToResumableSession: vi.fn(),
}));

import { createDemoDatabase, DEMO_IDS } from "@/lib/db/seed";
import { getDb, mutate, resetDb } from "@/lib/db/store";
import * as driveClient from "@/lib/services/google-drive-client";
import {
  ensureLibraryStructure,
  getDriveStatus,
  getDriveStorage,
  resetGoogleDriveCache,
  uploadVideoFile,
} from "@/lib/services/google-drive.service";
import {
  disconnectDriveAccount,
  getDriveConnectionStatus,
  getDriveTokenRecord,
  shouldRefreshDriveToken,
  storeDriveTokens,
} from "@/lib/services/google-drive-token.service";
import { storeGoogleOAuth } from "@/lib/services/google-auth.service";
import {
  appendUploadChunk,
  cancelUploadSession,
  completeUploadSession,
  createDriveVideoRecord,
  deleteVideoForUser,
  getVideoPlayback,
  initializeUploadSession,
  listUserVideos,
  resetUploadSessions,
  runMigrationJob,
  shareVideoForUser,
  startMigrationJob,
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
import { signSession, SESSION_COOKIE } from "@/lib/auth/token";
import { POST as uploadRoute } from "@/app/api/videos/upload/route";
import { GET as listRoute } from "@/app/api/videos/route";
import { GET as playbackRoute } from "@/app/api/videos/[videoId]/playback-url/route";
import { GET as metadataRoute } from "@/app/api/videos/[videoId]/route";
import { GET as auditRoute } from "@/app/api/videos/access-audit/route";
import { POST as initializeUploadRoute } from "@/app/api/videos/upload/initialize/route";
import { POST as chunkRoute } from "@/app/api/videos/upload/[sessionId]/chunk/route";
import { POST as completeUploadRoute } from "@/app/api/videos/upload/[sessionId]/complete/route";
import { POST as cancelUploadRoute } from "@/app/api/videos/upload/[sessionId]/cancel/route";
import {
  DELETE as deleteVideoRoute,
  PATCH as patchVideoRoute,
} from "@/app/api/videos/[videoId]/route";
import { POST as moveVideoRoute } from "@/app/api/videos/[videoId]/move/route";
import { POST as shareVideoRoute } from "@/app/api/videos/[videoId]/share/route";
import { POST as migrateRoute } from "@/app/api/videos/migrate/route";
import { GET as migrationJobRoute } from "@/app/api/videos/migrate/[jobId]/route";
import { POST as authorizeDriveRoute } from "@/app/api/google-drive/oauth/authorize/route";
import { GET as callbackDriveRoute } from "@/app/api/google-drive/oauth/callback/route";
import { GET as statusDriveRoute } from "@/app/api/google-drive/status/route";
import { DELETE as disconnectDriveRoute } from "@/app/api/google-drive/disconnect/route";
import { GET as embedRoute } from "@/app/api/google-drive/embed/[token]/route";

const SCOPES = "openid email https://www.googleapis.com/auth/drive.file";
const DRIVE_FILE = {
  id: "drive-file-1",
  name: "video.mp4",
  mimeType: "video/mp4",
  size: "1048576",
  createdTime: "2026-11-03T10:00:00.000Z",
  modifiedTime: "2026-11-03T10:00:00.000Z",
  webViewLink: "https://drive.google.com/file/d/drive-file-1/view",
  webContentLink: null,
  thumbnailLink: "https://example.com/thumb.jpg",
  durationMillis: 90000,
  videoMediaMetadata: { durationMillis: 90000 },
};

function videoFile(name = "video.mp4", size = 64): File {
  const bytes = new Uint8Array(size);
  bytes.set([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70], 0);
  return new File([bytes], name, { type: "video/mp4" });
}

function makeCredential() {
  return {
    access_token: "ya29.social-access",
    refresh_token: "1//social-refresh",
    expires_in: 3600,
    token_type: "Bearer",
    scope: "openid email https://www.googleapis.com/auth/drive",
  };
}

function apiRequest(path: string, init: RequestInit = {}) {
  return new Request(`http://localhost${path}`, init);
}

async function json(response: Response) {
  return (await response.json()) as any;
}

async function authenticate(
  userId: string = DEMO_IDS.teacher,
  role: "teacher" | "student" = "teacher",
) {
  sessionState.jar.set(
    SESSION_COOKIE,
    await signSession({
      sub: userId,
      role,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
}

async function storeTokens(userId: string, email = "user@gmail.com") {
  return storeDriveTokens(userId, {
    accessToken: "ya29.access",
    refreshToken: "1//refresh",
    expiresIn: 3600,
    scope: SCOPES,
    driveId: email,
    googleEmail: email,
  });
}

function mutateVideo(
  videoId: string,
  update: (video: ReturnType<typeof getDb>["videos"][number]) => void,
) {
  mutate((db) => {
    const video = db.videos.find((item) => item.id === videoId);
    if (video) update(video);
  });
}

function setDriveMocks() {
  let fileCounter = 0;
  vi.mocked(driveClient.ensureFolder).mockImplementation(async (_token, name) => ({
    id: `folder-${name.replace(/\s+/g, "-").toLowerCase()}`,
    name,
  }));
  vi.mocked(driveClient.uploadFile).mockImplementation(async (_token, input) => {
    fileCounter += 1;
    return {
      ...DRIVE_FILE,
      id: `drive-file-${fileCounter}`,
      name: input.name,
      size: String(input.file.size),
    };
  });
  vi.mocked(driveClient.getFileMetadata).mockImplementation(async (_token, id) => ({
    ...DRIVE_FILE,
    id,
  }));
  vi.mocked(driveClient.deleteFile).mockResolvedValue(undefined);
  vi.mocked(driveClient.moveFile).mockImplementation(async (_token, id) => ({
    ...DRIVE_FILE,
    id,
  }));
  vi.mocked(driveClient.updateFileMetadata).mockImplementation(
    async (_token, id, input) => ({
      ...DRIVE_FILE,
      id,
      name: input.name ?? DRIVE_FILE.name,
    }),
  );
  vi.mocked(driveClient.listFilesInFolder).mockResolvedValue({ files: [] });
  vi.mocked(driveClient.createPermission).mockResolvedValue({
    id: "permission-1",
    type: "user",
    role: "reader",
    emailAddress: "aluno@example.com",
  });
  vi.mocked(driveClient.verifyFileAccess).mockResolvedValue(true);
  vi.mocked(driveClient.getDriveAbout).mockResolvedValue({
    email: "user@gmail.com",
    displayName: "User",
    driveId: "user@gmail.com",
    storage: { limit: 1000, usage: 200, usageInDrive: 150, usageInDriveTrash: 10 },
  });
}

beforeEach(() => {
  sessionState.jar.clear();
  resetDb(createDemoDatabase());
  resetGoogleDriveCache();
  resetUploadSessions();
  setDriveMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("validação de arquivos de vídeo", () => {
  it("aceita formatos suportados com magic bytes válidos", async () => {
    await expect(validateVideoFile(videoFile())).resolves.toMatchObject({
      valid: true,
      extension: "mp4",
    });

    const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
    await expect(
      validateVideoFile(new File([webm], "video.webm", { type: "video/webm" })),
    ).resolves.toMatchObject({ valid: true });

    const avi = new Uint8Array(16);
    avi.set([0x52, 0x49, 0x46, 0x46], 0);
    avi.set([0x41, 0x56, 0x49, 0x20], 8);
    await expect(
      validateVideoFile(new File([avi], "video.avi", { type: "video/x-msvideo" })),
    ).resolves.toMatchObject({ valid: true });
  });

  it("rejeita extensão não suportada, arquivo vazio e magic bytes inválidos", async () => {
    await expect(
      validateVideoFile(new File([new Uint8Array([1])], "video.txt", { type: "text/plain" })),
    ).resolves.toMatchObject({ valid: false, code: "invalid_file" });
    await expect(
      validateVideoFile(new File([], "vazio.mp4", { type: "video/mp4" })),
    ).resolves.toMatchObject({ valid: false });
    await expect(
      validateVideoFile(new File([new Uint8Array(32)], "falso.mp4", { type: "video/mp4" })),
    ).resolves.toMatchObject({ valid: false, code: "invalid_file" });
  });
});

describe("tokens e estrutura do Google Drive", () => {
  it("armazena tokens criptografados e retorna status seguro", async () => {
    const record = await storeTokens(DEMO_IDS.teacher);
    expect(record.encrypted_access_token).not.toContain("ya29.access");
    const stored = getDriveTokenRecord(DEMO_IDS.teacher)!;
    expect(stored.token_iv).toContain(":");
    const status = await getDriveConnectionStatus(DEMO_IDS.teacher);
    expect(status.connected).toBe(true);
    expect(status.userEmail).toBe("user@gmail.com");
    expect(JSON.stringify(status)).not.toContain("ya29.access");
    expect(JSON.stringify(status)).not.toContain("1//refresh");
  });

  it("adota os tokens do login social sem pedir um segundo consentimento", async () => {
    await storeGoogleOAuth(DEMO_IDS.lucas, {
      googleProfile: {
        id: "google-social-adopt",
        email: "aluno@bjj.app",
        name: "Aluno",
      },
      credential: makeCredential(),
      scopes: ["openid", "email", "https://www.googleapis.com/auth/drive"],
    });
    // Simula um usuário que conectou o Google antes deste ajuste.
    mutate((db) => {
      db.providers_oauth_tokens = [];
    });

    const adopted = getDriveTokenRecord(DEMO_IDS.lucas);
    expect(adopted?.google_email).toBe("aluno@bjj.app");
    expect(adopted?.encrypted_access_token).not.toContain("ya29.");
    const status = await getDriveConnectionStatus(DEMO_IDS.lucas);
    expect(status.connected).toBe(true);
  });

  it("identifica quando o token precisa renovar", () => {
    expect(shouldRefreshDriveToken(new Date(Date.now() + 60_000).toISOString())).toBe(true);
    expect(shouldRefreshDriveToken(new Date(Date.now() + 10 * 60_000).toISOString())).toBe(false);
  });

  it("cria estrutura raiz, biblioteca, arquivo e vídeos pessoais de forma idempotente", async () => {
    await storeTokens(DEMO_IDS.teacher);
    const first = await ensureLibraryStructure(DEMO_IDS.teacher);
    expect(first.rootFolderId).toBe("folder-plataforma-de-treinamento");
    expect(first.libraryFolderId).toBe("folder-biblioteca");
    expect(first.archiveFolderId).toBe("folder-arquivo");
    expect(first.personalFolderId).toBe("folder-vídeos-pessoais");
    const second = await ensureLibraryStructure(DEMO_IDS.teacher);
    expect(second).toEqual(first);
    expect(getDb().video_storage_config).toHaveLength(1);
  });

  it("expõe status e quota via serviço", async () => {
    await storeTokens(DEMO_IDS.teacher);
    const status = await getDriveStatus(DEMO_IDS.teacher, { includeStorage: true });
    expect(status.storage?.limit).toBe(1000);
    const storage = await getDriveStorage(DEMO_IDS.teacher);
    expect(storage.email).toBe("user@gmail.com");
    expect(storage.storage?.usage).toBe(200);
  });

  it("desconecta e remove os tokens", async () => {
    await storeTokens(DEMO_IDS.teacher);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    const result = await disconnectDriveAccount(DEMO_IDS.teacher);
    expect(result.revoked).toBe(true);
    expect(getDriveTokenRecord(DEMO_IDS.teacher)).toBeNull();
  });
});

describe("upload e registro de vídeos", () => {
  it("faz upload da biblioteca e cria registro google_drive", async () => {
    await storeTokens(DEMO_IDS.teacher);
    const video = await uploadLibraryVideo(DEMO_IDS.teacher, videoFile(), {
      title: "Novo vídeo",
      moduleId: DEMO_IDS.moduleGuardFundamentals,
    });
    expect(video.provider).toBe("google_drive");
    expect(video.provider_video_id).toMatch(/^drive-file-/);
    expect(video.visibility).toBe("library");
    expect(video.duration_seconds).toBe(90);
    expect(video.size_bytes).toBeGreaterThan(0);
    expect(getDb().videos.some((item) => item.id === video.id)).toBe(true);
  });

  it("faz upload pessoal do aluno", async () => {
    await storeTokens(DEMO_IDS.lucas);
    const video = await uploadPersonalVideo(DEMO_IDS.lucas, videoFile(), {
      title: "Meu treino",
    });
    expect(video.visibility).toBe("personal");
    expect(video.owner_id).toBe(DEMO_IDS.lucas);
    expect(video.owner_role).toBe("student");
  });

  it("rejeita upload de arquivo inválido sem chamar o Drive", async () => {
    await storeTokens(DEMO_IDS.teacher);
    await expect(
      uploadVideoFile(DEMO_IDS.teacher, new File([new Uint8Array([1])], "x.txt"), {
        destination: "library",
      }),
    ).rejects.toMatchObject({ status: 415 });
    expect(driveClient.uploadFile).not.toHaveBeenCalled();
  });

  it("cria registro de vídeo da biblioteca com módulo válido", () => {
    const video = createDriveVideoRecord({
      ownerId: DEMO_IDS.teacher,
      ownerRole: "teacher",
      visibility: "library",
      moduleId: DEMO_IDS.moduleGuardFundamentals,
      title: "Vídeo manual",
      providerVideoId: "drive-x",
      driveFileId: "drive-x",
      sizeBytes: 10,
      durationSeconds: 60,
    });
    expect(video.technique_id).toBe(DEMO_IDS.guardPass);
    expect(video.status).toBe("ready");
  });
});

describe("reprodução, auditoria e permissões", () => {
  it("gera URL assinada e registra auditoria para o dono", async () => {
    await storeTokens(DEMO_IDS.teacher);
    const video = await uploadLibraryVideo(DEMO_IDS.teacher, videoFile(), {
      title: "Aula",
      moduleId: DEMO_IDS.moduleGuardFundamentals,
    });
    const result = await getVideoPlayback(video.id, DEMO_IDS.teacher, "teacher", {
      ip: "127.0.0.1",
      userAgent: "vitest",
    });
    expect(result.playback_url).toContain("/api/google-drive/embed/");
    expect(result.expires_in).toBe(3600);
    expect(getDb().video_access_audit.some((log) => log.video_id === video.id)).toBe(true);
  });

  it("permite aluno com acesso à técnica e bloqueia sem acesso", async () => {
    await storeTokens(DEMO_IDS.teacher);
    const video = await uploadLibraryVideo(DEMO_IDS.teacher, videoFile(), {
      title: "Aula",
      moduleId: DEMO_IDS.moduleGuardFundamentals,
    });

    await expect(
      getVideoPlayback(video.id, DEMO_IDS.lucas, "student"),
    ).resolves.toBeTruthy();
    await expect(
      getVideoPlayback(video.id, DEMO_IDS.mariana, "student"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("nega quando o Drive não confirma permissão", async () => {
    await storeTokens(DEMO_IDS.teacher);
    vi.mocked(driveClient.verifyFileAccess).mockResolvedValue(false);
    const video = await uploadLibraryVideo(DEMO_IDS.teacher, videoFile(), {
      title: "Aula",
      moduleId: DEMO_IDS.moduleGuardFundamentals,
    });
    await expect(
      getVideoPlayback(video.id, DEMO_IDS.lucas, "student"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("exige arquivo existente no Drive para o dono", async () => {
    await storeTokens(DEMO_IDS.teacher);
    vi.mocked(driveClient.getFileMetadata).mockRejectedValue(
      Object.assign(new Error("not found"), { code: "not_found" }),
    );
    const video = await uploadLibraryVideo(DEMO_IDS.teacher, videoFile(), {
      title: "Aula",
      moduleId: DEMO_IDS.moduleGuardFundamentals,
    });
    resetGoogleDriveCache();
    await expect(
      getVideoPlayback(video.id, DEMO_IDS.teacher, "teacher"),
    ).rejects.toBeTruthy();
  });

  it("lista vídeos e auditoria por usuário", async () => {
    await storeTokens(DEMO_IDS.teacher);
    const video = await uploadLibraryVideo(DEMO_IDS.teacher, videoFile(), {
      title: "Aula",
      moduleId: DEMO_IDS.moduleGuardFundamentals,
    });
    await getVideoPlayback(video.id, DEMO_IDS.teacher, "teacher");
    const list = await listUserVideos(DEMO_IDS.teacher, "teacher", {
      module_id: DEMO_IDS.moduleGuardFundamentals,
    });
    expect(list.videos.some((item) => item.id === video.id)).toBe(true);
  });

  it("atualiza metadados no Drive e no banco", async () => {
    await storeTokens(DEMO_IDS.teacher);
    const video = await uploadLibraryVideo(DEMO_IDS.teacher, videoFile(), {
      title: "Original",
      moduleId: DEMO_IDS.moduleGuardFundamentals,
    });
    const updated = await updateVideoForUser(
      video.id,
      DEMO_IDS.teacher,
      "teacher",
      { title: "Atualizado", description: "Nova descrição" },
    );
    expect(updated.title).toBe("Atualizado");
    expect(driveClient.updateFileMetadata).toHaveBeenCalledWith(
      "ya29.access",
      video.provider_video_id,
      expect.objectContaining({ name: "Atualizado" }),
    );
  });

  it("faz soft delete e hard delete no Drive", async () => {
    await storeTokens(DEMO_IDS.teacher);
    const video = await uploadLibraryVideo(DEMO_IDS.teacher, videoFile(), {
      title: "Aula",
      moduleId: DEMO_IDS.moduleGuardFundamentals,
    });
    const result = await deleteVideoForUser(
      video.id,
      DEMO_IDS.teacher,
      "teacher",
      { hard: true },
    );
    expect(result.driveDeleted).toBe(true);
    expect(driveClient.deleteFile).toHaveBeenCalled();
    expect(getDb().videos.find((item) => item.id === video.id)?.deleted_at).toBeTruthy();
  });

  it("compartilha vídeo por e-mail no Drive", async () => {
    await storeTokens(DEMO_IDS.teacher);
    const video = await uploadLibraryVideo(DEMO_IDS.teacher, videoFile(), {
      title: "Aula",
      moduleId: DEMO_IDS.moduleGuardFundamentals,
    });
    await shareVideoForUser(
      video.id,
      DEMO_IDS.teacher,
      "teacher",
      "aluno@example.com",
    );
    expect(driveClient.createPermission).toHaveBeenCalledWith(
      "ya29.access",
      video.provider_video_id,
      "aluno@example.com",
    );
    expect(
      getDb().video_access_audit.some((log) => log.action === "share"),
    ).toBe(true);
  });
});

describe("upload em chunks", () => {
  it("inicializa, recebe chunks, conclui e cria vídeo", async () => {
    await storeTokens(DEMO_IDS.teacher);
    const file = videoFile("chunked.mp4", 16);
    const buffer = Buffer.from(await file.arrayBuffer());
    const session = initializeUploadSession(DEMO_IDS.teacher, {
      title: "Chunked",
      destination: "library",
      fileName: "chunked.mp4",
      mimeType: "video/mp4",
      totalBytes: buffer.length,
      moduleId: DEMO_IDS.moduleGuardFundamentals,
      chunkSize: 8,
    });
    expect(session.total_chunks).toBe(2);

    appendUploadChunk(DEMO_IDS.teacher, session.id, 0, buffer.subarray(0, 8));
    const progress = appendUploadChunk(
      DEMO_IDS.teacher,
      session.id,
      1,
      buffer.subarray(8),
    );
    expect(progress.percentage).toBeGreaterThan(0);

    const { video } = await completeUploadSession(DEMO_IDS.teacher, session.id);
    expect(video.provider).toBe("google_drive");
  });

  it("cancela uma sessão", () => {
    const session = initializeUploadSession(DEMO_IDS.lucas, {
      title: "Cancelar",
      destination: "personal",
      fileName: "v.mp4",
      mimeType: "video/mp4",
      totalBytes: 10,
    });
    const cancelled = cancelUploadSession(DEMO_IDS.lucas, session.id);
    expect(cancelled.status).toBe("cancelled");
  });
});

describe("migração Mux → Google Drive", () => {
  it("migra vídeos preservando metadados e registrando auditoria", async () => {
    await storeTokens(DEMO_IDS.teacher);
    const muxVideo = getDb().videos.find((video) => video.provider === "mux");
    if (!muxVideo) {
      // O seed local usa provider "demo"; força um cenário Mux.
      const created = createDriveVideoRecord({
        ownerId: DEMO_IDS.teacher,
        ownerRole: "teacher",
        visibility: "library",
        moduleId: DEMO_IDS.moduleGuardFundamentals,
        title: "Mux legado",
        providerVideoId: "mux-asset-1",
        driveFileId: "old",
        sizeBytes: 10,
        durationSeconds: 30,
      });
      Object.assign(created, { provider: "mux", playback_url: "https://example.com/mux.mp4" });
    } else {
      muxVideo.playback_url = "https://example.com/mux.mp4";
    }

    const buffer = Buffer.from(await videoFile("mux.mp4", 16).arrayBuffer());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(buffer, { status: 200 })),
    );
    const job = startMigrationJob(DEMO_IDS.teacher, undefined, {
      autoStart: false,
    });
    const finished = await runMigrationJob(job.id);
    expect(finished.total_videos).toBeGreaterThan(0);
    expect(finished.processed_videos).toBeGreaterThan(0);
  });
});

describe("endpoints /api/videos e Google Drive", () => {
  it("upload multipart cria vídeo e retorna 201", async () => {
    await storeTokens(DEMO_IDS.teacher);
    await authenticate();
    const form = new FormData();
    form.append("file", videoFile());
    form.append("title", "Upload endpoint");
    form.append("destination", "library");
    form.append("module_id", DEMO_IDS.moduleGuardFundamentals);
    const response = await uploadRoute(apiRequest("/api/videos/upload", {
      method: "POST",
      body: form,
    }), { params: Promise.resolve({}) });
    expect(response.status).toBe(201);
    const payload = await json(response);
    expect(payload.data.provider).toBe("google_drive");
  });

  it("lista vídeos e retorna 401 sem sessão", async () => {
    const unauthorized = await listRoute(apiRequest("/api/videos"), {
      params: Promise.resolve({}),
    });
    expect(unauthorized.status).toBe(401);

    await authenticate();
    const response = await listRoute(apiRequest("/api/videos"), {
      params: Promise.resolve({}),
    });
    expect(response.status).toBe(200);
  });

  it("playback e metadados retornam provider e URL", async () => {
    await storeTokens(DEMO_IDS.teacher);
    await authenticate();
    const video = await uploadLibraryVideo(DEMO_IDS.teacher, videoFile(), {
      title: "Endpoint",
      moduleId: DEMO_IDS.moduleGuardFundamentals,
    });
    const playback = await playbackRoute(
      apiRequest(`/api/videos/${video.id}/playback-url`),
      { params: Promise.resolve({ videoId: video.id }) },
    );
    expect(playback.status).toBe(200);
    expect((await json(playback)).data.provider).toBe("google_drive");

    const metadata = await metadataRoute(
      apiRequest(`/api/videos/${video.id}`),
      { params: Promise.resolve({ videoId: video.id }) },
    );
    expect(metadata.status).toBe(200);
    expect((await json(metadata)).data.id).toBe(video.id);
  });

  it("auditoria exige autenticação e lista acessos", async () => {
    await storeTokens(DEMO_IDS.teacher);
    await authenticate();
    const video = await uploadLibraryVideo(DEMO_IDS.teacher, videoFile(), {
      title: "Audit",
      moduleId: DEMO_IDS.moduleGuardFundamentals,
    });
    await getVideoPlayback(video.id, DEMO_IDS.teacher, "teacher");
    const response = await auditRoute(
      apiRequest(`/api/videos/access-audit?video_id=${video.id}`),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(200);
    expect((await json(response)).data.logs.length).toBeGreaterThan(0);
  });

  it("autoriza e processa callback OAuth do Drive", async () => {
    await authenticate();
    const authorize = await authorizeDriveRoute(
      apiRequest("/api/google-drive/oauth/authorize", { method: "POST" }),
      { params: Promise.resolve({}) },
    );
    expect(authorize.status).toBe(200);
    const authorizationUrl = new URL((await json(authorize)).data.authorizationUrl);
    expect(authorizationUrl.searchParams.get("scope")).toContain("drive.file");
    const state = authorizationUrl.searchParams.get("state")!;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("oauth2.googleapis.com/token")) {
          return new Response(JSON.stringify({
            access_token: "ya29.drive",
            refresh_token: "1//drive-refresh",
            expires_in: 3600,
            token_type: "Bearer",
            scope: SCOPES,
          }), { status: 200, headers: { "content-type": "application/json" } });
        }
        if (String(url).includes("openidconnect.googleapis.com")) {
          return new Response(JSON.stringify({
            sub: "google-1",
            email: "drive@example.com",
            name: "Drive User",
          }), { status: 200, headers: { "content-type": "application/json" } });
        }
        return new Response("", { status: 200 });
      }),
    );

    const callback = await callbackDriveRoute(
      apiRequest(`/api/google-drive/oauth/callback?code=abc&state=${encodeURIComponent(state)}`),
      { params: Promise.resolve({}) },
    );
    expect(callback.status).toBe(303);
    expect(new URL(callback.headers.get("location")!).searchParams.get("drive")).toBe("connected");
    expect(getDriveTokenRecord(DEMO_IDS.teacher)).toBeTruthy();
  });

  it("inicializa, envia chunks, conclui e cancela upload", async () => {
    await storeTokens(DEMO_IDS.teacher);
    await authenticate();
    const file = videoFile("api-chunked.mp4", 16);
    const buffer = Buffer.from(await file.arrayBuffer());

    const init = await initializeUploadRoute(
      apiRequest("/api/videos/upload/initialize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "API chunked",
          destination: "library",
          module_id: DEMO_IDS.moduleGuardFundamentals,
          file_name: "api-chunked.mp4",
          mime_type: "video/mp4",
          total_bytes: buffer.length,
        }),
      }),
      { params: Promise.resolve({}) },
    );
    expect(init.status).toBe(201);
    const session = (await json(init)).data;
    expect(session.total_chunks).toBe(1);

    const chunk = await chunkRoute(
      new Request(
        `http://localhost/api/videos/upload/${session.session_id}/chunk?chunk_index=0`,
        {
          method: "POST",
          headers: { "content-type": "application/octet-stream" },
          body: buffer,
        },
      ),
      { params: Promise.resolve({ sessionId: session.session_id }) },
    );
    expect(chunk.status).toBe(200);
    expect((await json(chunk)).data.percentage).toBe(100);

    const complete = await completeUploadRoute(
      apiRequest(`/api/videos/upload/${session.session_id}/complete`, {
        method: "POST",
      }),
      { params: Promise.resolve({ sessionId: session.session_id }) },
    );
    expect(complete.status).toBe(200);
    expect((await json(complete)).data.video_id).toBeTruthy();

    const cancellable = await initializeUploadRoute(
      apiRequest("/api/videos/upload/initialize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Cancelar",
          destination: "personal",
          file_name: "cancel.mp4",
          mime_type: "video/mp4",
          total_bytes: 10,
        }),
      }),
      { params: Promise.resolve({}) },
    );
    const cancelId = (await json(cancellable)).data.session_id;
    const cancel = await cancelUploadRoute(
      apiRequest(`/api/videos/upload/${cancelId}/cancel`, { method: "POST" }),
      { params: Promise.resolve({ sessionId: cancelId }) },
    );
    expect(cancel.status).toBe(200);
    expect((await json(cancel)).data.status).toBe("cancelled");
  });

  it("PATCH, DELETE, move e share de vídeos do Drive", async () => {
    await storeTokens(DEMO_IDS.teacher);
    await authenticate();
    const video = await uploadLibraryVideo(DEMO_IDS.teacher, videoFile(), {
      title: "Gerenciar",
      moduleId: DEMO_IDS.moduleGuardFundamentals,
    });

    const patched = await patchVideoRoute(
      apiRequest(`/api/videos/${video.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Gerenciado", description: "Desc" }),
      }),
      { params: Promise.resolve({ videoId: video.id }) },
    );
    expect(patched.status).toBe(200);
    expect((await json(patched)).data.title).toBe("Gerenciado");

    const moved = await moveVideoRoute(
      apiRequest(`/api/videos/${video.id}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ destination_module_id: DEMO_IDS.moduleGuardExecution }),
      }),
      { params: Promise.resolve({ videoId: video.id }) },
    );
    expect(moved.status).toBe(200);

    const shared = await shareVideoRoute(
      apiRequest(`/api/videos/${video.id}/share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "aluno@example.com" }),
      }),
      { params: Promise.resolve({ videoId: video.id }) },
    );
    expect(shared.status).toBe(200);
    expect((await json(shared)).data.shared_with).toBe("aluno@example.com");

    const deleted = await deleteVideoRoute(
      apiRequest(`/api/videos/${video.id}?hard=true`, { method: "DELETE" }),
      { params: Promise.resolve({ videoId: video.id }) },
    );
    expect(deleted.status).toBe(200);
    expect(getDb().videos.find((item) => item.id === video.id)?.deleted_at).toBeTruthy();
  });

  it("inicia e consulta job de migração", async () => {
    await storeTokens(DEMO_IDS.teacher);
    await authenticate();
    const video = createDriveVideoRecord({
      ownerId: DEMO_IDS.teacher,
      ownerRole: "teacher",
      visibility: "library",
      moduleId: DEMO_IDS.moduleGuardFundamentals,
      title: "Mux route",
      providerVideoId: "mux-route",
      driveFileId: "mux-route",
      sizeBytes: 10,
      durationSeconds: 10,
    });
    mutateVideo(video.id, (record) => {
      record.provider = "mux";
      record.playback_url = "https://example.com/mux.mp4";
    });
    if (!getDb().videos.some((item) => item.provider === "mux")) {
      throw new Error("cenário mux não criado");
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(Buffer.from(await videoFile("m.mp4", 16).arrayBuffer()), { status: 200 })),
    );
    const response = await migrateRoute(
      apiRequest("/api/videos/migrate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({}) },
    );
    expect([201, 202]).toContain(response.status);
    const jobId = (await json(response)).data.migrationId;
    await new Promise((resolve) => setTimeout(resolve, 20));
    const job = await migrationJobRoute(
      apiRequest(`/api/videos/migrate/${jobId}`),
      { params: Promise.resolve({ jobId }) },
    );
    expect(job.status).toBe(200);
    expect((await json(job)).data.id).toBe(jobId);
  });

  it("status e disconnect do Drive", async () => {
    await storeTokens(DEMO_IDS.teacher);
    await authenticate();
    const status = await statusDriveRoute(apiRequest("/api/google-drive/status"), {
      params: Promise.resolve({}),
    });
    expect(status.status).toBe(200);
    expect((await json(status)).data.connected).toBe(true);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    const disconnect = await disconnectDriveRoute(
      apiRequest("/api/google-drive/disconnect", { method: "DELETE" }),
      { params: Promise.resolve({}) },
    );
    expect(disconnect.status).toBe(200);
    expect(getDriveTokenRecord(DEMO_IDS.teacher)).toBeNull();
  });
});

describe("tokens de reprodução", () => {
  it("gera e valida token com expiração de 1 hora", () => {
    const result = createPlaybackToken({
      videoId: "v1",
      userId: "u1",
      provider: "google_drive",
      driveFileId: "d1",
    });
    expect(result.expiresIn).toBe(3600);
    expect(verifyPlaybackToken(result.token)).toMatchObject({
      videoId: "v1",
      provider: "google_drive",
    });
  });

  it("rejeita token expirado, adulterado e ausente", () => {
    const result = createPlaybackToken({
      videoId: "v1",
      userId: "u1",
      provider: "google_drive",
      driveFileId: "d1",
      expiresIn: 1,
      now: Date.now() - 10_000,
    });
    expect(verifyPlaybackToken(result.token)).toBeNull();
    expect(verifyPlaybackToken(`${result.token}x`)).toBeNull();
    expect(verifyPlaybackToken("")).toBeNull();
  });

  it("endpoint de embed valida o token e redireciona", async () => {
    const result = createPlaybackToken({
      videoId: "v1",
      userId: "u1",
      provider: "google_drive",
      driveFileId: "d1",
    });
    const response = await embedRoute(
      apiRequest(`/api/google-drive/embed/${result.token}`),
      { params: Promise.resolve({ token: result.token }) },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("drive.google.com/file/d/d1/preview");

    const invalid = await embedRoute(
      apiRequest("/api/google-drive/embed/token-invalido"),
      { params: Promise.resolve({ token: "token-invalido" }) },
    );
    expect(invalid.status).toBe(410);
  });

  it("buildPlaybackUrl inclui expiração", () => {
    const result = buildPlaybackUrl({
      videoId: "v1",
      userId: "u1",
      provider: "google_drive",
      driveFileId: "d1",
      expiresIn: 60,
    });
    expect(result.expires_in).toBe(60);
    expect(new Date(result.expires_at).getTime()).toBeGreaterThan(Date.now());
  });
});
