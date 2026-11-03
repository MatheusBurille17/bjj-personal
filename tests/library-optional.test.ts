import { beforeEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { createHmac } from "node:crypto";

const sessionState = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      sessionState.jar.has(name) ? { name, value: sessionState.jar.get(name) as string } : undefined,
    set: (name: string, value: string) => sessionState.jar.set(name, value),
    delete: (name: string) => sessionState.jar.delete(name),
  }),
}));

import { createDemoDatabase, DEMO_IDS } from "@/lib/db/seed";
import { getDb, resetDb } from "@/lib/db/store";
import {
  addVideoToPlanDay,
  getPlanDetail,
} from "@/lib/services/plan.service";
import {
  applyVideoWebhook,
  archiveModule,
  archiveTechnique,
  archiveVideo,
  createModule,
  createTechnique,
  createVideo,
  deleteVideo,
  getAccessForEnrollment,
  getLibraryTree,
  getModules,
  getTeacherPlaybackUrl,
  getTechniques,
  getVideo,
  getVideos,
  grantTechniqueAccess,
  moveModule,
  reorderModules,
  reorderTechniques,
  revokeAccess,
  searchVideos,
  unarchiveTechnique,
  updateTechnique,
  updateVideo,
} from "@/lib/services/library.service";
import { createDirectUpload } from "@/lib/mux/upload";
import { signSession, SESSION_COOKIE } from "@/lib/auth/token";
import {
  GET as techniquesGetRoute,
  POST as techniquesPostRoute,
} from "@/app/api/library/techniques/route";
import { POST as webhookRoute } from "@/app/api/library/videos/webhook/route";
import { POST as uploadRoute } from "@/app/api/library/videos/upload/route";
import {
  createModuleSchema,
  createTechniqueSchema,
  createVideoSchema,
  updateVideoSchema,
} from "@/lib/validation/library";

const OTHER_TEACHER = "77777777-7777-4777-8777-777777777777";

beforeEach(() => {
  sessionState.jar.clear();
  resetDb(createDemoDatabase());
  const db = getDb();
  db.profiles.push({
    ...db.profiles[0],
    id: OTHER_TEACHER,
    full_name: "Outro Professor",
    email: "outro.library@example.com",
  });
  db.teachers.push({ ...db.teachers[0], id: OTHER_TEACHER, display_name: "Prof. Outro" });
});

async function authenticateTeacher() {
  const token = await signSession({
    sub: DEMO_IDS.teacher,
    role: "teacher",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  sessionState.jar.set(SESSION_COOKIE, token);
}

function request(body?: unknown): Request {
  return new Request("http://localhost/api/library", {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function uniqueName(prefix: string) {
  return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

describe("propriedades — técnicas", () => {
  it("Property 1/2/3: criação válida, nome obrigatório e isolamento por professor", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 60 }).filter((name) => name.trim().length >= 2),
        (name) => {
          const technique = createTechnique(DEMO_IDS.teacher, { name });
          expect(technique.status).toBe("active");
          expect(technique.teacher_id).toBe(DEMO_IDS.teacher);
          expect(technique.name).toBe(name);
        },
      ),
      { numRuns: 20 },
    );

    expect(createTechniqueSchema.safeParse({ name: "A" }).success).toBe(false);
    const other = getTechniques(OTHER_TEACHER, { pageSize: 100 });
    expect(other.techniques).toHaveLength(0);
    const mine = getTechniques(DEMO_IDS.teacher, { pageSize: 100 });
    expect(mine.techniques.every((technique) => technique.teacher_id === DEMO_IDS.teacher)).toBe(true);
  });

  it("Property 4/5/6: lista ativos por ordem e inclui contagens", () => {
    const result = getTechniques(DEMO_IDS.teacher, { pageSize: 100 });
    expect(result.techniques.every((technique) => technique.status === "active")).toBe(true);
    const orders = result.techniques.map((technique) => technique.sort_order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(result.techniques[0]).toHaveProperty("module_count");
    expect(result.techniques[0]).toHaveProperty("video_count");
  });

  it("Property 7/8: atualização exige propriedade e altera updated_at", async () => {
    const before = getTechniques(DEMO_IDS.teacher, { pageSize: 100 }).techniques[0];
    await new Promise((resolve) => setTimeout(resolve, 2));
    const updated = updateTechnique(before.id, DEMO_IDS.teacher, { name: "Nome atualizado" });
    expect(updated.name).toBe("Nome atualizado");
    expect(updated.updated_at >= before.updated_at).toBe(true);
    expect(() => updateTechnique(before.id, OTHER_TEACHER, { name: "Hack" })).toThrow(/acesso/i);
  });

  it("Property 9: status não é alterável pela atualização", () => {
    const technique = getTechniques(DEMO_IDS.teacher, { pageSize: 100 }).techniques[0];
    const updated = updateTechnique(technique.id, DEMO_IDS.teacher, { name: "X" } as never);
    expect(updated.status).toBe(technique.status);
  });

  it("Property 10/11/12: reordenação atômica e validação de propriedade", () => {
    const techniques = getTechniques(DEMO_IDS.teacher, { pageSize: 100 }).techniques;
    const reordered = [...techniques].reverse().map((item, index) => ({
      id: item.id,
      sort_order: index + 1,
    }));
    reorderTechniques(DEMO_IDS.teacher, reordered);
    const after = getTechniques(DEMO_IDS.teacher, { pageSize: 100 }).techniques;
    expect(after.map((item) => item.id)).toEqual(techniques.map((item) => item.id).reverse());

    const original = after.map((item) => item.sort_order);
    expect(() =>
      reorderTechniques(DEMO_IDS.teacher, [{ id: "00000000-0000-4000-8000-000000000000", sort_order: 1 }]),
    ).toThrow();
    expect(getTechniques(DEMO_IDS.teacher, { pageSize: 100 }).techniques.map((item) => item.sort_order)).toEqual(original);
  });

  it("Property 13/14/15/16/17: arquivamento em cascata, ocultação e reativação só da técnica", () => {
    archiveTechnique(DEMO_IDS.guardPass, DEMO_IDS.teacher);
    expect(getTechniques(DEMO_IDS.teacher, { pageSize: 100 }).techniques.some((item) => item.id === DEMO_IDS.guardPass)).toBe(false);
    const db = getDb();
    expect(db.modules.filter((item) => item.technique_id === DEMO_IDS.guardPass).every((item) => item.status === "archived")).toBe(true);
    expect(db.videos.filter((item) => item.technique_id === DEMO_IDS.guardPass).every((item) => item.status === "archived")).toBe(true);
    expect(() => unarchiveTechnique(DEMO_IDS.guardPass, OTHER_TEACHER)).toThrow();

    unarchiveTechnique(DEMO_IDS.guardPass, DEMO_IDS.teacher);
    expect(getTechniques(DEMO_IDS.teacher, { pageSize: 100 }).techniques.some((item) => item.id === DEMO_IDS.guardPass)).toBe(true);
    expect(db.modules.filter((item) => item.technique_id === DEMO_IDS.guardPass).every((item) => item.status === "archived")).toBe(true);
    expect(() => unarchiveTechnique(DEMO_IDS.guardPass, DEMO_IDS.teacher)).toThrow();
  });
});

describe("propriedades — módulos", () => {
  it("Property 18/19/20/21/22: criação exige técnica própria e lista com contagens", () => {
    const moduleRecord = createModule(DEMO_IDS.teacher, {
      technique_id: DEMO_IDS.guardPass,
      name: "Módulo Propriedade",
    });
    expect(moduleRecord.technique_id).toBe(DEMO_IDS.guardPass);
    expect(moduleRecord.status).toBe("active");
    expect(() =>
      createModule(OTHER_TEACHER, { technique_id: DEMO_IDS.guardPass, name: "Outro" }),
    ).toThrow();
    expect(() => getModules(DEMO_IDS.guardPass, OTHER_TEACHER)).toThrow();
    const modules = getModules(DEMO_IDS.guardPass, DEMO_IDS.teacher);
    expect(modules.some((item) => item.id === moduleRecord.id)).toBe(true);
    expect(modules.every((item) => typeof item.video_count === "number")).toBe(true);
    expect(createModuleSchema.safeParse({ technique_id: "x", name: "Módulo" }).success).toBe(false);
  });

  it("Property 23/24: arquivar módulo cascateia vídeos independentemente da técnica", () => {
    const moduleRecord = getDb().modules.find((item) => item.id === DEMO_IDS.moduleGuardExecution)!;
    archiveModule(moduleRecord.id, DEMO_IDS.teacher);
    expect(
      getDb().videos.filter((item) => item.module_id === moduleRecord.id).every((item) => item.status === "archived"),
    ).toBe(true);
    expect(getDb().techniques.find((item) => item.id === DEMO_IDS.guardPass)?.status).toBe("active");
  });

  it("Property 25/26: mover módulo exige propriedade dos dois lados", () => {
    const moduleRecord = createModule(DEMO_IDS.teacher, {
      technique_id: DEMO_IDS.submissions,
      name: "Módulo Móvel",
    });
    const moved = moveModule(moduleRecord.id, DEMO_IDS.teacher, DEMO_IDS.guardPass);
    expect(moved.technique_id).toBe(DEMO_IDS.guardPass);
    expect(() => moveModule(moduleRecord.id, OTHER_TEACHER, DEMO_IDS.guardPass)).toThrow();
    expect(() => moveModule(moduleRecord.id, DEMO_IDS.teacher, "00000000-0000-4000-8000-000000000000")).toThrow();
  });

  it("Property 33/34: reordenação de módulos preserva conjunto", () => {
    const modules = getModules(DEMO_IDS.guardPass, DEMO_IDS.teacher);
    reorderModules(
      DEMO_IDS.teacher,
      [...modules].reverse().map((item, index) => ({ id: item.id, sort_order: index + 1 })),
    );
    const after = getModules(DEMO_IDS.guardPass, DEMO_IDS.teacher);
    expect(after.map((item) => item.id)).toEqual(modules.map((item) => item.id).reverse());
  });
});

describe("propriedades — vídeos", () => {
  it("Property 27/28/29/30/31: criação exige módulo próprio e metadados válidos", () => {
    const video = createVideo(DEMO_IDS.teacher, {
      module_id: DEMO_IDS.moduleGuardExecution,
      title: "Vídeo de Propriedade",
      status: "ready",
    });
    expect(video.teacher_id).toBe(DEMO_IDS.teacher);
    expect(video.technique_id).toBe(DEMO_IDS.guardPass);
    expect(video.provider).toBe("demo");
    expect(() =>
      createVideo(OTHER_TEACHER, { module_id: DEMO_IDS.moduleGuardExecution, title: "Outro" }),
    ).toThrow();
    expect(createVideoSchema.safeParse({ module_id: "x", title: "Vídeo" }).success).toBe(false);
    expect(createVideoSchema.safeParse({ module_id: DEMO_IDS.moduleGuardExecution, title: "A" }).success).toBe(false);
    expect(
      createVideoSchema.safeParse({
        module_id: DEMO_IDS.moduleGuardExecution,
        title: "Vídeo",
        description: "x".repeat(2001),
      }).success,
    ).toBe(false);
  });

  it("Property 32: campos imutáveis do vídeo não são alterados", () => {
    const before = getVideo("eeeeeee1-1111-4111-8111-111111111111", DEMO_IDS.teacher);
    const updated = updateVideo(before.id, DEMO_IDS.teacher, { title: "Título novo" });
    expect(updated.provider).toBe(before.provider);
    expect(updated.provider_video_id).toBe(before.provider_video_id);
    expect(updated.status).toBe(before.status);
    expect(() =>
      updateVideo(before.id, OTHER_TEACHER, { title: "Hack" }),
    ).toThrow();
    expect(updateVideoSchema.safeParse({}).success).toBe(false);
  });

  it("Property 37/38/45/46: lista inclui todos os estados e exclui arquivados por padrão", () => {
    const moduleId = DEMO_IDS.moduleClosedSweeps;
    const all = getVideos(moduleId, DEMO_IDS.teacher, true);
    expect(all.some((video) => video.status === "processing" || video.status === "error")).toBe(true);
    const defaultList = getVideos(moduleId, DEMO_IDS.teacher);
    expect(defaultList.every((video) => video.status !== "archived")).toBe(true);

    const video = all[0];
    archiveVideo(video.id, DEMO_IDS.teacher);
    expect(getVideos(moduleId, DEMO_IDS.teacher).some((item) => item.id === video.id)).toBe(false);
    expect(getVideos(moduleId, DEMO_IDS.teacher, true).some((item) => item.status === "archived")).toBe(true);
  });

  it("Property 39/40/41: playback exige pronto e propriedade", () => {
    const ready = getTeacherPlaybackUrl("eeeeeee1-1111-4111-8111-111111111111", DEMO_IDS.teacher);
    expect(ready).toContain("http");
    expect(() => getTeacherPlaybackUrl("eeeeeee5-5555-4555-8555-555555555555", DEMO_IDS.teacher)).toThrow(/disponível/i);
    expect(() => getTeacherPlaybackUrl("eeeeeee1-1111-4111-8111-111111111111", OTHER_TEACHER)).toThrow();
  });

  it("Property 43/44/55/56: busca case-insensitive, trim e erro estruturado", () => {
    const upper = searchVideos(DEMO_IDS.teacher, { search: "PASSAGEM", pageSize: 50 });
    const lower = searchVideos(DEMO_IDS.teacher, { search: "passagem", pageSize: 50 });
    expect(upper.videos.map((item) => item.id)).toEqual(lower.videos.map((item) => item.id));
    expect(searchVideos(DEMO_IDS.teacher, { search: "   ", pageSize: 50 }).videos.length).toBeGreaterThan(0);
    expect(searchVideos(DEMO_IDS.teacher, { search: "zzzz", pageSize: 50 }).videos).toHaveLength(0);
  });

  it("Property 47/48: exclusão bloqueada por referência e permitida sem referência", () => {
    expect(() => deleteVideo("eeeeeee1-1111-4111-8111-111111111111", DEMO_IDS.teacher)).toThrow(/arquive/i);
    const video = createVideo(DEMO_IDS.teacher, {
      module_id: DEMO_IDS.moduleGuardExecution,
      title: "Sem referência",
      status: "ready",
    });
    deleteVideo(video.id, DEMO_IDS.teacher);
    expect(getDb().videos.some((item) => item.id === video.id)).toBe(false);
  });

  it("Property 21/45/57/58/59: status webhook, upload e paginação", async () => {
    const upload = await createDirectUpload();
    expect(upload.upload_url).toContain("http");
    expect(upload.demo).toBe(true);

    expect(applyVideoWebhook("demo-5", "ready", { duration_seconds: 120 })).toBe(true);
    const updated = getVideo("eeeeeee5-5555-4555-8555-555555555555", DEMO_IDS.teacher);
    expect(updated.status).toBe("ready");

    const result = searchVideos(DEMO_IDS.teacher, { page: 1, pageSize: 5 });
    expect(result.videos).toHaveLength(5);
    expect(result.pagination.pageSize).toBe(5);
    expect(result.pagination.hasNext).toBe(true);
  });
});

describe("integração — biblioteca, endpoints e webhook", () => {
  it("cria hierarquia completa e árvore ordenada", async () => {
    await authenticateTeacher();
    const response = await techniquesPostRoute(
      request({ name: uniqueName("Técnica Integração") }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(201);
    const technique = (await response.json()).data;

    const moduleRecord = createModule(DEMO_IDS.teacher, {
      technique_id: technique.id,
      name: "Módulo Integração",
    });
    createVideo(DEMO_IDS.teacher, {
      module_id: moduleRecord.id,
      title: "Vídeo Integração",
      status: "ready",
    });
    const tree = getLibraryTree(DEMO_IDS.teacher, true);
    expect(tree.techniques.some((item) => item.id === technique.id)).toBe(true);
    expect(tree.modules[technique.id].some((item) => item.id === moduleRecord.id)).toBe(true);
    expect(tree.videos[moduleRecord.id]).toHaveLength(1);
  });

  it("GET /api/library/techniques exige autenticação", async () => {
    const unauthorized = await techniquesGetRoute(request(), { params: Promise.resolve({}) });
    expect(unauthorized.status).toBe(401);
    await authenticateTeacher();
    const authorized = await techniquesGetRoute(request(), { params: Promise.resolve({}) });
    expect(authorized.status).toBe(200);
  });

  it("upload endpoint exige professor e retorna URL", async () => {
    const unauthorized = await uploadRoute(request(), { params: Promise.resolve({}) });
    expect(unauthorized.status).toBe(401);
    await authenticateTeacher();
    const authorized = await uploadRoute(request(), { params: Promise.resolve({}) });
    expect(authorized.status).toBe(200);
    expect((await authorized.json()).data.upload_url).toBeTruthy();
  });

  it("webhook rejeita assinatura inválida e processa evento válido", async () => {
    const previous = process.env.MUX_WEBHOOK_SECRET;
    process.env.MUX_WEBHOOK_SECRET = "webhook-secret-test";

    const body = JSON.stringify({ type: "video.asset.ready", data: { id: "demo-1", duration: 99 } });
    const bad = await webhookRoute(
      new Request("http://localhost/api/library/videos/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "mux-signature": "t=1,v1=invalida" },
        body,
      }),
    );
    expect(bad.status).toBe(401);

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", "webhook-secret-test")
      .update(`${timestamp}.${body}`)
      .digest("hex");
    const good = await webhookRoute(
      new Request("http://localhost/api/library/videos/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "mux-signature": `t=${timestamp},v1=${signature}`,
        },
        body,
      }),
    );
    expect(good.status).toBe(200);
    expect(getVideo("eeeeeee1-1111-4111-8111-111111111111", DEMO_IDS.teacher).duration_seconds).toBe(99);
    if (previous === undefined) delete process.env.MUX_WEBHOOK_SECRET;
    else process.env.MUX_WEBHOOK_SECRET = previous;
  });

  it("move módulo entre técnicas e reutiliza vídeo em dois planos", () => {
    const moduleRecord = createModule(DEMO_IDS.teacher, {
      technique_id: DEMO_IDS.guardPass,
      name: "Módulo Movido",
    });
    moveModule(moduleRecord.id, DEMO_IDS.teacher, DEMO_IDS.submissions);
    expect(getModules(DEMO_IDS.submissions, DEMO_IDS.teacher).some((item) => item.id === moduleRecord.id)).toBe(true);

    const dayA = getPlanDetail(DEMO_IDS.planOctober, DEMO_IDS.teacher).days[0];
    const dayB = getPlanDetail(DEMO_IDS.planOctober, DEMO_IDS.teacher).days[2];
    addVideoToPlanDay(dayB.id, DEMO_IDS.teacher, "eeeeeee1-1111-4111-8111-111111111111");
    expect(
      getPlanDetail(DEMO_IDS.planOctober, DEMO_IDS.teacher).days.find((day) => day.id === dayA.id)?.videos.length,
    ).toBeGreaterThan(0);
    expect(
      getPlanDetail(DEMO_IDS.planOctober, DEMO_IDS.teacher).days.find((day) => day.id === dayB.id)?.videos.some(
        (video) => video.id === "eeeeeee1-1111-4111-8111-111111111111",
      ),
    ).toBe(true);
  });

  it("libera e revoga acesso à técnica por aluno", () => {
    const access = grantTechniqueAccess(DEMO_IDS.teacher, DEMO_IDS.marianaEnrollment, DEMO_IDS.guardPass);
    expect(getAccessForEnrollment(DEMO_IDS.marianaEnrollment, DEMO_IDS.teacher).some((item) => item.id === access.id)).toBe(true);
    expect(() =>
      grantTechniqueAccess(DEMO_IDS.teacher, DEMO_IDS.marianaEnrollment, DEMO_IDS.guardPass),
    ).toThrow();
    revokeAccess(access.id, DEMO_IDS.teacher);
    expect(getAccessForEnrollment(DEMO_IDS.marianaEnrollment, DEMO_IDS.teacher).some((item) => item.id === access.id)).toBe(false);
  });

  it("lista vazia e filtros de status retornam arrays vazios coerentes", () => {
    const technique = createTechnique(DEMO_IDS.teacher, { name: "Técnica Vazia" });
    const moduleRecord = createModule(DEMO_IDS.teacher, {
      technique_id: technique.id,
      name: "Módulo Vazio",
    });
    expect(getVideos(moduleRecord.id, DEMO_IDS.teacher)).toEqual([]);
    expect(searchVideos(DEMO_IDS.teacher, { search: "nao-existe-xyz" }).videos).toEqual([]);
  });

  it("webhook de vídeo inexistente responde 200 sem efeitos", async () => {
    const response = await webhookRoute(
      new Request("http://localhost/api/library/videos/webhook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "video.asset.ready", data: { id: "inexistente" } }),
      }),
    );
    expect(response.status).toBe(200);
  });
});
