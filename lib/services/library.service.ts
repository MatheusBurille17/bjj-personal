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
import { ApiError, buildPagination } from "@/lib/middleware/errors";
import { DEMO_VIDEO_URL } from "@/lib/db/seed";
import { buildSignedPlaybackUrl } from "@/lib/mux/playback";
import { isMuxConfigured } from "@/lib/mux/client";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminClientAvailable } from "@/lib/supabase/admin";
import { mapPostgrestError, unwrapMaybe, unwrapVoid } from "@/lib/supabase/errors";

function nextSortOrder(items: Array<{ sort_order: number }>): number {
  return items.reduce((max, item) => Math.max(max, item.sort_order), 0) + 1;
}

function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const id = key(item);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

async function ownedTechnique(techniqueId: string, teacherId: string): Promise<Technique> {
  const supabase = await createClient();
  const technique = unwrapMaybe(
    await supabase.from("techniques").select("*").eq("id", techniqueId).maybeSingle(),
  );
  if (!technique) throw ApiError.notFound("Técnica não encontrada");
  if (technique.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");
  return technique;
}

async function ownedModule(moduleId: string, teacherId: string): Promise<Module> {
  const supabase = await createClient();
  const moduleRecord = unwrapMaybe(
    await supabase.from("modules").select("*").eq("id", moduleId).maybeSingle(),
  );
  if (!moduleRecord) throw ApiError.notFound("Módulo não encontrado");
  if (moduleRecord.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");
  return moduleRecord;
}

async function ownedVideo(videoId: string, teacherId: string): Promise<Video> {
  const supabase = await createClient();
  const video = unwrapMaybe(
    await supabase.from("videos").select("*").eq("id", videoId).maybeSingle(),
  );
  if (!video) throw ApiError.notFound("Vídeo não encontrado");
  if (video.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");
  return video;
}

/* -------------------------------------------------------------------------- */
/* Técnicas                                                                    */
/* -------------------------------------------------------------------------- */

export async function getTechniques(
  teacherId: string,
  options: { includeArchived?: boolean; page?: number; pageSize?: number } = {},
): Promise<{
  techniques: TechniqueWithCounts[];
  pagination: ReturnType<typeof buildPagination>;
}> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(Math.max(1, options.pageSize ?? 20), 100);
  const from = (page - 1) * pageSize;

  let query = supabase
    .from("techniques")
    .select("*", { count: "exact" })
    .eq("teacher_id", teacherId)
    .order("sort_order", { ascending: true })
    .range(from, from + pageSize - 1);

  if (!options.includeArchived) query = query.eq("status", "active");

  const { data: techniques, error, count } = await query;
  if (error) throw mapPostgrestError(error);

  const rows = techniques ?? [];
  const ids = rows.map((item) => item.id);

  let modules: Array<{ technique_id: string }> = [];
  let videos: Array<{ technique_id: string }> = [];
  if (ids.length > 0) {
    const [moduleResult, videoResult] = await Promise.all([
      supabase.from("modules").select("technique_id").in("technique_id", ids),
      supabase.from("videos").select("technique_id").in("technique_id", ids),
    ]);
    if (moduleResult.error) throw mapPostgrestError(moduleResult.error);
    if (videoResult.error) throw mapPostgrestError(videoResult.error);
    modules = moduleResult.data ?? [];
    videos = videoResult.data ?? [];
  }

  const moduleCounts = countBy(modules, (item) => item.technique_id);
  const videoCounts = countBy(videos, (item) => item.technique_id);

  return {
    techniques: rows.map((technique) => ({
      ...technique,
      module_count: moduleCounts.get(technique.id) ?? 0,
      video_count: videoCounts.get(technique.id) ?? 0,
    })),
    pagination: buildPagination(count ?? 0, page, pageSize),
  };
}

export async function getLibraryTree(
  teacherId: string,
  includeArchived = false,
): Promise<{
  techniques: TechniqueWithCounts[];
  modules: Record<string, ModuleWithCounts[]>;
  videos: Record<string, Video[]>;
}> {
  const supabase = await createClient();

  let techniqueQuery = supabase
    .from("techniques")
    .select("*")
    .eq("teacher_id", teacherId)
    .order("sort_order", { ascending: true });
  if (!includeArchived) techniqueQuery = techniqueQuery.eq("status", "active");

  const [techniqueResult, moduleResult, videoResult] = await Promise.all([
    techniqueQuery,
    supabase
      .from("modules")
      .select("*")
      .eq("teacher_id", teacherId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("videos")
      .select("*")
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: true }),
  ]);

  if (techniqueResult.error) throw mapPostgrestError(techniqueResult.error);
  if (moduleResult.error) throw mapPostgrestError(moduleResult.error);
  if (videoResult.error) throw mapPostgrestError(videoResult.error);

  const allModules = (moduleResult.data ?? []).filter(
    (item) => includeArchived || item.status === "active",
  );
  const allVideos = (videoResult.data ?? []).filter(
    (item) => includeArchived || item.status !== "archived",
  );

  const moduleVideoCounts = countBy(allVideos, (item) => item.module_id);
  const techniqueVideoCounts = countBy(allVideos, (item) => item.technique_id);
  const techniqueModuleCounts = countBy(allModules, (item) => item.technique_id);

  const videos: Record<string, Video[]> = {};
  for (const moduleRecord of allModules) {
    videos[moduleRecord.id] = allVideos.filter((item) => item.module_id === moduleRecord.id);
  }

  const modules: Record<string, ModuleWithCounts[]> = {};
  for (const moduleRecord of allModules) {
    const list = modules[moduleRecord.technique_id] ?? [];
    list.push({
      ...moduleRecord,
      video_count: moduleVideoCounts.get(moduleRecord.id) ?? 0,
    });
    modules[moduleRecord.technique_id] = list;
  }

  const techniques: TechniqueWithCounts[] = (techniqueResult.data ?? []).map(
    (technique) => ({
      ...technique,
      module_count: techniqueModuleCounts.get(technique.id) ?? 0,
      video_count: techniqueVideoCounts.get(technique.id) ?? 0,
    }),
  );

  return { techniques, modules, videos };
}

export async function createTechnique(
  teacherId: string,
  data: CreateTechniqueInput,
): Promise<Technique> {
  const supabase = await createClient();
  let sortOrder = data.sort_order;
  if (sortOrder === undefined) {
    const last = await supabase
      .from("techniques")
      .select("sort_order")
      .eq("teacher_id", teacherId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    sortOrder = nextSortOrder(last.data ? [last.data] : []);
  }

  const { data: created, error } = await supabase
    .from("techniques")
    .insert({
      teacher_id: teacherId,
      name: data.name,
      description: data.description ?? null,
      category: data.category ?? null,
      sort_order: sortOrder,
      status: "active",
    })
    .select("*")
    .single();

  if (error) throw mapPostgrestError(error);
  return created;
}

export async function updateTechnique(
  techniqueId: string,
  teacherId: string,
  data: UpdateTechniqueInput,
): Promise<Technique> {
  await ownedTechnique(techniqueId, teacherId);
  const supabase = await createClient();

  const payload: {
    name?: string;
    description?: string | null;
    category?: string | null;
    sort_order?: number;
  } = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.description !== undefined) payload.description = data.description;
  if (data.category !== undefined) payload.category = data.category;
  if (data.sort_order !== undefined) payload.sort_order = data.sort_order;

  const { data: updated, error } = await supabase
    .from("techniques")
    .update(payload)
    .eq("id", techniqueId)
    .select("*")
    .single();

  if (error) throw mapPostgrestError(error);
  return updated;
}

export async function reorderTechniques(
  teacherId: string,
  items: Array<{ id: string; sort_order: number }>,
): Promise<void> {
  const supabase = await createClient();
  await Promise.all(items.map((item) => ownedTechnique(item.id, teacherId)));
  await Promise.all(
    items.map(async (item) => {
      const result = await supabase
        .from("techniques")
        .update({ sort_order: item.sort_order })
        .eq("id", item.id);
      unwrapVoid(result);
    }),
  );
}

/** Arquiva a técnica e cascateia para módulos e vídeos. */
export async function archiveTechnique(
  techniqueId: string,
  teacherId: string,
): Promise<Technique> {
  await ownedTechnique(techniqueId, teacherId);
  const supabase = await createClient();

  const [technique, modules, videos] = await Promise.all([
    supabase
      .from("techniques")
      .update({ status: "archived" })
      .eq("id", techniqueId)
      .select("*")
      .single(),
    supabase
      .from("modules")
      .update({ status: "archived" })
      .eq("technique_id", techniqueId),
    supabase
      .from("videos")
      .update({ status: "archived" })
      .eq("technique_id", techniqueId),
  ]);

  if (technique.error) throw mapPostgrestError(technique.error);
  unwrapVoid(modules);
  unwrapVoid(videos);
  return technique.data;
}

/** Reativa apenas a técnica; filhos permanecem arquivados. */
export async function unarchiveTechnique(
  techniqueId: string,
  teacherId: string,
): Promise<Technique> {
  const technique = await ownedTechnique(techniqueId, teacherId);
  if (technique.status === "active") {
    throw ApiError.conflict("Esta técnica já está ativa");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("techniques")
    .update({ status: "active" })
    .eq("id", techniqueId)
    .select("*")
    .single();

  if (error) throw mapPostgrestError(error);
  return data;
}

/* -------------------------------------------------------------------------- */
/* Módulos                                                                     */
/* -------------------------------------------------------------------------- */

export async function getModules(
  techniqueId: string,
  teacherId: string,
  includeArchived = false,
): Promise<ModuleWithCounts[]> {
  await ownedTechnique(techniqueId, teacherId);
  const supabase = await createClient();

  let query = supabase
    .from("modules")
    .select("*")
    .eq("technique_id", techniqueId)
    .order("sort_order", { ascending: true });
  if (!includeArchived) query = query.eq("status", "active");

  const { data, error } = await query;
  if (error) throw mapPostgrestError(error);

  const modules = data ?? [];
  if (modules.length === 0) return [];

  const videoResult = await supabase
    .from("videos")
    .select("module_id")
    .in("module_id", modules.map((item) => item.id));
  if (videoResult.error) throw mapPostgrestError(videoResult.error);

  const counts = countBy(videoResult.data ?? [], (item) => item.module_id);
  return modules.map((moduleRecord) => ({
    ...moduleRecord,
    video_count: counts.get(moduleRecord.id) ?? 0,
  }));
}

export async function createModule(
  teacherId: string,
  data: CreateModuleInput,
): Promise<Module> {
  const technique = await ownedTechnique(data.technique_id, teacherId);
  if (technique.status === "archived") {
    throw ApiError.conflict("Não é possível adicionar módulos a uma técnica arquivada");
  }

  const supabase = await createClient();
  let sortOrder = data.sort_order;
  if (sortOrder === undefined) {
    const last = await supabase
      .from("modules")
      .select("sort_order")
      .eq("technique_id", data.technique_id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    sortOrder = nextSortOrder(last.data ? [last.data] : []);
  }

  const { data: created, error } = await supabase
    .from("modules")
    .insert({
      technique_id: data.technique_id,
      teacher_id: teacherId,
      name: data.name,
      description: data.description ?? null,
      sort_order: sortOrder,
      status: "active",
    })
    .select("*")
    .single();

  if (error) throw mapPostgrestError(error);
  return created;
}

export async function updateModule(
  moduleId: string,
  teacherId: string,
  data: UpdateModuleInput,
): Promise<Module> {
  await ownedModule(moduleId, teacherId);
  const supabase = await createClient();

  const payload: {
    name?: string;
    description?: string | null;
    sort_order?: number;
  } = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.description !== undefined) payload.description = data.description;
  if (data.sort_order !== undefined) payload.sort_order = data.sort_order;

  const { data: updated, error } = await supabase
    .from("modules")
    .update(payload)
    .eq("id", moduleId)
    .select("*")
    .single();

  if (error) throw mapPostgrestError(error);
  return updated;
}

export async function reorderModules(
  teacherId: string,
  items: Array<{ id: string; sort_order: number }>,
): Promise<void> {
  const supabase = await createClient();
  await Promise.all(items.map((item) => ownedModule(item.id, teacherId)));
  await Promise.all(
    items.map(async (item) => {
      const result = await supabase
        .from("modules")
        .update({ sort_order: item.sort_order })
        .eq("id", item.id);
      unwrapVoid(result);
    }),
  );
}

export async function moveModule(
  moduleId: string,
  teacherId: string,
  techniqueId: string,
): Promise<Module> {
  await ownedModule(moduleId, teacherId);
  const target = await ownedTechnique(techniqueId, teacherId);
  if (target.status === "archived") {
    throw ApiError.conflict("Não é possível mover módulos para uma técnica arquivada");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("modules")
    .update({ technique_id: techniqueId })
    .eq("id", moduleId)
    .select("*")
    .single();

  if (error) throw mapPostgrestError(error);
  return data;
}

/** Arquiva o módulo e seus vídeos. */
export async function archiveModule(
  moduleId: string,
  teacherId: string,
): Promise<Module> {
  await ownedModule(moduleId, teacherId);
  const supabase = await createClient();

  const [moduleResult, videoResult] = await Promise.all([
    supabase
      .from("modules")
      .update({ status: "archived" })
      .eq("id", moduleId)
      .select("*")
      .single(),
    supabase.from("videos").update({ status: "archived" }).eq("module_id", moduleId),
  ]);

  if (moduleResult.error) throw mapPostgrestError(moduleResult.error);
  unwrapVoid(videoResult);
  return moduleResult.data;
}

/* -------------------------------------------------------------------------- */
/* Vídeos                                                                      */
/* -------------------------------------------------------------------------- */

export async function getVideos(
  moduleId: string,
  teacherId: string,
  includeArchived = false,
): Promise<Video[]> {
  await ownedModule(moduleId, teacherId);
  const supabase = await createClient();

  let query = supabase
    .from("videos")
    .select("*")
    .eq("module_id", moduleId)
    .order("created_at", { ascending: true });
  if (!includeArchived) query = query.neq("status", "archived");

  const { data, error } = await query;
  if (error) throw mapPostgrestError(error);
  return data ?? [];
}

export async function createVideo(
  teacherId: string,
  data: CreateVideoInput,
): Promise<Video> {
  const moduleRecord = await ownedModule(data.module_id, teacherId);
  if (moduleRecord.status === "archived") {
    throw ApiError.conflict("Não é possível adicionar vídeos a um módulo arquivado");
  }

  const status: VideoStatus = data.status ?? "uploading";
  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("videos")
    .insert({
      teacher_id: teacherId,
      module_id: data.module_id,
      technique_id: moduleRecord.technique_id,
      title: data.title,
      description: data.description ?? null,
      provider: isMuxConfigured() ? "mux" : "demo",
      provider_video_id: data.provider_video_id ?? `demo-${crypto.randomUUID()}`,
      thumbnail_url: data.thumbnail_url ?? null,
      playback_url: data.playback_url ?? (status === "ready" ? DEMO_VIDEO_URL : null),
      duration_seconds: data.duration_seconds ?? null,
      status,
      owner_id: teacherId,
      owner_role: "teacher",
      visibility: "library",
    })
    .select("*")
    .single();

  if (error) throw mapPostgrestError(error);
  return created;
}

export async function updateVideo(
  videoId: string,
  teacherId: string,
  data: UpdateVideoInput,
): Promise<Video> {
  await ownedVideo(videoId, teacherId);
  const supabase = await createClient();

  const payload: {
    title?: string;
    description?: string | null;
    thumbnail_url?: string | null;
    duration_seconds?: number | null;
  } = {};
  if (data.title !== undefined) payload.title = data.title;
  if (data.description !== undefined) payload.description = data.description;
  if (data.thumbnail_url !== undefined) payload.thumbnail_url = data.thumbnail_url;
  if (data.duration_seconds !== undefined) payload.duration_seconds = data.duration_seconds;

  const { data: updated, error } = await supabase
    .from("videos")
    .update(payload)
    .eq("id", videoId)
    .select("*")
    .single();

  if (error) throw mapPostgrestError(error);
  return updated;
}

export async function getVideo(videoId: string, teacherId: string): Promise<Video> {
  return ownedVideo(videoId, teacherId);
}

export async function setVideoStatus(
  videoId: string,
  teacherId: string,
  status: VideoStatus,
): Promise<Video> {
  await ownedVideo(videoId, teacherId);
  const supabase = await createClient();

  const payload: { status: VideoStatus; playback_url?: string } = { status };
  if (status === "ready") payload.playback_url = DEMO_VIDEO_URL;

  const { data, error } = await supabase
    .from("videos")
    .update(payload)
    .eq("id", videoId)
    .select("*")
    .single();

  if (error) throw mapPostgrestError(error);
  return data;
}

export async function archiveVideo(videoId: string, teacherId: string): Promise<Video> {
  await ownedVideo(videoId, teacherId);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("videos")
    .update({ status: "archived" })
    .eq("id", videoId)
    .select("*")
    .single();

  if (error) throw mapPostgrestError(error);
  return data;
}

/** Impede exclusão quando há referências em planos ou aulas. */
export async function deleteVideo(videoId: string, teacherId: string): Promise<void> {
  await ownedVideo(videoId, teacherId);
  const supabase = await createClient();

  const [planRefs, lessonRefs] = await Promise.all([
    supabase
      .from("plan_day_videos")
      .select("id", { count: "exact", head: true })
      .eq("video_id", videoId),
    supabase
      .from("lesson_videos")
      .select("id", { count: "exact", head: true })
      .eq("video_id", videoId),
  ]);

  if (planRefs.error) throw mapPostgrestError(planRefs.error);
  if (lessonRefs.error) throw mapPostgrestError(lessonRefs.error);

  if ((planRefs.count ?? 0) > 0 || (lessonRefs.count ?? 0) > 0) {
    throw ApiError.conflict(
      "Este vídeo está associado a planos ou aulas e não pode ser excluído. Arquive o vídeo para preservar o histórico.",
    );
  }

  unwrapVoid(await supabase.from("videos").delete().eq("id", videoId));
}

/** Atualiza o status a partir do webhook do provedor (sem escopo de professor). */
export async function applyVideoWebhook(
  providerVideoId: string,
  status: VideoStatus,
  metadata: { thumbnail_url?: string | null; duration_seconds?: number | null } = {},
): Promise<boolean> {
  if (!isAdminClientAvailable()) {
    throw new ApiError(503, "INTERNAL_ERROR", "Webhook indisponível sem SUPABASE_SECRET_KEY");
  }

  const admin = createAdminClient();
  const { data: video, error } = await admin
    .from("videos")
    .select("id")
    .eq("provider_video_id", providerVideoId)
    .maybeSingle();

  if (error) throw mapPostgrestError(error);
  if (!video) return false;

  const payload: {
    status: VideoStatus;
    thumbnail_url?: string | null;
    duration_seconds?: number | null;
    playback_url?: string;
  } = { status };
  if (metadata.thumbnail_url !== undefined) payload.thumbnail_url = metadata.thumbnail_url;
  if (metadata.duration_seconds !== undefined) {
    payload.duration_seconds = metadata.duration_seconds;
  }
  if (status === "ready") payload.playback_url = DEMO_VIDEO_URL;

  const result = await admin.from("videos").update(payload).eq("id", video.id);
  unwrapVoid(result);
  return true;
}

export async function searchVideos(
  teacherId: string,
  options: {
    search?: string;
    includeArchived?: boolean;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<{
  videos: VideoWithContext[];
  pagination: ReturnType<typeof buildPagination>;
}> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(Math.max(1, options.pageSize ?? 20), 100);
  const from = (page - 1) * pageSize;

  let query = supabase
    .from("videos")
    .select("*", { count: "exact" })
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (!options.includeArchived) query = query.neq("status", "archived");
  const search = (options.search ?? "").trim();
  if (search) query = query.ilike("title", `%${search}%`);

  const { data, error, count } = await query;
  if (error) throw mapPostgrestError(error);

  const videos = data ?? [];
  const moduleIds = Array.from(new Set(videos.map((item) => item.module_id)));
  const techniqueIds = Array.from(new Set(videos.map((item) => item.technique_id)));

  const [modules, techniques] = await Promise.all([
    moduleIds.length > 0
      ? supabase.from("modules").select("id, name").in("id", moduleIds)
      : Promise.resolve({ data: [], error: null }),
    techniqueIds.length > 0
      ? supabase.from("techniques").select("id, name").in("id", techniqueIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (modules.error) throw mapPostgrestError(modules.error);
  if (techniques.error) throw mapPostgrestError(techniques.error);

  const moduleNames = new Map((modules.data ?? []).map((item) => [item.id, item.name]));
  const techniqueNames = new Map((techniques.data ?? []).map((item) => [item.id, item.name]));

  const withContext: VideoWithContext[] = videos.map((video) => ({
    ...video,
    module_name: moduleNames.get(video.module_id) ?? "Módulo",
    technique_name: techniqueNames.get(video.technique_id) ?? "Técnica",
  }));

  return {
    videos: withContext,
    pagination: buildPagination(count ?? 0, page, pageSize),
  };
}

/** Gera URL de reprodução para o professor, exigindo status ready. */
export async function getTeacherPlaybackUrl(
  videoId: string,
  teacherId: string,
): Promise<string> {
  const video = await ownedVideo(videoId, teacherId);
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

export async function grantTechniqueAccess(
  teacherId: string,
  enrollmentId: string,
  techniqueId: string,
): Promise<TechniqueAccess> {
  const supabase = await createClient();

  const enrollment = unwrapMaybe(
    await supabase
      .from("enrollments")
      .select("id, teacher_id")
      .eq("id", enrollmentId)
      .maybeSingle(),
  );
  if (!enrollment) throw ApiError.notFound("Aluno não encontrado");
  if (enrollment.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");

  const technique = await ownedTechnique(techniqueId, teacherId);
  if (technique.status === "archived") throw ApiError.conflict("Técnica arquivada");

  const existing = unwrapMaybe(
    await supabase
      .from("student_technique_access")
      .select("id")
      .eq("enrollment_id", enrollmentId)
      .eq("technique_id", techniqueId)
      .is("revoked_at", null)
      .maybeSingle(),
  );
  if (existing) throw ApiError.conflict("O aluno já tem acesso a esta técnica");

  const { data, error } = await supabase
    .from("student_technique_access")
    .insert({
      teacher_id: teacherId,
      enrollment_id: enrollmentId,
      technique_id: techniqueId,
      module_id: null,
      video_id: null,
      revoked_at: null,
    })
    .select("*")
    .single();

  if (error) throw mapPostgrestError(error);
  return data;
}

export async function revokeAccess(accessId: string, teacherId: string): Promise<void> {
  const supabase = await createClient();
  const access = unwrapMaybe(
    await supabase
      .from("student_technique_access")
      .select("id, teacher_id")
      .eq("id", accessId)
      .maybeSingle(),
  );

  if (!access) throw ApiError.notFound("Permissão não encontrada");
  if (access.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");

  unwrapVoid(
    await supabase
      .from("student_technique_access")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", accessId),
  );
}

export async function getAccessForEnrollment(
  enrollmentId: string,
  teacherId: string,
): Promise<Array<TechniqueAccess & { technique_name: string }>> {
  const supabase = await createClient();

  const enrollment = unwrapMaybe(
    await supabase
      .from("enrollments")
      .select("id, teacher_id")
      .eq("id", enrollmentId)
      .maybeSingle(),
  );
  if (!enrollment) throw ApiError.notFound("Aluno não encontrado");
  if (enrollment.teacher_id !== teacherId) throw ApiError.forbidden("Acesso negado");

  const { data, error } = await supabase
    .from("student_technique_access")
    .select("*")
    .eq("enrollment_id", enrollmentId)
    .is("revoked_at", null);

  if (error) throw mapPostgrestError(error);

  const access = data ?? [];
  const techniqueIds = Array.from(
    new Set(access.map((item) => item.technique_id).filter((id): id is string => Boolean(id))),
  );

  const techniques = techniqueIds.length
    ? await supabase.from("techniques").select("id, name").in("id", techniqueIds)
    : { data: [], error: null };
  if (techniques.error) throw mapPostgrestError(techniques.error);

  const names = new Map((techniques.data ?? []).map((item) => [item.id, item.name]));
  return access.map((item) => ({
    ...item,
    technique_name: item.technique_id ? names.get(item.technique_id) ?? "Técnica" : "Técnica",
  }));
}
