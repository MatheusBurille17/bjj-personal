import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { getEnrollments } from "@/lib/services/enrollment.service";
import { StudentsView } from "@/components/students/students-view";

export const metadata: Metadata = { title: "Alunos" };
export const dynamic = "force-dynamic";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const params = await searchParams;

  const result = getEnrollments(session.user.id, {
    search: "",
    status: ["active", "paused", "pending"],
    page: 1,
    pageSize: 20,
  });

  return (
    <StudentsView
      initialEnrollments={result.enrollments}
      initialPagination={result.pagination}
      initialOpen={params.new === "1"}
    />
  );
}
