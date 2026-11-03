import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  Library,
  Users,
} from "lucide-react";
import { getCurrentSession } from "@/lib/auth/session";
import { getStudentDashboard } from "@/lib/services/portal.service";
import { formatDate, formatTime } from "@/lib/utils/date";
import { PageHeader, StatCard, EmptyState } from "@/components/common/layout-pieces";
import { LessonStatusBadge } from "@/components/common/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, Separator } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button-link";

export const metadata: Metadata = { title: "Início" };
export const dynamic = "force-dynamic";

export default async function StudentDashboardPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const data = await getStudentDashboard(session.user.id);

  return (
    <div>
      <PageHeader
        title={`Olá, ${session.profile.full_name.split(" ")[0]}!`}
        description="Sua próxima aula, seu progresso e os conteúdos liberados pelos seus professores."
        actions={
          <ButtonLink href="/portal/agenda" variant="outline">
            <CalendarDays className="h-4 w-4" />
            Minha agenda
          </ButtonLink>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Aulas realizadas"
          value={data.total_completed}
          icon={<CheckCircle2 className="h-4 w-4" />}
          accent="success"
        />
        <StatCard
          label="Aulas agendadas"
          value={data.upcoming_lessons.length}
          icon={<CalendarDays className="h-4 w-4" />}
        />
        <StatCard
          label="Planos publicados"
          value={data.published_plans}
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <StatCard
          label="Vídeos liberados"
          value={data.authorized_videos}
          icon={<Library className="h-4 w-4" />}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Próxima aula</CardTitle>
          </CardHeader>
          <CardContent>
            {data.next_lesson ? (
              <div className="rounded-xl border bg-primary/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">
                      {formatDate(data.next_lesson.starts_at, "EEEE, dd 'de' MMMM")}
                    </p>
                    <p className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {formatTime(data.next_lesson.starts_at)} às{" "}
                      {formatTime(data.next_lesson.ends_at)}
                    </p>
                  </div>
                  <LessonStatusBadge status={data.next_lesson.status} />
                </div>
                <Separator />
                <div className="flex items-center gap-3">
                  <Avatar name={data.next_lesson.teacher_name} size="md" />
                  <div>
                    <p className="text-sm font-medium">{data.next_lesson.teacher_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {data.next_lesson.plan_day_title ?? "Tema a definir"}
                    </p>
                  </div>
                </div>
                {data.next_lesson.video_count > 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {data.next_lesson.video_count} vídeo(s) associado(s) a esta aula.
                  </p>
                ) : null}
              </div>
            ) : (
              <EmptyState
                title="Nenhuma aula agendada"
                description="Quando seu professor agendar uma aula, ela aparecerá aqui."
                icon={<CalendarDays className="h-5 w-5" />}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Meus professores
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.teachers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum vínculo ativo.</p>
            ) : (
              data.teachers.map((teacher) => (
                <div key={teacher.enrollment_id} className="rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Avatar src={teacher.avatar_url} name={teacher.display_name} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{teacher.display_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {teacher.completed_lessons} aula(s) realizada(s)
                      </p>
                    </div>
                  </div>
                  {teacher.next_lesson ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Próxima: {formatDate(teacher.next_lesson.starts_at, "dd/MM 'às' HH:mm")}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Próximos compromissos</CardTitle>
            <Link href="/portal/agenda" className="text-sm font-medium text-primary hover:underline">
              Ver agenda
            </Link>
          </CardHeader>
          <CardContent>
            {data.upcoming_lessons.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum compromisso futuro.</p>
            ) : (
              <ul className="divide-y">
                {data.upcoming_lessons.map((lesson) => (
                  <li key={lesson.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className="flex w-12 flex-col text-center">
                        <span className="text-sm font-semibold">{formatTime(lesson.starts_at)}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatDate(lesson.starts_at, "dd/MM")}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{lesson.teacher_name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {lesson.plan_day_title ?? "Tema a definir"}
                        </p>
                      </div>
                    </div>
                    <LessonStatusBadge status={lesson.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Últimas aulas realizadas</CardTitle>
            <Link href="/portal/history" className="text-sm font-medium text-primary hover:underline">
              Ver histórico
            </Link>
          </CardHeader>
          <CardContent>
            {data.recent_lessons.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma aula concluída ainda.</p>
            ) : (
              <ul className="divide-y">
                {data.recent_lessons.map((lesson) => (
                  <li key={lesson.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {formatDate(lesson.completed_at ?? lesson.starts_at, "dd/MM/yyyy")}
                      </p>
                      <LessonStatusBadge status={lesson.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {lesson.teacher_name} · {lesson.plan_day_title ?? "Aula livre"}
                    </p>
                    {lesson.shared_notes ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {lesson.shared_notes}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Link
          href="/portal/library"
          className="surface flex items-center gap-3 p-4 transition-colors hover:border-primary/40 hover:bg-muted/40"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Library className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-medium">Biblioteca liberada</span>
            <span className="block text-xs text-muted-foreground">
              {data.authorized_videos} vídeo(s) disponível(is)
            </span>
          </span>
        </Link>
        <Link
          href="/portal/plan"
          className="surface flex items-center gap-3 p-4 transition-colors hover:border-primary/40 hover:bg-muted/40"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ClipboardList className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-medium">Meu plano de treinamento</span>
            <span className="block text-xs text-muted-foreground">
              {data.published_plans} plano(s) publicado(s)
            </span>
          </span>
        </Link>
      </div>
    </div>
  );
}
