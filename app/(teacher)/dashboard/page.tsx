import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  Library,
  Plus,
  UserPlus,
  Users,
} from "lucide-react";
import { getCurrentSession } from "@/lib/auth/session";
import { getTeacherDashboard } from "@/lib/services/lesson.service";
import { formatDate, formatTime } from "@/lib/utils/date";
import { PageHeader, StatCard, EmptyState } from "@/components/common/layout-pieces";
import { LessonStatusBadge } from "@/components/common/status-badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function TeacherDashboardPage() {
  const session = await getCurrentSession();
  if (!session) return null;
  const dashboard = await getTeacherDashboard(session.user.id);

  return (
    <div>
      <PageHeader
        title={`Bom treino, ${session.teacher?.display_name ?? session.profile.full_name.split(" ")[0]}!`}
        description="Uma visão rápida da sua rotina, dos seus alunos e do planejamento do mês."
        actions={
          <>
            <ButtonLink href="/schedule" variant="outline">
              <CalendarDays className="h-4 w-4" />
              Ver agenda
            </ButtonLink>
            <ButtonLink href="/schedule?new=1">
              <Plus className="h-4 w-4" />
              Agendar aula
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Alunos ativos"
          value={dashboard.active_students}
          hint={`${dashboard.pending_invites} convite(s) pendente(s)`}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Aulas hoje"
          value={dashboard.lessons_today}
          hint="Aulas agendadas para hoje"
          icon={<CalendarDays className="h-4 w-4" />}
        />
        <StatCard
          label="Realizadas no mês"
          value={dashboard.completed_this_month}
          hint={`${dashboard.cancelled_this_month} cancelada(s) · ${dashboard.no_show_this_month} falta(s)`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          accent="success"
        />
        <StatCard
          label="Vídeos disponíveis"
          value={dashboard.library_videos}
          hint={`${dashboard.active_plans} plano(s) publicado(s)`}
          icon={<Library className="h-4 w-4" />}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Agenda de hoje</CardTitle>
              <p className="text-sm text-muted-foreground">
                {formatDate(new Date(), "EEEE, dd 'de' MMMM")}
              </p>
            </div>
            <Link href="/schedule" className="text-sm font-medium text-primary hover:underline">
              Abrir agenda
            </Link>
          </CardHeader>
          <CardContent>
            {dashboard.next_lessons_today.length === 0 ? (
              <EmptyState
                title="Nenhuma aula para hoje"
                description="Aproveite para revisar seus planos ou liberar novos conteúdos na biblioteca."
                action={
                  <ButtonLink href="/schedule?new=1" size="sm">
                    Agendar uma aula
                  </ButtonLink>
                }
                icon={<CalendarDays className="h-5 w-5" />}
              />
            ) : (
              <ul className="divide-y">
                {dashboard.next_lessons_today.map((lesson) => (
                  <li key={lesson.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex w-14 shrink-0 flex-col text-center">
                      <span className="text-sm font-semibold">{formatTime(lesson.starts_at)}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatTime(lesson.ends_at)}
                      </span>
                    </div>
                    <Avatar name={lesson.student_name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{lesson.student_name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {lesson.plan_day_title ?? "Sem plano vinculado"}
                      </p>
                    </div>
                    <LessonStatusBadge status={lesson.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Próximas aulas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.upcoming_lessons.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma aula futura agendada.</p>
            ) : (
              dashboard.upcoming_lessons.map((lesson) => (
                <div key={lesson.id} className="rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{lesson.student_name}</p>
                    <LessonStatusBadge status={lesson.status} />
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatDate(lesson.starts_at, "dd/MM")} · {formatTime(lesson.starts_at)}
                  </p>
                  {lesson.plan_day_title ? (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {lesson.plan_day_title}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickAction
          href="/students?new=1"
          icon={<UserPlus className="h-4 w-4" />}
          title="Cadastrar aluno"
          description="Crie o vínculo e envie o convite."
        />
        <QuickAction
          href="/plans?new=1"
          icon={<ClipboardList className="h-4 w-4" />}
          title="Criar plano mensal"
          description="Organize o conteúdo do período."
        />
        <QuickAction
          href="/library?new=1"
          icon={<Library className="h-4 w-4" />}
          title="Adicionar vídeo"
          description="Amplie sua biblioteca técnica."
        />
        <QuickAction
          href="/schedule?new=1"
          icon={<Plus className="h-4 w-4" />}
          title="Agendar aula"
          description="Reserve um horário para um aluno."
        />
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="surface group flex items-start gap-3 p-4 transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      <span>
        <span className="block text-sm font-medium group-hover:text-primary">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
      </span>
    </Link>
  );
}
