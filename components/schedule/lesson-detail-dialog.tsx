"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  Copy,
  ExternalLink,
  Pencil,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Alert, Separator } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { LessonStatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { apiFetch, jsonBody } from "@/lib/api/client";
import { formatDate, formatDateTime, WEEKDAY_LABELS } from "@/lib/utils/date";
import type {
  LessonDetail,
  LessonStatus,
  PlanDayOption,
  VideoOption,
} from "@/types/lesson";

export function LessonDetailDialog({
  lessonId,
  open,
  onOpenChange,
  planDays,
  videos,
  onChanged,
}: {
  lessonId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planDays: PlanDayOption[];
  videos: VideoOption[];
  onChanged: () => void;
}) {
  const [detail, setDetail] = React.useState<LessonDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [date, setDate] = React.useState("");
  const [startTime, setStartTime] = React.useState("");
  const [endTime, setEndTime] = React.useState("");
  const [planDayId, setPlanDayId] = React.useState("");
  const [sharedNotes, setSharedNotes] = React.useState("");
  const [privateNotes, setPrivateNotes] = React.useState("");
  const [videoChoice, setVideoChoice] = React.useState("");
  const [confirmStatus, setConfirmStatus] = React.useState<LessonStatus | null>(null);
  const [actionLoading, setActionLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!lessonId) return;
    setLoading(true);
    try {
      const result = await apiFetch<LessonDetail>(`/api/lessons/${lessonId}`);
      setDetail(result);
      const start = new Date(result.starts_at);
      const end = new Date(result.ends_at);
      setDate(
        `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(
          start.getDate(),
        ).padStart(2, "0")}`,
      );
      setStartTime(
        `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
      );
      setEndTime(
        `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`,
      );
      setPlanDayId(result.plan_day_id ?? "");
      setSharedNotes(result.shared_notes ?? "");
      setPrivateNotes(result.private_notes ?? "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar aula");
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }, [lessonId, onOpenChange]);

  React.useEffect(() => {
    if (open && lessonId) void load();
    if (!open) setDetail(null);
  }, [open, lessonId, load]);

  async function saveTimes() {
    if (!detail) return;
    setActionLoading(true);
    try {
      const startsAt = new Date(`${date}T${startTime}:00`).toISOString();
      const endsAt = new Date(`${date}T${endTime}:00`).toISOString();
      const result = await apiFetch<LessonDetail>(`/api/lessons/${detail.id}`, {
        method: "PATCH",
        ...jsonBody({
          starts_at: startsAt,
          ends_at: endsAt,
          plan_day_id: planDayId || null,
        }),
      });
      setDetail(result);
      setEditing(false);
      toast.success("Horário atualizado");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar");
    } finally {
      setActionLoading(false);
    }
  }

  async function saveNotes() {
    if (!detail) return;
    setActionLoading(true);
    try {
      const result = await apiFetch<LessonDetail>(`/api/lessons/${detail.id}`, {
        method: "PATCH",
        ...jsonBody({
          shared_notes: sharedNotes.trim() || null,
          private_notes: privateNotes.trim() || null,
        }),
      });
      setDetail(result);
      toast.success("Observações salvas");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar as notas");
    } finally {
      setActionLoading(false);
    }
  }

  async function changeStatus(status: LessonStatus) {
    if (!detail) return;
    setActionLoading(true);
    try {
      const result = await apiFetch<LessonDetail>(`/api/lessons/${detail.id}/status`, {
        method: "PATCH",
        ...jsonBody({
          status,
          shared_notes: sharedNotes.trim() || null,
          private_notes: privateNotes.trim() || null,
        }),
      });
      setDetail(result);
      setConfirmStatus(null);
      toast.success("Status da aula atualizado");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a aula");
    } finally {
      setActionLoading(false);
    }
  }

  async function addVideo() {
    if (!detail || !videoChoice) return;
    setActionLoading(true);
    try {
      const result = await apiFetch<LessonDetail>(`/api/lessons/${detail.id}/videos`, {
        ...jsonBody({ video_id: videoChoice }),
      });
      setDetail(result);
      setVideoChoice("");
      toast.success("Vídeo associado à aula");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível associar o vídeo");
    } finally {
      setActionLoading(false);
    }
  }

  async function removeVideo(associationId: string) {
    if (!detail) return;
    setActionLoading(true);
    try {
      const result = await apiFetch<LessonDetail>(
        `/api/lessons/${detail.id}/videos/${associationId}`,
        { method: "DELETE" },
      );
      setDetail(result);
      toast.success("Vídeo removido da aula");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover o vídeo");
    } finally {
      setActionLoading(false);
    }
  }

  async function copyFromPlan() {
    if (!detail) return;
    setActionLoading(true);
    try {
      const result = await apiFetch<LessonDetail>(
        `/api/lessons/${detail.id}/copy-videos-from-plan`,
        { method: "POST" },
      );
      setDetail(result);
      toast.success("Vídeos do plano copiados");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível copiar os vídeos");
    } finally {
      setActionLoading(false);
    }
  }

  const locked = detail ? detail.status !== "scheduled" : false;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={detail ? detail.student_name : "Detalhes da aula"}
        description={detail ? formatDateTime(detail.starts_at) : undefined}
        size="lg"
      >
        {loading || !detail ? (
          <p className="text-sm text-muted-foreground">Carregando aula…</p>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <LessonStatusBadge status={detail.status} />
              <Badge variant="outline">
                {detail.teacher_name}
              </Badge>
              <Link
                href={`/students/${detail.enrollment_id}`}
                className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Abrir ficha do aluno
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {formatDate(detail.starts_at, "EEEE, dd 'de' MMMM")}
                </span>
                <span className="text-muted-foreground">
                  {formatDate(detail.starts_at, "HH:mm")}–{formatDate(detail.ends_at, "HH:mm")}
                </span>
              </div>
              {!locked ? (
                <Button size="sm" variant="ghost" onClick={() => setEditing((value) => !value)}>
                  <Pencil className="h-3.5 w-3.5" />
                  {editing ? "Cancelar" : "Alterar"}
                </Button>
              ) : null}
            </div>

            {editing ? (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Data" htmlFor="edit-date">
                    <Input
                      id="edit-date"
                      type="date"
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                    />
                  </Field>
                  <Field label="Início" htmlFor="edit-start">
                    <Input
                      id="edit-start"
                      type="time"
                      value={startTime}
                      onChange={(event) => setStartTime(event.target.value)}
                    />
                  </Field>
                  <Field label="Fim" htmlFor="edit-end">
                    <Input
                      id="edit-end"
                      type="time"
                      value={endTime}
                      onChange={(event) => setEndTime(event.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Dia do plano" htmlFor="edit-plan-day">
                  <Select
                    id="edit-plan-day"
                    value={planDayId}
                    onChange={(event) => setPlanDayId(event.target.value)}
                  >
                    <option value="">Sem plano vinculado</option>
                    {planDays.map((day) => (
                      <option key={day.id} value={day.id}>
                        {day.plan_title} · {day.title} (
                        {day.weekday !== null ? WEEKDAY_LABELS[day.weekday] : day.planned_date})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button size="sm" onClick={() => void saveTimes()} loading={actionLoading}>
                  Salvar horário
                </Button>
              </div>
            ) : null}

            {detail.plan_day ? (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Conteúdo planejado
                </p>
                <p className="mt-1 text-sm font-medium">{detail.plan_day.title}</p>
                {detail.plan_day.objective ? (
                  <p className="text-sm text-muted-foreground">{detail.plan_day.objective}</p>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Observações para o aluno" htmlFor="detail-shared">
                <Textarea
                  id="detail-shared"
                  value={sharedNotes}
                  onChange={(event) => setSharedNotes(event.target.value)}
                  placeholder="Visível no portal do aluno"
                />
              </Field>
              <Field label="Notas privadas" htmlFor="detail-private">
                <Textarea
                  id="detail-private"
                  value={privateNotes}
                  onChange={(event) => setPrivateNotes(event.target.value)}
                  placeholder="Somente você vê estas notas"
                />
              </Field>
            </div>
            <Button size="sm" variant="outline" onClick={() => void saveNotes()} loading={actionLoading}>
              Salvar observações
            </Button>

            <Separator />

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">Vídeos da aula</p>
                {detail.plan_day_id && !locked ? (
                  <Button size="sm" variant="outline" onClick={() => void copyFromPlan()} loading={actionLoading}>
                    <Copy className="h-3.5 w-3.5" />
                    Copiar do plano
                  </Button>
                ) : null}
              </div>
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
                          {item.video.status === "archived" ? "Arquivado · " : ""}
                          {item.source === "plan" ? "Sugerido pelo plano" : "Adicionado manualmente"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={item.source === "plan" ? "info" : "secondary"}>
                          {item.source === "plan" ? "Plano" : "Manual"}
                        </Badge>
                        {!locked ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => void removeVideo(item.id)}
                            aria-label="Remover vídeo"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {!locked ? (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Select
                    value={videoChoice}
                    onChange={(event) => setVideoChoice(event.target.value)}
                    aria-label="Selecionar vídeo"
                  >
                    <option value="">Adicionar vídeo da biblioteca…</option>
                    {videos.map((video) => (
                      <option key={video.id} value={video.id}>
                        {video.technique_name} · {video.module_name} · {video.title}
                      </option>
                    ))}
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!videoChoice}
                    onClick={() => void addVideo()}
                    loading={actionLoading}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar
                  </Button>
                </div>
              ) : (
                <Alert className="mt-3">
                  Esta aula está {detail.status === "completed" ? "concluída" : "finalizada"}. Os
                  vídeos e horários ficam preservados no histórico.
                </Alert>
              )}
            </div>

            {detail.status === "scheduled" ? (
              <>
                <Separator />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => setConfirmStatus("completed")}
                    loading={actionLoading}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Marcar como realizada
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmStatus("cancelled")}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Cancelar aula
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmStatus("no_show")}
                  >
                    Registrar falta
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmStatus)}
        onOpenChange={(open) => !open && setConfirmStatus(null)}
        title={
          confirmStatus === "completed"
            ? "Marcar aula como realizada?"
            : confirmStatus === "cancelled"
              ? "Cancelar esta aula?"
              : "Registrar falta do aluno?"
        }
        description={
          confirmStatus === "completed"
            ? "A aula contará nas estatísticas de aulas realizadas e ficará disponível no histórico do aluno."
            : confirmStatus === "cancelled"
              ? "A aula continuará registrada, mas não contará como realizada."
              : "A falta ficará registrada no histórico e não contará como aula realizada."
        }
        confirmLabel={
          confirmStatus === "completed"
            ? "Concluir"
            : confirmStatus === "cancelled"
              ? "Cancelar aula"
              : "Registrar falta"
        }
        destructive={confirmStatus !== "completed"}
        loading={actionLoading}
        onConfirm={() => (confirmStatus ? changeStatus(confirmStatus) : undefined)}
      />
    </>
  );
}
