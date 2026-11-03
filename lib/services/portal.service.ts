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
import { getDb } from "@/lib/db/store";
import { ApiError } from "@/lib/middleware/errors";
import { buildSignedPlaybackUrl } from "@/lib/mux/playback";
import { toLessonListItem } from "./lesson.service";
import { getProfileView } from "./profile.service";
import { getStudentPlans } from "./plan.service";
import { getStudentEnrollments } from "./enrollment.service";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function activeEnrollments(studentId: string): Enrollment[] {
  return getStudentEnrollments(studentId).filter((item) => item.status === "active");
}

function teacherName(teacherId: string): string {
  const db = getDb();
  return (
    db.teachers.find((item) => item.id === teacherId)?.display_name ??
    db.profiles.find((item) => item.id === teacherId)?.full_name ??
    "Professor"
  );
}

function studentLessonItem(lessonId: string, studentEnrollments: Enrollment[]): StudentLessonItem | null {
  const lesson = getDb().lessons.find((item) => item.id === lessonId);
  if (!lesson) return null;
  if (!studentEnrollments.some((item) => item.id === lesson.enrollment_id)) return null;
  const { private_notes: _privateNotes, ...safe } = toLessonListItem(lesson);
  return {
    ...safe,
    teacher_name: teacherName(lesson.teacher_id),
  };
}

function studentLessonDetail(lessonId: string, studentId: string): StudentLessonDetail | null {
  const db = getDb();
  const lesson = db.lessons.find((item) => item.id === lessonId);
  if (!lesson) return null;

  const enrollment = db.enrollments.find((item) => item.id === lesson.enrollment_id);
  if (!enrollment || enrollment.student_profile_id !== studentId || enrollment.status !== "active") {
    return null;
  }
  if (lesson.status !== "scheduled" && lesson.status !== "completed") {
    return null;
  }

  const { private_notes: _privateNotes, ...safe } = toLessonListItem(lesson);
  const planDay = lesson.plan_day_id
    ? db.plan_days.find((item) => item.id === lesson.plan_day_id) ?? null
    : null;

  const videos = db.lesson_videos
    .filter((item) => item.lesson_id === lesson.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((association) => {
      const video = db.videos.find((item) => item.id === association.video_id);
      if (!video) return null;
      return {
        ...association,
        video: {
          ...video,
          playback_url: video.status === "ready" ? studentPlaybackUrl(video) : null,
        },
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    ...safe,
    plan_day: planDay,
    videos,
    teacher_name: teacherName(lesson.teacher_id),
  };
}

function studentPlaybackUrl(video: Video): string | null {
  return buildSignedPlaybackUrl(video.provider_video_id) ?? video.playback_url;
}

function hasTechniqueAccess(studentId: string, techniqueId: string): boolean {
  const db = getDb();
  const enrollments = activeEnrollments(studentId).map((item) => item.id);
  return db.student_technique_access.some(
    (access) =>
      enrollments.includes(access.enrollment_id) &&
      access.technique_id === techniqueId &&
      !access.revoked_at,
  );
}

function hasLessonVideoAccess(studentId: string, videoId: string): boolean {
  const db = getDb();
  const enrollments = new Set(activeEnrollments(studentId).map((item) => item.id));
  const lessonIds = db.lessons
    .filter(
      (lesson) =>
        enrollments.has(lesson.enrollment_id) &&
        (lesson.status === "scheduled" || lesson.status === "completed"),
    )
    .map((lesson) => lesson.id);
  return db.lesson_videos.some(
    (association) =>
      association.video_id === videoId && lessonIds.includes(association.lesson_id),
  );
}

/** Vídeos sugeridos por um plano publicado e liberado para o aluno. */
function hasPlanVideoAccess(studentId: string, videoId: string): boolean {
  const db = getDb();
  const enrollmentIds = activeEnrollments(studentId).map((item) => item.id);
  const planIds = db.plan_enrollments
    .filter((association) => enrollmentIds.includes(association.enrollment_id))
    .map((association) => association.monthly_plan_id)
    .filter((planId) =>
      db.monthly_plans.some((plan) => plan.id === planId && plan.status === "published"),
    );
  const dayIds = db.plan_days
    .filter((day) => planIds.includes(day.monthly_plan_id))
    .map((day) => day.id);
  return db.plan_day_videos.some(
    (association) =>
      association.video_id === videoId && dayIds.includes(association.plan_day_id),
  );
}

function authorizedVideoIds(studentId: string): Set<string> {
  const db = getDb();
  const enrollments = activeEnrollments(studentId);
  const enrollmentIds = enrollments.map((item) => item.id);
  const techniqueIds = db.student_technique_access
    .filter(
      (access) => enrollmentIds.includes(access.enrollment_id) && !access.revoked_at,
    )
    .map((access) => access.technique_id)
    .filter((id): id is string => Boolean(id));

  const ids = new Set(
    db.videos
      .filter((video) => techniqueIds.includes(video.technique_id) && video.status !== "archived")
      .map((video) => video.id),
  );

  const lessonIds = db.lessons
    .filter(
      (lesson) =>
        enrollmentIds.includes(lesson.enrollment_id) &&
        (lesson.status === "scheduled" || lesson.status === "completed"),
    )
    .map((lesson) => lesson.id);
  for (const association of db.lesson_videos.filter((item) => lessonIds.includes(item.lesson_id))) {
    ids.add(association.video_id);
  }

  const planIds = db.plan_enrollments
    .filter((association) => enrollmentIds.includes(association.enrollment_id))
    .map((association) => association.monthly_plan_id)
    .filter((planId) =>
      db.monthly_plans.some((plan) => plan.id === planId && plan.status === "published"),
    );
  const dayIds = db.plan_days
    .filter((day) => planIds.includes(day.monthly_plan_id))
    .map((day) => day.id);
  for (const association of db.plan_day_videos.filter((item) =>
    dayIds.includes(item.plan_day_id),
  )) {
    ids.add(association.video_id);
  }
  return ids;
}

/* -------------------------------------------------------------------------- */
/* Dashboard / estatísticas                                                    */
/* -------------------------------------------------------------------------- */

export function getStudentTeachers(studentId: string): StudentTeacher[] {
  const db = getDb();
  return getStudentEnrollments(studentId)
    .filter((item) => item.status === "active")
    .map((enrollment) => {
      const teacher = db.teachers.find((item) => item.id === enrollment.teacher_id);
      const profile = db.profiles.find((item) => item.id === enrollment.teacher_id);
      const next = db.lessons
        .filter(
          (lesson) =>
            lesson.enrollment_id === enrollment.id &&
            lesson.status === "scheduled" &&
            new Date(lesson.starts_at).getTime() >= Date.now(),
        )
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];

      return {
        enrollment_id: enrollment.id,
        teacher_id: enrollment.teacher_id,
        display_name: teacher?.display_name ?? profile?.full_name ?? "Professor",
        avatar_url: profile?.avatar_url ?? null,
        status: enrollment.status,
        started_at: enrollment.started_at,
        next_lesson: next ? { id: next.id, starts_at: next.starts_at } : null,
        completed_lessons: db.lessons.filter(
          (lesson) => lesson.enrollment_id === enrollment.id && lesson.status === "completed",
        ).length,
      };
    });
}

export function getStudentStatistics(studentId: string): StudentStatistics {
  const db = getDb();
  const enrollments = activeEnrollments(studentId);
  const completed = db.lessons.filter(
    (lesson) =>
      enrollments.some((item) => item.id === lesson.enrollment_id) &&
      lesson.status === "completed",
  );

  return {
    total_completed: completed.length,
    first_completed_at: completed
      .map((lesson) => lesson.completed_at)
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null,
    by_teacher: enrollments.map((enrollment) => ({
      enrollment_id: enrollment.id,
      teacher_name: teacherName(enrollment.teacher_id),
      completed: completed.filter((lesson) => lesson.enrollment_id === enrollment.id).length,
    })),
  };
}

export function getStudentDashboard(studentId: string): StudentDashboardData {
  const db = getDb();
  const enrollments = activeEnrollments(studentId);
  const enrollmentIds = new Set(enrollments.map((item) => item.id));
  const now = Date.now();

  const lessons = db.lessons.filter((lesson) => enrollmentIds.has(lesson.enrollment_id));
  const upcoming = lessons
    .filter((lesson) => lesson.status === "scheduled" && new Date(lesson.starts_at).getTime() >= now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const completed = lessons
    .filter((lesson) => lesson.status === "completed")
    .sort((a, b) => (b.completed_at ?? b.starts_at).localeCompare(a.completed_at ?? a.starts_at));

  const upcomingItems = upcoming
    .map((lesson) => studentLessonItem(lesson.id, enrollments))
    .filter((item): item is StudentLessonItem => Boolean(item));
  const recent = completed
    .slice(0, 3)
    .map((lesson) => studentLessonDetail(lesson.id, studentId))
    .filter((item): item is StudentLessonDetail => Boolean(item));

  const plans = getStudentPlans(studentId);
  const authorized = authorizedVideoIds(studentId);

  return {
    next_lesson: upcomingItems[0] ?? null,
    total_completed: completed.length,
    recent_lessons: recent,
    upcoming_lessons: upcomingItems.slice(0, 3),
    published_plans: plans.length,
    authorized_videos: authorized.size,
    teachers: getStudentTeachers(studentId),
  };
}

/* -------------------------------------------------------------------------- */
/* Agenda e histórico                                                          */
/* -------------------------------------------------------------------------- */

export function getStudentAgenda(
  studentId: string,
  options: { from_date?: string; to_date?: string; enrollment_id?: string } = {},
): StudentLessonItem[] {
  const db = getDb();
  const enrollments = activeEnrollments(studentId).filter(
    (item) => !options.enrollment_id || item.id === options.enrollment_id,
  );
  const enrollmentIds = new Set(enrollments.map((item) => item.id));

  if (options.enrollment_id && !enrollmentIds.has(options.enrollment_id)) {
    throw ApiError.forbidden("Acesso negado");
  }

  return db.lessons
    .filter((lesson) => enrollmentIds.has(lesson.enrollment_id))
    .filter((lesson) => lesson.status === "scheduled" || lesson.status === "completed")
    .filter((lesson) => {
      if (!options.from_date && !options.to_date) return true;
      const key = lesson.starts_at.slice(0, 10);
      if (options.from_date && key < options.from_date) return false;
      if (options.to_date && key > options.to_date) return false;
      return true;
    })
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .map((lesson) => studentLessonItem(lesson.id, enrollments))
    .filter((item): item is StudentLessonItem => Boolean(item));
}

export function getStudentHistory(
  studentId: string,
  options: {
    from_date?: string;
    to_date?: string;
    enrollment_id?: string;
    page?: number;
    pageSize?: number;
  } = {},
): {
  lessons: StudentLessonDetail[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
} {
  const db = getDb();
  const page = options.page ?? 1;
  const pageSize = Math.min(Math.max(1, options.pageSize ?? 20), 100);
  const enrollments = activeEnrollments(studentId).filter(
    (item) => !options.enrollment_id || item.id === options.enrollment_id,
  );
  const enrollmentIds = new Set(enrollments.map((item) => item.id));

  if (options.enrollment_id && !enrollmentIds.has(options.enrollment_id)) {
    throw ApiError.forbidden("Acesso negado");
  }

  const completed = db.lessons
    .filter((lesson) => enrollmentIds.has(lesson.enrollment_id) && lesson.status === "completed")
    .filter((lesson) => {
      const key = (lesson.completed_at ?? lesson.starts_at).slice(0, 10);
      if (options.from_date && key < options.from_date) return false;
      if (options.to_date && key > options.to_date) return false;
      return true;
    })
    .sort((a, b) => (b.completed_at ?? b.starts_at).localeCompare(a.completed_at ?? a.starts_at));

  const total = completed.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const pageItems = completed
    .slice((page - 1) * pageSize, page * pageSize)
    .map((lesson) => studentLessonDetail(lesson.id, studentId))
    .filter((item): item is StudentLessonDetail => Boolean(item));

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

export function getStudentLessonDetail(
  studentId: string,
  lessonId: string,
): StudentLessonDetail {
  const detail = studentLessonDetail(lessonId, studentId);
  if (!detail) {
    const exists = getDb().lessons.some((lesson) => lesson.id === lessonId);
    if (!exists) throw ApiError.notFound("Aula não encontrada");
    throw ApiError.forbidden("Acesso negado");
  }
  return detail;
}

export function getStudentNextLesson(studentId: string): StudentLessonItem | null {
  const agenda = getStudentAgenda(studentId).filter(
    (lesson) =>
      lesson.status === "scheduled" && new Date(lesson.starts_at).getTime() >= Date.now(),
  );
  return agenda[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Planos                                                                      */
/* -------------------------------------------------------------------------- */

export function getStudentTrainingPlans(studentId: string, enrollmentId?: string): StudentPlan[] {
  return getStudentPlans(studentId, enrollmentId);
}

/* -------------------------------------------------------------------------- */
/* Biblioteca                                                                  */
/* -------------------------------------------------------------------------- */

export function getStudentLibraryTechniques(studentId: string): StudentLibraryTechnique[] {
  const db = getDb();
  const enrollments = activeEnrollments(studentId);
  const enrollmentIds = enrollments.map((item) => item.id);
  const accessList = db.student_technique_access.filter(
    (access) =>
      enrollmentIds.includes(access.enrollment_id) &&
      !access.revoked_at &&
      access.technique_id,
  );

  const seen = new Set<string>();
  const techniques: StudentLibraryTechnique[] = [];
  for (const access of accessList) {
    const technique = db.techniques.find((item) => item.id === access.technique_id);
    if (!technique || technique.status === "archived" || seen.has(technique.id)) continue;
    seen.add(technique.id);
    techniques.push({
      id: technique.id,
      teacher_id: technique.teacher_id,
      teacher_name: teacherName(technique.teacher_id),
      name: technique.name,
      description: technique.description,
      module_count: db.modules.filter(
        (item) => item.technique_id === technique.id && item.status === "active",
      ).length,
      video_count: db.videos.filter(
        (video) => video.technique_id === technique.id && video.status !== "archived",
      ).length,
      access_id: access.id,
    });
  }

  return techniques.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export function getStudentTechniqueVideos(
  studentId: string,
  techniqueId: string,
): StudentTechniqueVideos {
  const db = getDb();
  const technique = db.techniques.find((item) => item.id === techniqueId);
  if (!technique || technique.status === "archived") throw ApiError.notFound("Técnica não encontrada");

  const enrollmentIds = activeEnrollments(studentId).map((item) => item.id);
  const techniqueAccess = db.student_technique_access.find(
    (access) =>
      enrollmentIds.includes(access.enrollment_id) &&
      access.technique_id === techniqueId &&
      !access.revoked_at,
  );

  const allTechniqueVideos = db.videos.filter(
    (video) => video.technique_id === techniqueId && video.status !== "archived",
  );

  let allowedVideos: Video[];
  let source: "technique" | "lesson" = "technique";

  if (techniqueAccess) {
    allowedVideos = allTechniqueVideos;
  } else {
    const lessonIds = db.lessons
      .filter(
        (lesson) =>
          enrollmentIds.includes(lesson.enrollment_id) &&
          (lesson.status === "scheduled" || lesson.status === "completed"),
      )
      .map((lesson) => lesson.id);
    const videoIds = new Set(
      db.lesson_videos
        .filter((association) => lessonIds.includes(association.lesson_id))
        .map((association) => association.video_id),
    );
    const planIds = db.plan_enrollments
      .filter((association) => enrollmentIds.includes(association.enrollment_id))
      .map((association) => association.monthly_plan_id);
    const dayIds = db.plan_days
      .filter((day) => planIds.includes(day.monthly_plan_id))
      .map((day) => day.id);
    for (const association of db.plan_day_videos.filter((item) =>
      dayIds.includes(item.plan_day_id),
    )) {
      videoIds.add(association.video_id);
    }
    allowedVideos = allTechniqueVideos.filter((video) => videoIds.has(video.id));
    source = "lesson";
    if (allowedVideos.length === 0) throw ApiError.forbidden("Acesso negado");
  }

  const modules = db.modules
    .filter((item) => item.technique_id === techniqueId && item.status === "active")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((moduleRecord) => {
      const videos: StudentVideo[] = allowedVideos
        .filter((video) => video.module_id === moduleRecord.id)
        .map((video) => ({
          ...video,
          playback_url: video.status === "ready" ? studentPlaybackUrl(video) : null,
          module_name: moduleRecord.name,
          technique_name: technique.name,
          teacher_name: teacherName(technique.teacher_id),
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
      teacher_name: teacherName(technique.teacher_id),
      name: technique.name,
      description: technique.description,
      module_count: modules.length,
      video_count: allowedVideos.length,
      access_id: techniqueAccess?.id ?? "",
    },
    modules,
    source,
  };
}

export function getStudentVideoPlayback(
  studentId: string,
  videoId: string,
): { playback_url: string; expires_in: number } {
  const db = getDb();
  const video = db.videos.find((item) => item.id === videoId);
  if (!video) throw ApiError.notFound("Vídeo não encontrado");

  const techniqueAllowed = hasTechniqueAccess(studentId, video.technique_id);
  const lessonAllowed = hasLessonVideoAccess(studentId, videoId);
  const planAllowed = hasPlanVideoAccess(studentId, videoId);
  if (!techniqueAllowed && !lessonAllowed && !planAllowed) {
    throw ApiError.forbidden("Acesso negado");
  }
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

export function getStudentProfile(studentId: string): ProfileResponse {
  const view = getProfileView(studentId);
  return { profile: view.profile, roles: view.roles };
}

export function countAuthorizedVideos(studentId: string): number {
  return authorizedVideoIds(studentId).size;
}
