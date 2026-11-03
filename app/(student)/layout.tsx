import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { AppShell, type NavItem } from "@/components/layout/app-shell";

const navItems: NavItem[] = [
  { href: "/portal", label: "Início", icon: "home", exact: true },
  { href: "/portal/agenda", label: "Minha agenda", icon: "calendar" },
  { href: "/portal/plan", label: "Meu plano de treinamento", icon: "plans" },
  { href: "/portal/library", label: "Biblioteca", icon: "library" },
  { href: "/portal/history", label: "Meu histórico", icon: "history" },
  { href: "/portal/profile", label: "Meu perfil", icon: "profile" },
];

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.roles.is_student) redirect("/dashboard");

  return (
    <AppShell
      navItems={navItems}
      areaLabel="Portal do aluno"
      user={{
        name: session.profile.full_name,
        email: session.profile.email,
        avatar_url: session.profile.avatar_url,
        role: "student",
        canSwitchRole: session.roles.is_teacher,
      }}
    >
      {children}
    </AppShell>
  );
}
