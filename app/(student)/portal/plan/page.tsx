import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarRange, ClipboardList, Video as VideoIcon } from "lucide-react";
import { getCurrentSession } from "@/lib/auth/session";
import { getStudentTrainingPlans } from "@/lib/services/portal.service";
import { formatDate, WEEKDAY_LABELS } from "@/lib/utils/date";
import { PageHeader, EmptyState } from "@/components/common/layout-pieces";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StudentVideoPlayer } from "@/components/portal/student-video-player";

export const metadata: Metadata = { title: "Meu plano de treinamento" };
export const dynamic = "force-dynamic";

export default async function StudentPlanPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const plans = getStudentTrainingPlans(session.user.id);

  return (
    <div>
      <PageHeader
        title="Meu plano de treinamento"
        description="O conteúdo que seus professores planejaram para o período. Planejamento não é o mesmo que aula realizada."
      />

      {plans.length === 0 ? (
        <EmptyState
          title="Nenhum plano publicado"
          description="Quando seu professor publicar um plano e liberar o acesso, ele aparecerá aqui."
          icon={<ClipboardList className="h-5 w-5" />}
        />
      ) : (
        <div className="space-y-6">
          {plans.map((plan) => (
            <Card key={plan.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-lg">{plan.title}</CardTitle>
                  <Badge variant="outline">{plan.teacher_name}</Badge>
                </div>
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <CalendarRange className="h-3.5 w-3.5" />
                  {formatDate(plan.period_start)} — {formatDate(plan.period_end)}
                </p>
                {plan.objective ? <p className="text-sm">{plan.objective}</p> : null}
                {plan.description ? (
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                ) : null}
              </CardHeader>
              <CardContent>
                {plan.days.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum dia planejado.</p>
                ) : (
                  <ol className="space-y-3">
                    {plan.days.map((day) => (
                      <li key={day.id} className="rounded-xl border p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">
                            {day.weekday !== null
                              ? WEEKDAY_LABELS[day.weekday]
                              : formatDate(day.planned_date ?? day.created_at)}
                          </Badge>
                          <p className="text-sm font-semibold">{day.title}</p>
                        </div>
                        {day.objective ? (
                          <p className="mt-1 text-sm text-muted-foreground">{day.objective}</p>
                        ) : null}
                        {day.notes ? (
                          <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
                            {day.notes}
                          </p>
                        ) : null}
                        {day.videos.length > 0 ? (
                          <div className="mt-3">
                            <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              <VideoIcon className="h-3.5 w-3.5" />
                              Vídeos recomendados
                            </p>
                            <ul className="space-y-2">
                              {day.videos.map((video) => (
                                <li
                                  key={video.id}
                                  className="flex flex-col gap-2 rounded-lg bg-muted/40 p-2.5 sm:flex-row sm:items-center sm:justify-between"
                                >
                                  <span className="text-sm">{video.title}</span>
                                  {video.status === "ready" ? (
                                    <StudentVideoPlayer
                                      videoId={video.id}
                                      title={video.title}
                                      label="Assistir"
                                      variant="ghost"
                                    />
                                  ) : (
                                    <Badge variant="warning">Processando</Badge>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
