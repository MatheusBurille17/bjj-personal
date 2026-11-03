"use client";

import * as React from "react";
import { CalendarClock, Clock, Video as VideoIcon } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Alert, Separator } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { LessonStatusBadge } from "@/components/common/status-badge";
import { StudentVideoPlayer } from "./student-video-player";
import { apiFetch } from "@/lib/api/client";
import { formatDate, formatDateTime } from "@/lib/utils/date";
import type { StudentLessonDetail } from "@/types/lesson";

export function StudentLessonDialog({
  lessonId,
  open,
  onOpenChange,
}: {
  lessonId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [detail, setDetail] = React.useState<StudentLessonDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !lessonId) {
      setDetail(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    apiFetch<StudentLessonDetail>(`/api/student/lessons/${lessonId}`)
      .then(setDetail)
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : "Não foi possível abrir a aula.");
        toast.error(caught instanceof Error ? caught.message : "Erro ao abrir aula");
      })
      .finally(() => setLoading(false));
  }, [lessonId, open]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={detail ? detail.plan_day_title ?? "Detalhes da aula" : "Detalhes da aula"}
      description={detail ? formatDateTime(detail.starts_at) : undefined}
      size="lg"
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando aula…</p>
      ) : error ? (
        <Alert variant="destructive">{error}</Alert>
      ) : detail ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <LessonStatusBadge status={detail.status} />
            <Badge variant="outline">{detail.teacher_name}</Badge>
          </div>

          <div className="rounded-lg border p-3 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              {formatDate(detail.starts_at, "EEEE, dd 'de' MMMM 'de' yyyy")}
            </p>
            <p className="mt-1 flex items-center gap-2 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {formatDate(detail.starts_at, "HH:mm")} às {formatDate(detail.ends_at, "HH:mm")}
            </p>
          </div>

          {detail.plan_day ? (
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Conteúdo planejado
              </p>
              <p className="mt-1 text-sm font-medium">{detail.plan_day.title}</p>
              {detail.plan_day.objective ? (
                <p className="text-sm text-muted-foreground">{detail.plan_day.objective}</p>
              ) : null}
              {detail.plan_day.notes ? (
                <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
                  {detail.plan_day.notes}
                </p>
              ) : null}
            </div>
          ) : null}

          <div>
            <p className="text-sm font-semibold">Observações do professor</p>
            <p className="mt-1 whitespace-pre-line rounded-lg bg-muted/40 p-3 text-sm">
              {detail.shared_notes ?? "Nenhuma observação compartilhada."}
            </p>
          </div>

          <Separator />

          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <VideoIcon className="h-4 w-4" />
              Vídeos desta aula
            </p>
            {detail.videos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum vídeo associado.</p>
            ) : (
              <ul className="space-y-2">
                {detail.videos.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.video.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.source === "plan" ? "Sugerido pelo plano" : "Conteúdo da aula"}
                        {item.video.status === "archived" ? " · vídeo arquivado" : ""}
                      </p>
                    </div>
                    {item.video.status === "ready" ? (
                      <StudentVideoPlayer
                        videoId={item.video.id}
                        title={item.video.title}
                        label="Assistir"
                      />
                    ) : (
                      <Badge variant="warning">Processando</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
