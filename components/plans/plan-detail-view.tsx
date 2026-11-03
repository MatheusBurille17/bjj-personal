"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarDays,
  Copy,
  FileText,
  Pencil,
  Plus,
  Send,
  Trash2,
  Undo2,
  Users,
  Video as VideoIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Select } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PlanStatusBadge, VideoStatusBadge } from "@/components/common/status-badge";
import { EmptyState, StatCard } from "@/components/common/layout-pieces";
import { PlanForm } from "./plan-form";
import { PlanDayForm } from "./plan-day-form";
import { apiFetch, jsonBody } from "@/lib/api/client";
import { formatDate, WEEKDAY_LABELS } from "@/lib/utils/date";
import type { PlanDetail, PlanDayWithVideos } from "@/types/plan";
import type { EnrollmentListItem } from "@/types/enrollment";
import type { LibraryTree } from "@/types/library";

type StatusAction = "publish" | "unpublish" | "archive" | "unarchive";

export function PlanDetailView({
  plan,
  availableEnrollments,
  library,
}: {
  plan: PlanDetail;
  availableEnrollments: EnrollmentListItem[];
  library: LibraryTree;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [dayDialog, setDayDialog] = React.useState<{ open: boolean; day?: PlanDayWithVideos }>({
    open: false,
  });
  const [deletePlanOpen, setDeletePlanOpen] = React.useState(false);
  const [deleteDay, setDeleteDay] = React.useState<PlanDayWithVideos | null>(null);
  const [statusAction, setStatusAction] = React.useState<StatusAction | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [selectedEnrollment, setSelectedEnrollment] = React.useState("");
  const [videoChoice, setVideoChoice] = React.useState<Record<string, string>>({});

  const libraryVideos = React.useMemo(() => {
    const output: Array<{
      id: string;
      title: string;
      status: string;
      moduleName: string;
      techniqueName: string;
    }> = [];
    for (const technique of library.techniques) {
      for (const moduleRecord of library.modules[technique.id] ?? []) {
        for (const video of library.videos[moduleRecord.id] ?? []) {
          if (video.status === "archived") continue;
          output.push({
            id: video.id,
            title: video.title,
            status: video.status,
            moduleName: moduleRecord.name,
            techniqueName: technique.name,
          });
        }
      }
    }
    return output;
  }, [library]);

  const totalVideos = plan.days.reduce((sum, day) => sum + day.videos.length, 0);
  const availableForAccess = availableEnrollments.filter(
    (enrollment) => !plan.enrollments.some((item) => item.enrollment_id === enrollment.id),
  );

  async function runAction(path: string, method: "POST" | "DELETE", success: string) {
    setLoading(true);
    try {
      await apiFetch(path, { method });
      toast.success(success);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a ação");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus() {
    if (!statusAction) return;
    const success = await runAction(`/api/plans/${plan.id}/${statusAction}`, "POST", "Plano atualizado");
    if (success) {
      setStatusAction(null);
      router.refresh();
    }
  }

  async function duplicate() {
    setLoading(true);
    try {
      const copy = await apiFetch<PlanDetail>(`/api/plans/${plan.id}/duplicate`, {
        method: "POST",
      });
      toast.success("Plano duplicado como rascunho");
      router.push(`/plans/${copy.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível duplicar");
    } finally {
      setLoading(false);
    }
  }

  async function removePlan() {
    setLoading(true);
    try {
      await apiFetch(`/api/plans/${plan.id}`, { method: "DELETE" });
      toast.success("Plano removido");
      router.push("/plans");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover o plano");
    } finally {
      setLoading(false);
    }
  }

  async function removeDay() {
    if (!deleteDay) return;
    const success = await runAction(`/api/plans/days/${deleteDay.id}`, "DELETE", "Dia removido");
    if (success) {
      setDeleteDay(null);
      router.refresh();
    }
  }

  async function moveDay(day: PlanDayWithVideos, direction: "up" | "down") {
    const ordered = [...plan.days].sort((a, b) => a.sort_order - b.sort_order);
    const index = ordered.findIndex((item) => item.id === day.id);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= ordered.length) return;
    const reordered = [...ordered];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];

    setLoading(true);
    try {
      await apiFetch("/api/plans/days/reorder", {
        ...jsonBody({
          items: reordered.map((item, position) => ({
            id: item.id,
            sort_order: position + 1,
          })),
        }),
      });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível reordenar");
    } finally {
      setLoading(false);
    }
  }

  async function addVideo(dayId: string) {
    const videoId = videoChoice[dayId];
    if (!videoId) return;
    setLoading(true);
    try {
      await apiFetch(`/api/plans/days/${dayId}/videos`, jsonBody({ video_id: videoId }));
      toast.success("Vídeo adicionado ao dia");
      setVideoChoice((current) => ({ ...current, [dayId]: "" }));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível adicionar o vídeo");
    } finally {
      setLoading(false);
    }
  }

  async function removeVideo(associationId: string) {
    const success = await runAction(
      `/api/plans/days/videos/${associationId}`,
      "DELETE",
      "Vídeo removido do dia",
    );
    if (success) router.refresh();
  }

  async function grantAccess() {
    if (!selectedEnrollment) return;
    setLoading(true);
    try {
      await apiFetch(`/api/plans/${plan.id}/enrollments`, {
        ...jsonBody({ enrollment_id: selectedEnrollment }),
      });
      toast.success("Aluno autorizado a ver o plano");
      setSelectedEnrollment("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível liberar o acesso");
    } finally {
      setLoading(false);
    }
  }

  async function revokeAccess(associationId: string) {
    const success = await runAction(
      `/api/plans/enrollments/${associationId}`,
      "DELETE",
      "Acesso revogado",
    );
    if (success) router.refresh();
  }

  return (
    <div>
      <Link
        href="/plans"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar para planos
      </Link>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{plan.title}</h1>
            <PlanStatusBadge status={plan.status} />
          </div>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatDate(plan.period_start)} — {formatDate(plan.period_end)}
          </p>
          {plan.objective ? <p className="mt-2 max-w-2xl text-sm">{plan.objective}</p> : null}
          {plan.description ? (
            <p className="mt-1 max-w-2xl whitespace-pre-line text-sm text-muted-foreground">
              {plan.description}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </Button>
          <Button size="sm" variant="outline" onClick={() => void duplicate()} loading={loading}>
            <Copy className="h-3.5 w-3.5" />
            Duplicar
          </Button>
          {plan.status === "draft" ? (
            <Button size="sm" onClick={() => setStatusAction("publish")}>
              <Send className="h-3.5 w-3.5" />
              Publicar
            </Button>
          ) : null}
          {plan.status === "published" ? (
            <Button size="sm" variant="outline" onClick={() => setStatusAction("unpublish")}>
              <Undo2 className="h-3.5 w-3.5" />
              Despublicar
            </Button>
          ) : null}
          {plan.status !== "archived" ? (
            <Button size="sm" variant="outline" onClick={() => setStatusAction("archive")}>
              <Archive className="h-3.5 w-3.5" />
              Arquivar
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setStatusAction("unarchive")}>
              <Undo2 className="h-3.5 w-3.5" />
              Restaurar
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setDeletePlanOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" />
            Excluir
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Dias planejados" value={plan.days.length} icon={<FileText className="h-4 w-4" />} />
        <StatCard label="Vídeos no plano" value={totalVideos} icon={<VideoIcon className="h-4 w-4" />} />
        <StatCard label="Alunos com acesso" value={plan.enrollments.length} icon={<Users className="h-4 w-4" />} />
        <StatCard
          label="Publicado em"
          value={plan.published_at ? formatDate(plan.published_at, "dd/MM/yyyy") : "—"}
          hint={plan.status === "published" ? "Visível aos alunos autorizados" : "Não visível aos alunos"}
          icon={<Send className="h-4 w-4" />}
          accent={plan.status === "published" ? "success" : "default"}
        />
      </div>

      {plan.status === "draft" ? (
        <Alert variant="warning" className="mt-4">
          Este plano está em rascunho. Publique-o antes de liberar o acesso aos alunos.
        </Alert>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Dias planejados</h2>
              <p className="text-sm text-muted-foreground">
                Organize o conteúdo na ordem em que pretende trabalhar.
              </p>
            </div>
            <Button size="sm" onClick={() => setDayDialog({ open: true })}>
              <Plus className="h-3.5 w-3.5" />
              Adicionar dia
            </Button>
          </div>

          {plan.days.length === 0 ? (
            <EmptyState
              title="Nenhum dia planejado"
              description="Adicione o primeiro tema para estruturar o plano."
              icon={<FileText className="h-5 w-5" />}
              action={<Button onClick={() => setDayDialog({ open: true })}>Adicionar dia</Button>}
            />
          ) : (
            plan.days
              .slice()
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((day, index, array) => {
                const used = new Set(day.videos.map((video) => video.id));
                const options = libraryVideos.filter((video) => !used.has(video.id));
                return (
                  <Card key={day.id}>
                    <CardHeader className="flex-row items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">
                            {day.weekday !== null
                              ? WEEKDAY_LABELS[day.weekday]
                              : formatDate(day.planned_date ?? day.created_at)}
                          </Badge>
                          <CardTitle>{day.title}</CardTitle>
                        </div>
                        {day.objective ? (
                          <p className="mt-1 text-sm text-muted-foreground">{day.objective}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={index === 0}
                          onClick={() => void moveDay(day, "up")}
                          aria-label="Mover para cima"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={index === array.length - 1}
                          onClick={() => void moveDay(day, "down")}
                          aria-label="Mover para baixo"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDayDialog({ open: true, day })}
                          aria-label="Editar dia"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleteDay(day)}
                          aria-label="Remover dia"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {day.notes ? (
                        <p className="whitespace-pre-line rounded-lg bg-muted/50 p-3 text-sm">
                          {day.notes}
                        </p>
                      ) : null}

                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Vídeos recomendados
                        </p>
                        {day.videos.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Nenhum vídeo associado.</p>
                        ) : (
                          <ul className="space-y-2">
                            {day.videos.map((video) => (
                              <li
                                key={video.id}
                                className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{video.title}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {video.duration_seconds
                                      ? `${Math.round(video.duration_seconds / 60)} min`
                                      : "Duração não informada"}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <VideoStatusBadge status={video.status} />
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => void removeVideo(video.association_id)}
                                    aria-label="Remover vídeo"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Select
                          value={videoChoice[day.id] ?? ""}
                          onChange={(event) =>
                            setVideoChoice((current) => ({
                              ...current,
                              [day.id]: event.target.value,
                            }))
                          }
                          aria-label="Selecionar vídeo"
                        >
                          <option value="">Adicionar vídeo da biblioteca…</option>
                          {options.map((video) => (
                            <option key={video.id} value={video.id}>
                              {video.techniqueName} · {video.moduleName} · {video.title}
                            </option>
                          ))}
                        </Select>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!videoChoice[day.id]}
                          onClick={() => void addVideo(day.id)}
                          loading={loading}
                        >
                          Adicionar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Alunos com acesso</CardTitle>
              <p className="text-sm text-muted-foreground">
                A publicação não libera o plano automaticamente.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {plan.enrollments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum aluno autorizado ainda.
                </p>
              ) : (
                <ul className="space-y-2">
                  {plan.enrollments.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded-lg border p-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.student_name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatDate(item.published_at, "dd/MM/yyyy")}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant={item.status === "active" ? "success" : "muted"}>
                          {item.status === "active" ? "Ativo" : item.status}
                        </Badge>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => void revokeAccess(item.id)}
                          aria-label="Revogar acesso"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-2">
                <Select
                  value={selectedEnrollment}
                  onChange={(event) => setSelectedEnrollment(event.target.value)}
                  aria-label="Selecionar aluno"
                  disabled={plan.status !== "published"}
                >
                  <option value="">Selecionar aluno…</option>
                  {availableForAccess.map((enrollment) => (
                    <option key={enrollment.id} value={enrollment.id}>
                      {enrollment.student_name}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={!selectedEnrollment || plan.status !== "published"}
                  onClick={() => void grantAccess()}
                  loading={loading}
                >
                  Liberar acesso
                </Button>
                {plan.status !== "published" ? (
                  <p className="text-xs text-muted-foreground">
                    Publique o plano para liberar o acesso.
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resumo do plano</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Criado em:</span>{" "}
                {formatDate(plan.created_at, "dd/MM/yyyy")}
              </p>
              <p>
                <span className="text-muted-foreground">Atualizado em:</span>{" "}
                {formatDate(plan.updated_at, "dd/MM/yyyy")}
              </p>
              <p>
                <span className="text-muted-foreground">Publicado em:</span>{" "}
                {plan.published_at ? formatDate(plan.published_at, "dd/MM/yyyy") : "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Arquivado em:</span>{" "}
                {plan.archived_at ? formatDate(plan.archived_at, "dd/MM/yyyy") : "—"}
              </p>
              <div className="pt-2">
                <ButtonLink href="/plans" variant="outline" size="sm" className="w-full">
                  Ver todos os planos
                </ButtonLink>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen} title="Editar plano" size="lg">
        <PlanForm
          plan={plan}
          onCancel={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            router.refresh();
          }}
        />
      </Dialog>

      <Dialog
        open={dayDialog.open}
        onOpenChange={(open) => setDayDialog({ open, day: open ? dayDialog.day : undefined })}
        title={dayDialog.day ? "Editar dia planejado" : "Adicionar dia planejado"}
        size="lg"
      >
        <PlanDayForm
          planId={plan.id}
          day={dayDialog.day}
          onCancel={() => setDayDialog({ open: false })}
          onSaved={() => {
            setDayDialog({ open: false });
            router.refresh();
          }}
        />
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteDay)}
        onOpenChange={(open) => !open && setDeleteDay(null)}
        title="Remover dia do plano?"
        description="As associações de vídeo do dia serão removidas. Aulas que referenciam este dia preservam o histórico."
        confirmLabel="Remover"
        destructive
        loading={loading}
        onConfirm={removeDay}
      />

      <ConfirmDialog
        open={deletePlanOpen}
        onOpenChange={setDeletePlanOpen}
        title="Excluir plano?"
        description="A exclusão só é permitida quando nenhuma aula referencia os dias deste plano."
        confirmLabel="Excluir plano"
        destructive
        loading={loading}
        onConfirm={removePlan}
      />

      <ConfirmDialog
        open={Boolean(statusAction)}
        onOpenChange={(open) => !open && setStatusAction(null)}
        title={
          statusAction === "publish"
            ? "Publicar plano?"
            : statusAction === "unpublish"
              ? "Despublicar plano?"
              : statusAction === "archive"
                ? "Arquivar plano?"
                : "Restaurar plano?"
        }
        confirmLabel={
          statusAction === "publish"
            ? "Publicar"
            : statusAction === "unpublish"
              ? "Despublicar"
              : statusAction === "archive"
                ? "Arquivar"
                : "Restaurar"
        }
        destructive={statusAction === "archive"}
        loading={loading}
        onConfirm={changeStatus}
      >
        {statusAction === "publish"
          ? "Depois de publicar, libere o acesso na seção “Alunos com acesso”."
          : statusAction === "unpublish"
            ? "O plano deixará de aparecer no portal dos alunos."
            : statusAction === "archive"
              ? "O plano será preservado e sairá das listas ativas."
              : "O plano voltará como rascunho e precisará ser publicado novamente."}
      </ConfirmDialog>
    </div>
  );
}
