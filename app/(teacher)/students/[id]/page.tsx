import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { getEnrollmentDetail } from "@/lib/services/enrollment.service";
import { getLessons, getWeeklySlots } from "@/lib/services/lesson.service";
import { getAccessForEnrollment, getTechniques } from "@/lib/services/library.service";
import { ApiError } from "@/lib/middleware/errors";
import { StudentDetailView } from "@/components/students/student-detail-view";

export const metadata: Metadata = { title: "Ficha do aluno" };
export const dynamic = "force-dynamic";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const { id } = await params;

  try {
    const enrollment = getEnrollmentDetail(id, session.user.id);
    const lessons = getLessons(session.user.id, {
      enrollment_id: id,
      pageSize: 100,
    }).lessons;
    const access = getAccessForEnrollment(id, session.user.id);
    const techniques = getTechniques(session.user.id, {
      includeArchived: true,
      pageSize: 100,
    }).techniques;
    const weeklySlots = getWeeklySlots(session.user.id, id);

    return (
      <StudentDetailView
        enrollment={enrollment}
        lessons={lessons}
        access={access}
        techniques={techniques}
        weeklySlots={weeklySlots}
      />
    );
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
      notFound();
    }
    throw error;
  }
}
