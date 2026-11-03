import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { getStudentAgenda, getStudentTeachers } from "@/lib/services/portal.service";
import { StudentAgendaView } from "@/components/portal/student-agenda-view";

export const metadata: Metadata = { title: "Minha agenda" };
export const dynamic = "force-dynamic";

export default async function StudentAgendaPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const lessons = getStudentAgenda(session.user.id);
  const teachers = getStudentTeachers(session.user.id);

  return <StudentAgendaView initialLessons={lessons} teachers={teachers} />;
}
