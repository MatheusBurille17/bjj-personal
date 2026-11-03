import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import {
  getWeeklyAgenda,
  getWeeklySlots,
} from "@/lib/services/lesson.service";
import { getEnrollments } from "@/lib/services/enrollment.service";
import { getPlanDetail, getPlans } from "@/lib/services/plan.service";
import { getLibraryTree } from "@/lib/services/library.service";
import { ScheduleView } from "@/components/schedule/schedule-view";
import type { PlanDayOption, VideoOption } from "@/types/lesson";

export const metadata: Metadata = { title: "Agenda" };
export const dynamic = "force-dynamic";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; student?: string; lesson?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const params = await searchParams;

  const agenda = await getWeeklyAgenda(session.user.id);
  const slots = await getWeeklySlots(session.user.id);
  const enrollments = (
    await getEnrollments(session.user.id, {
      search: "",
      status: ["active", "paused"],
      page: 1,
      pageSize: 100,
    })
  ).enrollments;

  const plans = (
    await getPlans(session.user.id, {
      status: ["published", "draft"],
      page: 1,
      pageSize: 100,
    })
  ).plans;
  const planDays: PlanDayOption[] = [];
  for (const plan of plans) {
    const detail = await getPlanDetail(plan.id, session.user.id);
    for (const day of detail.days) {
      planDays.push({
        id: day.id,
        title: day.title,
        plan_title: plan.title,
        weekday: day.weekday,
        planned_date: day.planned_date,
      });
    }
  }

  const tree = await getLibraryTree(session.user.id);
  const videos: VideoOption[] = [];
  for (const technique of tree.techniques) {
    for (const moduleRecord of tree.modules[technique.id] ?? []) {
      for (const video of tree.videos[moduleRecord.id] ?? []) {
        if (video.status !== "ready") continue;
        videos.push({
          id: video.id,
          title: video.title,
          technique_name: technique.name,
          module_name: moduleRecord.name,
        });
      }
    }
  }

  return (
    <ScheduleView
      initialAgenda={agenda}
      weeklySlots={slots}
      enrollments={enrollments}
      planDays={planDays}
      videos={videos}
      initialNew={params.new === "1"}
      initialStudent={params.student}
      initialLessonId={params.lesson}
    />
  );
}
