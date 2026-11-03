"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronDown,
  ClipboardList,
  History,
  Home,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/feedback";
import type { UserRole } from "@/types/auth";

export type NavIcon =
  | "dashboard"
  | "calendar"
  | "users"
  | "plans"
  | "library"
  | "settings"
  | "home"
  | "history"
  | "profile";

const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  calendar: CalendarDays,
  users: Users,
  plans: ClipboardList,
  library: Library,
  settings: Settings,
  home: Home,
  history: History,
  profile: UserRound,
};

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  exact?: boolean;
}

export interface ShellUser {
  name: string;
  email: string;
  avatar_url: string | null;
  role: UserRole;
  canSwitchRole: boolean;
}

export function AppShell({
  children,
  navItems,
  user,
  areaLabel,
}: {
  children: React.ReactNode;
  navItems: NavItem[];
  user: ShellUser;
  areaLabel: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  async function logout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("Não foi possível sair. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function switchRole() {
    const nextRole = user.role === "teacher" ? "student" : "teacher";
    setLoading(true);
    try {
      const response = await fetch("/api/auth/switch-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!response.ok) throw new Error();
      router.push(nextRole === "teacher" ? "/dashboard" : "/portal");
      router.refresh();
    } catch {
      toast.error("Não foi possível alternar a visão.");
    } finally {
      setLoading(false);
    }
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-3 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-black text-primary-foreground">
          JJ
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">Jiu-Jitsu App</p>
          <p className="truncate text-[11px] uppercase tracking-wider text-muted-foreground">
            {areaLabel}
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {navItems.map((item) => {
          const Icon = NAV_ICONS[item.icon];
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Ambiente de demonstração</p>
          <p className="mt-1 leading-relaxed">
            Dados locais. Convites e recuperação de senha ficam na caixa de saída de teste.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-mat-50/70">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-card lg:block">
        {sidebar}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full w-72 border-r bg-card shadow-xl">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-3"
              onClick={() => setMobileOpen(false)}
              aria-label="Fechar menu"
            >
              <X className="h-4 w-4" />
            </Button>
            {sidebar}
          </div>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b bg-card/90 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div>
              <p className="text-sm font-semibold">Olá, {user.name.split(" ")[0]}</p>
              <p className="hidden text-xs text-muted-foreground sm:block">
                {user.role === "teacher" ? "Painel do professor" : "Portal do aluno"}
              </p>
            </div>
          </div>

          <div className="relative flex items-center gap-2">
            {user.canSwitchRole ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void switchRole()}
                loading={loading}
                className="hidden sm:inline-flex"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {user.role === "teacher" ? "Ver como aluno" : "Ver como professor"}
              </Button>
            ) : null}

            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              className="flex items-center gap-2 rounded-full border bg-card p-1 pr-2 transition-colors hover:bg-muted"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <Avatar src={user.avatar_url} name={user.name} size="sm" />
              <span className="hidden max-w-[120px] truncate text-sm font-medium sm:block">
                {user.name}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>

            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-12 z-30 w-64 animate-fade-in rounded-xl border bg-card p-2 shadow-lg"
              >
                <div className="px-2 py-2">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
                <div className="my-1 h-px bg-border" />
                <Link
                  href={user.role === "teacher" ? "/settings" : "/portal/profile"}
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                  role="menuitem"
                >
                  Meu perfil
                </Link>
                {user.canSwitchRole ? (
                  <button
                    type="button"
                    onClick={() => void switchRole()}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted sm:hidden"
                    role="menuitem"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {user.role === "teacher" ? "Ver como aluno" : "Ver como professor"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                  role="menuitem"
                  disabled={loading}
                >
                  <LogOut className="h-4 w-4" />
                  Sair da conta
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <main className="page-container">{children}</main>
      </div>
    </div>
  );
}
