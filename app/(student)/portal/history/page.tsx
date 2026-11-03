import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { getStudentHistory, getStudentTeachers } from "@/lib/services/portal.service";
import { StudentHistoryView } from "@/components/portal/student-history-view";

export const metadata: Metadata = { title: "Meu histórico" };
export const dynamic = "force-dynamic";

export default async function StudentHistoryPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const history = await getStudentHistory(session.user.id, { page: 1, pageSize: 20 });
  const teachers = await getStudentTeachers(session.user.id);

  return <StudentHistoryView initial={history} teachers={teachers} />;
}
