import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { getStudentLibraryTechniques } from "@/lib/services/portal.service";
import { StudentLibraryView } from "@/components/portal/student-library-view";

export const metadata: Metadata = { title: "Biblioteca" };
export const dynamic = "force-dynamic";

export default async function StudentLibraryPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const techniques = getStudentLibraryTechniques(session.user.id);

  return <StudentLibraryView techniques={techniques} />;
}
