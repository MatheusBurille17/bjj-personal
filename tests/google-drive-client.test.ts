import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFolder,
  createPermission,
  deleteFile,
  driveRequest,
  ensureFolder,
  getDriveAbout,
  getFileMetadata,
  listFilesInFolder,
  listPermissions,
  moveFile,
  resetCircuitBreaker,
  updateFileMetadata,
  uploadFile,
} from "@/lib/services/google-drive-client";
import { GoogleDriveError } from "@/lib/google-drive-errors";

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

const FILE = {
  id: "file-1",
  name: "video.mp4",
  mimeType: "video/mp4",
  size: "1234",
  createdTime: "2026-01-01T00:00:00.000Z",
  modifiedTime: "2026-01-01T00:00:00.000Z",
  webViewLink: "https://drive.google.com/file/d/file-1/view",
  webContentLink: null,
  thumbnailLink: "https://example.com/thumb.jpg",
  videoMediaMetadata: { durationMillis: 90000 },
};

beforeEach(() => resetCircuitBreaker());
afterEach(() => vi.unstubAllGlobals());

describe("cliente Google Drive v3", () => {
  it("consulta /about e normaliza quota", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          user: { emailAddress: "prof@example.com", displayName: "Prof" },
          storageQuota: { limit: "1000", usage: "200", usageInDrive: "150" },
        }),
      ),
    );
    const about = await getDriveAbout("token");
    expect(about.email).toBe("prof@example.com");
    expect(about.driveId).toBe("prof@example.com");
    expect(about.storage.limit).toBe(1000);
    expect(about.storage.usage).toBe(200);
  });

  it("encontra pasta existente e cria apenas quando necessário", async () => {
    const fetchMock = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(json({ files: [{ id: "folder-1", name: "Biblioteca" }] }))
      .mockResolvedValueOnce(json({ files: [] }))
      .mockResolvedValueOnce(json({ id: "folder-2", name: "Nova" }));
    vi.stubGlobal("fetch", fetchMock);

    const existing = await ensureFolder("token", "Biblioteca", "root");
    expect(existing.id).toBe("folder-1");
    const created = await ensureFolder("token", "Nova", "root");
    expect(created.id).toBe("folder-2");

    const secondUrl = String(fetchMock.mock.calls[2][0]);
    expect(secondUrl).toContain("/files?fields=");
    const body = JSON.parse(String(fetchMock.mock.calls[2][1]?.body));
    expect(body.parents).toEqual(["root"]);
    expect(body.mimeType).toContain("folder");
  });

  it("cria pasta e valida o corpo enviado", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => json({ id: "f1", name: "Técnica" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const folder = await createFolder("token", "Técnica", "root");
    expect(folder.id).toBe("f1");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      name: "Técnica",
      parents: ["root"],
    });
  });

  it("faz upload multipart com metadados e arquivo", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => json(FILE),
    );
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([new Uint8Array([0, 1, 2])], "video.mp4", {
      type: "video/mp4",
    });
    const result = await uploadFile("token", {
      name: "video.mp4",
      mimeType: "video/mp4",
      parentId: "folder-1",
      file,
    });
    expect(result.id).toBe("file-1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("uploadType=multipart");
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.headers as Record<string, string>).authorization).toBe(
      "Bearer token",
    );
  });

  it("busca metadados, lista arquivos e permissões", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/permissions")) {
          return json({
            permissions: [
              { id: "p1", type: "user", role: "reader", emailAddress: "a@b.com" },
            ],
          });
        }
        if (String(url).includes("/files?")) {
          return json({ files: [FILE], nextPageToken: "next" });
        }
        return json(FILE);
      }),
    );

    expect((await getFileMetadata("token", "file-1")).id).toBe("file-1");
    const list = await listFilesInFolder("token", "folder-1");
    expect(list.files).toHaveLength(1);
    expect(list.nextPageToken).toBe("next");
    const permissions = await listPermissions("token", "file-1");
    expect(permissions[0].emailAddress).toBe("a@b.com");
  });

  it("move, atualiza metadados, compartilha e deleta", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (url, init) => {
      if (String(url).includes("/permissions")) {
        return json({ id: "p1", type: "user", role: "reader", emailAddress: "a@b.com" });
      }
      if (init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      return json(FILE);
    });
    vi.stubGlobal("fetch", fetchMock);

    await moveFile("token", "file-1", "folder-2", "folder-1");
    expect(String(fetchMock.mock.calls[0][0])).toContain("addParents=folder-2");
    expect(String(fetchMock.mock.calls[0][0])).toContain("removeParents=folder-1");

    await updateFileMetadata("token", "file-1", { name: "Novo", description: "Desc" });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({
      name: "Novo",
      description: "Desc",
    });

    const permission = await createPermission("token", "file-1", "aluno@example.com");
    expect(permission.emailAddress).toBe("a@b.com");

    await expect(deleteFile("token", "file-1")).resolves.toBeUndefined();
  });

  it("faz retry exponencial em erro transitório", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ error: "server" }, 500))
      .mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await driveRequest<{ ok: boolean }>(
      "token",
      "https://www.googleapis.com/drive/v3/about",
    );
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("mapeia 401, 403, 404 e 429 para códigos de domínio", async () => {
    for (const [status, code] of [
      [401, "token_expired"],
      [403, "permission_denied"],
      [404, "not_found"],
      [429, "rate_limited"],
    ] as const) {
      resetCircuitBreaker();
      vi.stubGlobal("fetch", vi.fn(async () => json({ error: "x" }, status)));
      await expect(
        driveRequest("token", "https://www.googleapis.com/drive/v3/files/x"),
      ).rejects.toMatchObject({ code });
    }
  });

  it("abre o circuit breaker após falhas consecutivas", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "down" }, 500)));
    for (let index = 0; index < 2; index += 1) {
      await expect(
        driveRequest("token", "https://www.googleapis.com/drive/v3/files/x"),
      ).rejects.toBeInstanceOf(GoogleDriveError);
    }
    await expect(
      driveRequest("token", "https://www.googleapis.com/drive/v3/files/x"),
    ).rejects.toMatchObject({ code: "circuit_open" });
    resetCircuitBreaker();
  });
});
