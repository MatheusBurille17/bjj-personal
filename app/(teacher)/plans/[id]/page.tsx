import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { getPlanDetail } from "@/lib/services/plan.service";
import { getEnrollments } from "@/lib/services/enrollment.service";
import { getLibraryTree } from "@/lib/services/library.service";
import { ApiError } from "@/lib/middleware/errors";
import { PlanDetailView } from "@/components/plans/plan-detail-view";

export const metadata: Metadata = { title: "Plano de aula" };
export const dynamic = "force-dynamic";

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const { id } = await params;

  try {
    const plan = await getPlanDetail(id, session.user.id);
    const enrollments = (
      await getEnrollments(session.user.id, {
        search: "",
        status: ["active", "paused"],
        page: 1,
        pageSize: 100,
      })
    ).enrollments;
    const library = await getLibraryTree(session.user.id);

    return (
      <PlanDetailView
        plan={plan}
        availableEnrollments={enrollments}
        library={library}
      />
    );
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
      notFound();
    }
    throw error;
  }
}
