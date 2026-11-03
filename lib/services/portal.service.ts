import type { Enrollment } from "@/types/enrollment";
import type {
  StudentDashboardData,
  StudentLessonDetail,
  StudentLessonItem,
  StudentStatistics,
  StudentTeacher,
} from "@/types/lesson";
import type {
  StudentLibraryTechnique,
  StudentPlan,
  StudentTechniqueVideos,
  StudentVideo,
} from "@/types/plan";
import type { Video } from "@/types/library";
import type { ProfileResponse } from "@/types/auth";
import { ApiError } from "@/lib/middleware/errors";
import { buildSignedPlaybackUrl } from "@/lib/mux/playback";
import { createClient } from "@/lib/supabase/server";
import { mapPostgrestError, unwrapMaybe } from "@/lib/supabase/errors";
import { getProfileView } from "./profile.service";
import { getStudentPlans } from "./plan.service";
import { getStudentEnrollments } from "./enrollment.service";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";

type Client = SupabaseClient<Database>;
type LessonRow = Database["public"]["Tables"]["lessons"]["Row"];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

async function activeEnrollments(studentId: string): Promise<Enrollment[]> {
  const enrollments = await getStudentEnrollments(studentId);
  return enrollments.filter((item) => item.status === "active");
}

async function teacherNames(
  supabase: Client,
  teacherIds: string[],
): Promise<Map<string, string>> {
  if (teacherIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("teachers")
    .select("id, display_name")
    .in("id", teacherIds);

  if (error) throw mapPostgrestError(error);
  return new Map((data ?? []).map((teacher) => [teacher.id, teacher.display_name]));
}

function studentPlaybackUrl(video: Video): string | null {
  return buildSignedPlaybackUrl(video.provider_video_id) ?? video.playback_url;
}

async function lessonVideoCounts(
  supabase: Client,
  lessonIds: string[],
): Promise<Map<string, number>> {
  if (lessonIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("lesson_videos")
    .select("lesson_id")
    .in("lesson_id", lessonIds);

  if (error) throw mapPostgrestError(error);
  const counts = new Map<string, number>();
  for (const item of data ?? []) {
    counts.set(item.lesson_id, (counts.get(item.lesson_id) ?? 0) + 1);
  }
  return counts;
}

function toStudentItem(
  lesson: LessonRow,
  enrollment:
    | { student_name: string; student_email: string; status: string }
    | undefined,
  teacherName: string,
  videoCount: number,
): StudentLessonItem {
  return {
    id: lesson.id,
    teacher_id: lesson.teacher_id,
    enrollment_id: lesson.enrollment_id,
    plan_day_id: lesson.plan_day_id,
    starts_at: lesson.starts_at,
    ends_at: lesson.ends_at,
    status: lesson.status,
    completed_at: lesson.completed_at,
    shared_notes: lesson.shared_notes,
    title_snapshot: lesson.title_snapshot,
    objective_snapshot: lesson.objective_snapshot,
    rescheduled_from_id: lesson.rescheduled_from_id,
    created_at: lesson.created_at,
    updated_at: lesson.updated_at,
    student_name: enrollment?.student_name ?? "Aluno",
    student_email: enrollment?.student_email ?? "",
    enrollment_status: enrollment?.status ?? "active",
    plan_day_title: lesson.title_snapshot,
    video_count: videoCount,
    teacher_name: teacherName,
  };
}

async function studentLessonDetail(
  lessonId: string,
  studentId: string,
): Promise<StudentLessonDetail | null> {
  const supabase = await createClient();
  const lesson = unwrapMaybe(
    await supabase.from("lessons").select("*").eq("id", lessonId).maybeSingle(),
  );
  if (!lesson) return null;

  const enrollment = unwrapMaybe(
    await supabase
      .from("enrollments")
      .select("id, teacher_id, student_profile_id, student_name, student_email, status, started_at, archived_at, invite_token, invite_expires_at, created_at, updated_at")
      .eq("id", lesson.enrollment_id)
      .maybeSingle(),
  );
  if (
    !enrollment ||
    enrollment.student_profile_id !== studentId ||
    enrollment.status !== "active"
  ) {
    return null;
  }
  if (lesson.status !== "scheduled" && lesson.status !== "completed") {
    return null;
  }

  const [planDay, associations, teacher] = await Promise.all([
    lesson.plan_day_id
      ? supabase.from("plan_days").select("*").eq("id", lesson.plan_day_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("lesson_videos")
      .select("*")
      .eq("lesson_id", lessonId)
      .order("sort_order", { ascending: true }),
    supabase.from("teachers").select("display_name").eq("id", lesson.teacher_id).maybeSingle(),
  ]);

  if (associations.error) throw mapPostgrestError(associations.error);

  const rows = associations.data ?? [];
  const videos: Array<{
    id: string;
    lesson_id: string;
    video_id: string;
    source: "plan" | "manual";
    sort_order: number;
    created_at: string;
    video: Video;
  }> = [];

  if (rows.length > 0) {
    const { data: videoRows, error } = await supabase
      .from("videos")
      .select("*")
      .in(
        "id",
        rows.map((item) => item.video_id),
      );
    if (error) throw mapPostgrestError(error);

    const map = new Map((videoRows ?? []).map((video) => [video.id, video]));
    for (const association of rows) {
      const video = map.get(association.video_id);
      if (!video) continue;
      videos.push({
        ...association,
        video: {
          ...video,
          playback_url: video.status === "ready" ? studentPlaybackUrl(video) : null,
        },
      });
    }
  }

  return {
    ...toStudentItem(
      lesson,
      enrollment,
      teacher.data?.display_name ?? "Professor",
      rows.length,
    ),
    plan_day: planDay.data ?? null,
    videos,
    teacher_name: teacher.data?.display_name ?? "Professor",
  };
}

/** IDs de vídeos que o aluno pode assistir (técnica, aula ou plano publicado). */
async function authorizedVideoIds(studentId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const enrollments = await activeEnrollments(studentId);
  const enrollmentIds = enrollments.map((item) => item.id);
  if (enrollmentIds.length === 0) return new Set();

  const ids = new Set<string>();

  const access = await supabase
    .from("student_technique_access")
    .select("technique_id")
    .in("enrollment_id", enrollmentIds)
    .is("revoked_at", null);
  if (access.error) throw mapPostgrestError(access.error);

  const techniqueIds = (access.data ?? [])
    .map((item) => item.technique_id)
    .filter((id): id is string => Boolean(id));
  if (techniqueIds.length > 0) {
    const { data, error } = await supabase
      .from("videos")
      .select("id")
      .in("technique_id", techniqueIds)
      .neq("status", "archived");
    if (error) throw mapPostgrestError(error);
    for (const video of data ?? []) ids.add(video.id);
  }

  const lessons = await supabase
    .from("lessons")
    .select("id")
    .in("enrollment_id", enrollmentIds)
    .in("status", ["scheduled", "completed"]);
  if (lessons.error) throw mapPostgrestError(lessons.error);

  const lessonIds = (lessons.data ?? []).map((item) => item.id);
  if (lessonIds.length > 0) {
    const { data, error } = await supabase
      .from("lesson_videos")
      .select("video_id")
      .in("lesson_id", lessonIds);
    if (error) throw mapPostgrestError(error);
    for (const item of data ?? []) ids.add(item.video_id);
  }

  const planAccess = await supabase
    .from("plan_enrollments")
    .select("monthly_plan_id")
    .in("enrollment_id", enrollmentIds);
  if (planAccess.error) throw mapPostgrestError(planAccess.error);

  const planIds = (planAccess.data ?? []).map((item) => item.monthly_plan_id);
  if (planIds.length > 0) {
    const plans = await supabase
      .from("monthly_plans")
      .select("id")
      .in("id", planIds)
      .eq("status", "published");
    if (plans.error) throw mapPostgrestError(plans.error);

    const publishedIds = (plans.data ?? []).map((plan) => plan.id);
    if (publishedIds.length > 0) {
      const days = await supabase
        .from("plan_days")
        .select("id")
        .in("monthly_plan_id", publishedIds);
      if (days.error) throw mapPostgrestError(days.error);

      const dayIds = (days.data ?? []).map((day) => day.id);
      if (dayIds.length > 0) {
        const associations = await supabase
          .from("plan_day_videos")
          .select("video_id")
          .in("plan_day_id", dayIds);
        if (associations.error) throw mapPostgrestError(associations.error);
        for (const item of associations.data ?? []) ids.add(item.video_id);
      }
    }
  }

  return ids;
}

/* -------------------------------------------------------------------------- */
/* Dashboard / estatísticas                                                    */
/* -------------------------------------------------------------------------- */

export async function getStudentTeachers(studentId: string): Promise<StudentTeacher[]> {
  const supabase = await createClient();
  const enrollments = (await activeEnrollments(studentId)).filter(
    (item) => item.status === "active",
  );
  if (enrollments.length === 0) return [];

  const names = await teacherNames(
    supabase,
    Array.from(new Set(enrollments.map((item) => item.teacher_id))),
  );
  const enrollmentIds = enrollments.map((item) => item.id);

  const { data: lessons, error } = await supabase
    .from("lessons")
    .select("id, enrollment_id, status, starts_at")
    .in("enrollment_id", enrollmentIds);
  if (error) throw mapPostgrestError(error);

  const now = Date.now();
  return enrollments.map((enrollment) => {
    const enrollmentLessons = (lessons ?? []).filter(
      (lesson) => lesson.enrollment_id === enrollment.id,
    );
    const next = enrollmentLessons
      .filter(
        (lesson) =>
          lesson.status === "scheduled" && new Date(lesson.starts_at).getTime() >= now,
      )
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];

    return {
      enrollment_id: enrollment.id,
      teacher_id: enrollment.teacher_id,
      display_name: names.get(enrollment.teacher_id) ?? "Professor",
      avatar_url: null,
      status: enrollment.status,
      started_at: enrollment.started_at,
      next_lesson: next ? { id: next.id, starts_at: next.starts_at } : null,
      completed_lessons: enrollmentLessons.filter(
        (lesson) => lesson.status === "completed",
      ).length,
    };
  });
}

export async function getStudentStatistics(studentId: string): Promise<StudentStatistics> {
  const supabase = await createClient();
  const enrollments = await activeEnrollments(studentId);
  if (enrollments.length === 0) {
    return { total_completed: 0, first_completed_at: null, by_teacher: [] };
  }

  const { data, error } = await supabase
    .from("lessons")
    .select("enrollment_id, status, completed_at")
    .in(
      "enrollment_id",
      enrollments.map((item) => item.id),
    )
    .eq("status", "completed");
  if (error) throw mapPostgrestError(error);

  const completed = data ?? [];
  const names = await teacherNames(
    supabase,
    Array.from(new Set(enrollments.map((item) => item.teacher_id))),
  );

  return {
    total_completed: completed.length,
    first_completed_at:
      completed
        .map((lesson) => lesson.completed_at)
        .filter((value): value is string => Boolean(value))
        .sort()[0] ?? null,
    by_teacher: enrollments.map((enrollment) => ({
      enrollment_id: enrollment.id,
      teacher_name: names.get(enrollment.teacher_id) ?? "Professor",
      completed: completed.filter(
        (lesson) => lesson.enrollment_id === enrollment.id,
      ).length,
    })),
  };
}

export async function getStudentDashboard(
  studentId: string,
): Promise<StudentDashboardData> {
  const supabase = await createClient();
  const enrollments = await activeEnrollments(studentId);
  const enrollmentIds = enrollments.map((item) => item.id);

  if (enrollmentIds.length === 0) {
    return {
      next_lesson: null,
      total_completed: 0,
      recent_lessons: [],
      upcoming_lessons: [],
      published_plans: 0,
      authorized_videos: 0,
      teachers: [],
    };
  }

  const [lessonsResult, plans, authorized, teachers] = await Promise.all([
    supabase
      .from("lessons")
      .select("*")
      .in("enrollment_id", enrollmentIds)
      .order("starts_at", { ascending: true }),
    getStudentPlans(studentId),
    authorizedVideoIds(studentId),
    getStudentTeachers(studentId),
  ]);

  if (lessonsResult.error) throw mapPostgrestError(lessonsResult.error);

  const lessons = lessonsResult.data ?? [];
  const now = Date.now();
  const upcoming = lessons.filter(
    (lesson) =>
      lesson.status === "scheduled" && new Date(lesson.starts_at).getTime() >= now,
  );
  const completed = lessons
    .filter((lesson) => lesson.status === "completed")
    .sort((a, b) =>
      (b.completed_at ?? b.starts_at).localeCompare(a.completed_at ?? a.starts_at),
    );

  const enrollmentMap = new Map(enrollments.map((item) => [item.id, item]));
  const names = await teacherNames(
    supabase,
    Array.from(new Set(lessons.map((item) => item.teacher_id))),
  );
  const counts = await lessonVideoCounts(supabase, lessons.map((item) => item.id));

  const toItem = (lesson: LessonRow) =>
    toStudentItem(
      lesson,
      enrollmentMap.get(lesson.enrollment_id),
      names.get(lesson.teacher_id) ?? "Professor",
      counts.get(lesson.id) ?? 0,
    );

  const recent = (
    await Promise.all(completed.slice(0, 3).map((lesson) => studentLessonDetail(lesson.id, studentId)))
  ).filter((item): item is StudentLessonDetail => Boolean(item));

  return {
    next_lesson: upcoming[0] ? toItem(upcoming[0]) : null,
    total_completed: completed.length,
    recent_lessons: recent,
    upcoming_lessons: upcoming.slice(0, 3).map(toItem),
    published_plans: plans.length,
    authorized_videos: authorized.size,
    teachers,
  };
}

/* -------------------------------------------------------------------------- */
/* Agenda e histórico                                                          */
/* -------------------------------------------------------------------------- */

export async function getStudentAgenda(
  studentId: string,
  options: { from_date?: string; to_date?: string; enrollment_id?: string } = {},
): Promise<StudentLessonItem[]> {
  const supabase = await createClient();
  const allEnrollments = await activeEnrollments(studentId);
  const enrollments = allEnrollments.filter(
    (item) => !options.enrollment_id || item.id === options.enrollment_id,
  );

  if (options.enrollment_id && enrollments.length === 0) {
    throw ApiError.forbidden("Acesso negado");
  }
  if (enrollments.length === 0) return [];

  let query = supabase
    .from("lessons")
    .select("*")
    .in(
      "enrollment_id",
      enrollments.map((item) => item.id),
    )
    .in("status", ["scheduled", "completed"])
    .order("starts_at", { ascending: true });

  if (options.from_date) query = query.gte("starts_at", `${options.from_date}T00:00:00`);
  if (options.to_date) query = query.lte("starts_at", `${options.to_date}T23:59:59.999`);

  const { data, error } = await query;
  if (error) throw mapPostgrestError(error);

  const lessons = data ?? [];
  const enrollmentMap = new Map(enrollments.map((item) => [item.id, item]));
  const names = await teacherNames(
    supabase,
    Array.from(new Set(lessons.map((item) => item.teacher_id))),
  );
  const counts = await lessonVideoCounts(supabase, lessons.map((item) => item.id));

  return lessons.map((lesson) =>
    toStudentItem(
      lesson,
      enrollmentMap.get(lesson.enrollment_id),
      names.get(lesson.teacher_id) ?? "Professor",
      counts.get(lesson.id) ?? 0,
    ),
  );
}

export async function getStudentHistory(
  studentId: string,
  options: {
    from_date?: string;
    to_date?: string;
    enrollment_id?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<{
  lessons: StudentLessonDetail[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(Math.max(1, options.pageSize ?? 20), 100);
  const enrollments = (await activeEnrollments(studentId)).filter(
    (item) => !options.enrollment_id || item.id === options.enrollment_id,
  );

  if (options.enrollment_id && enrollments.length === 0) {
    throw ApiError.forbidden("Acesso negado");
  }
  if (enrollments.length === 0) {
    return {
      lessons: [],
      pagination: {
        total: 0,
        page,
        pageSize,
        totalPages: 0,
        hasNext: false,
        hasPrevious: page > 1,
      },
    };
  }

  const { data, error } = await supabase
    .from("lessons")
    .select("*")
    .in(
      "enrollment_id",
      enrollments.map((item) => item.id),
    )
    .eq("status", "completed");
  if (error) throw mapPostgrestError(error);

  const completed = (data ?? [])
    .filter((lesson) => {
      const key = (lesson.completed_at ?? lesson.starts_at).slice(0, 10);
      if (options.from_date && key < options.from_date) return false;
      if (options.to_date && key > options.to_date) return false;
      return true;
    })
    .sort((a, b) =>
      (b.completed_at ?? b.starts_at).localeCompare(a.completed_at ?? a.starts_at),
    );

  const total = completed.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const pageItems = (
    await Promise.all(
      completed
        .slice((page - 1) * pageSize, page * pageSize)
        .map((lesson) => studentLessonDetail(lesson.id, studentId)),
    )
  ).filter((item): item is StudentLessonDetail => Boolean(item));

  return {
    lessons: pageItems,
    pagination: {
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    },
  };
}

export async function getStudentLessonDetail(
  studentId: string,
  lessonId: string,
): Promise<StudentLessonDetail> {
  const detail = await studentLessonDetail(lessonId, studentId);
  if (!detail) {
    const supabase = await createClient();
    const exists = unwrapMaybe(
      await supabase.from("lessons").select("id").eq("id", lessonId).maybeSingle(),
    );
    if (!exists) throw ApiError.notFound("Aula não encontrada");
    throw ApiError.forbidden("Acesso negado");
  }
  return detail;
}

export async function getStudentNextLesson(
  studentId: string,
): Promise<StudentLessonItem | null> {
  const agenda = (await getStudentAgenda(studentId)).filter(
    (lesson) =>
      lesson.status === "scheduled" && new Date(lesson.starts_at).getTime() >= Date.now(),
  );
  return agenda[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Planos                                                                      */
/* -------------------------------------------------------------------------- */

export async function getStudentTrainingPlans(
  studentId: string,
  enrollmentId?: string,
): Promise<StudentPlan[]> {
  return getStudentPlans(studentId, enrollmentId);
}

/* -------------------------------------------------------------------------- */
/* Biblioteca                                                                  */
/* -------------------------------------------------------------------------- */

export async function getStudentLibraryTechniques(
  studentId: string,
): Promise<StudentLibraryTechnique[]> {
  const supabase = await createClient();
  const enrollments = await activeEnrollments(studentId);
  if (enrollments.length === 0) return [];

  const { data: access, error } = await supabase
    .from("student_technique_access")
    .select("*")
    .in(
      "enrollment_id",
      enrollments.map((item) => item.id),
    )
    .is("revoked_at", null)
    .not("technique_id", "is", null);
  if (error) throw mapPostgrestError(error);

  const rows = access ?? [];
  const techniqueIds = Array.from(
    new Set(rows.map((item) => item.technique_id).filter((id): id is string => Boolean(id))),
  );
  if (techniqueIds.length === 0) return [];

  const [techniques, modules, videos] = await Promise.all([
    supabase
      .from("techniques")
      .select("*")
      .in("id", techniqueIds)
      .eq("status", "active"),
    supabase
      .from("modules")
      .select("technique_id, status")
      .in("technique_id", techniqueIds),
    supabase
      .from("videos")
      .select("technique_id, status")
      .in("technique_id", techniqueIds),
  ]);

  if (techniques.error) throw mapPostgrestError(techniques.error);
  if (modules.error) throw mapPostgrestError(modules.error);
  if (videos.error) throw mapPostgrestError(videos.error);

  const moduleCounts = new Map<string, number>();
  for (const item of modules.data ?? []) {
    if (item.status !== "active") continue;
    moduleCounts.set(item.technique_id, (moduleCounts.get(item.technique_id) ?? 0) + 1);
  }
  const videoCounts = new Map<string, number>();
  for (const item of videos.data ?? []) {
    if (item.status === "archived") continue;
    const techniqueId = item.technique_id ?? "";
    videoCounts.set(techniqueId, (videoCounts.get(techniqueId) ?? 0) + 1);
  }

  const names = await teacherNames(
    supabase,
    Array.from(new Set((techniques.data ?? []).map((item) => item.teacher_id))),
  );

  const seen = new Set<string>();
  const result: StudentLibraryTechnique[] = [];
  for (const accessRow of rows) {
    const technique = (techniques.data ?? []).find(
      (item) => item.id === accessRow.technique_id,
    );
    if (!technique || seen.has(technique.id)) continue;
    seen.add(technique.id);
    result.push({
      id: technique.id,
      teacher_id: technique.teacher_id,
      teacher_name: names.get(technique.teacher_id) ?? "Professor",
      name: technique.name,
      description: technique.description,
      module_count: moduleCounts.get(technique.id) ?? 0,
      video_count: videoCounts.get(technique.id) ?? 0,
      access_id: accessRow.id,
    });
  }

  return result.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function getStudentTechniqueVideos(
  studentId: string,
  techniqueId: string,
): Promise<StudentTechniqueVideos> {
  const supabase = await createClient();
  const technique = unwrapMaybe(
    await supabase.from("techniques").select("*").eq("id", techniqueId).maybeSingle(),
  );
  if (!technique || technique.status === "archived") {
    throw ApiError.notFound("Técnica não encontrada");
  }

  const enrollments = await activeEnrollments(studentId);
  const enrollmentIds = enrollments.map((item) => item.id);

  const access = unwrapMaybe(
    await supabase
      .from("student_technique_access")
      .select("*")
      .in("enrollment_id", enrollmentIds)
      .eq("technique_id", techniqueId)
      .is("revoked_at", null)
      .maybeSingle(),
  );

  const [modulesResult, videosResult] = await Promise.all([
    supabase
      .from("modules")
      .select("*")
      .eq("technique_id", techniqueId)
      .eq("status", "active")
      .order("sort_order", { ascending: true }),
    supabase
      .from("videos")
      .select("*")
      .eq("technique_id", techniqueId)
      .neq("status", "archived"),
  ]);

  if (modulesResult.error) throw mapPostgrestError(modulesResult.error);
  if (videosResult.error) throw mapPostgrestError(videosResult.error);

  let allowedVideos = videosResult.data ?? [];
  let source: "technique" | "lesson" = "technique";

  if (!access) {
    const allowed = await authorizedVideoIds(studentId);
    allowedVideos = allowedVideos.filter((video) => allowed.has(video.id));
    source = "lesson";
    if (allowedVideos.length === 0) throw ApiError.forbidden("Acesso negado");
  }

  const names = await teacherNames(supabase, [technique.teacher_id]);
  const teacherName = names.get(technique.teacher_id) ?? "Professor";

  const modules = (modulesResult.data ?? [])
    .map((moduleRecord) => {
      const videos: StudentVideo[] = allowedVideos
        .filter((video) => video.module_id === moduleRecord.id)
        .map((video) => ({
          ...video,
          playback_url: video.status === "ready" ? studentPlaybackUrl(video) : null,
          module_name: moduleRecord.name,
          technique_name: technique.name,
          teacher_name: teacherName,
          access_source: source,
        }));

      return {
        id: moduleRecord.id,
        name: moduleRecord.name,
        description: moduleRecord.description,
        videos,
      };
    })
    .filter((item) => item.videos.length > 0);

  return {
    technique: {
      id: technique.id,
      teacher_id: technique.teacher_id,
      teacher_name: teacherName,
      name: technique.name,
      description: technique.description,
      module_count: modules.length,
      video_count: allowedVideos.length,
      access_id: access?.id ?? "",
    },
    modules,
    source,
  };
}

export async function getStudentVideoPlayback(
  studentId: string,
  videoId: string,
): Promise<{ playback_url: string; expires_in: number }> {
  const supabase = await createClient();
  const video = unwrapMaybe(
    await supabase.from("videos").select("*").eq("id", videoId).maybeSingle(),
  );
  if (!video) throw ApiError.notFound("Vídeo não encontrado");

  const allowed = await authorizedVideoIds(studentId);
  if (!allowed.has(videoId)) throw ApiError.forbidden("Acesso negado");
  if (video.status !== "ready") {
    throw ApiError.conflict("O vídeo ainda está sendo processado");
  }

  const url = studentPlaybackUrl(video);
  if (!url) throw ApiError.conflict("Reprodução indisponível no momento");
  return { playback_url: url, expires_in: 86_400 };
}

/* -------------------------------------------------------------------------- */
/* Perfil                                                                      */
/* -------------------------------------------------------------------------- */

export async function getStudentProfile(studentId: string): Promise<ProfileResponse> {
  const view = await getProfileView(studentId);
  return { profile: view.profile, roles: view.roles };
}

export async function countAuthorizedVideos(studentId: string): Promise<number> {
  return (await authorizedVideoIds(studentId)).size;
}
