import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { AppShell, type NavItem } from "@/components/layout/app-shell";

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", exact: true },
  { href: "/schedule", label: "Agenda", icon: "calendar" },
  { href: "/students", label: "Alunos", icon: "users" },
  { href: "/plans", label: "Planos de aula", icon: "plans" },
  { href: "/library", label: "Biblioteca de técnicas", icon: "library" },
  { href: "/settings", label: "Configurações", icon: "settings" },
];

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.roles.is_teacher) redirect("/portal");

  return (
    <AppShell
      navItems={navItems}
      areaLabel="Área do professor"
      user={{
        name: session.teacher?.display_name ?? session.profile.full_name,
        email: session.profile.email,
        avatar_url: session.profile.avatar_url,
        role: "teacher",
        canSwitchRole: session.roles.is_student,
      }}
    >
      {children}
    </AppShell>
  );
}
