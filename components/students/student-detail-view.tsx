"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  CalendarDays,
  CheckCircle2,
  Clock,
  Library,
  MailPlus,
  Pause,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Select } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog } from "@/components/ui/dialog";
import { Alert, Avatar, Separator } from "@/components/ui/feedback";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { CopyButton } from "@/components/common/copy-button";
import { LessonStatusBadge, EnrollmentStatusBadge } from "@/components/common/status-badge";
import { EmptyState, StatCard } from "@/components/common/layout-pieces";
import { StudentForm } from "./student-form";
import { apiFetch, jsonBody } from "@/lib/api/client";
import { formatDate, formatDateTime, WEEKDAY_LABELS } from "@/lib/utils/date";
import type { EnrollmentDetail } from "@/types/enrollment";
import type { LessonListItem, WeeklySlotWithStudent } from "@/types/lesson";
import type { TechniqueAccess, TechniqueWithCounts } from "@/types/library";

export function StudentDetailView({
  enrollment,
  lessons,
  access,
  techniques,
  weeklySlots,
}: {
  enrollment: EnrollmentDetail;
  lessons: LessonListItem[];
  access: Array<TechniqueAccess & { technique_name: string }>;
  techniques: TechniqueWithCounts[];
  weeklySlots: WeeklySlotWithStudent[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState<"pause" | "reactivate" | "archive" | "delete" | null>(
    null,
  );
  const [loading, setLoading] = React.useState(false);
  const [inviteLink, setInviteLink] = React.useState<string | null>(null);
  const [selectedTechnique, setSelectedTechnique] = React.useState("");

  const pending = enrollment.status === "pending";
  const completed = lessons.filter((lesson) => lesson.status === "completed");
  const scheduled = lessons.filter((lesson) => lesson.status === "scheduled");
  const availableTechniques = techniques.filter(
    (technique) =>
      technique.status === "active" &&
      !access.some((item) => item.technique_id === technique.id),
  );

  async function runAction(path: string, method: "POST" | "DELETE", success: string) {
    setLoading(true);
    try {
      await apiFetch(path, { method });
      toast.success(success);
      setConfirm(null);
      if (method === "DELETE" && path === `/api/enrollments/${enrollment.id}`) {
        router.push("/students");
        router.refresh();
        return;
      }
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a ação");
    } finally {
      setLoading(false);
    }
  }

  async function resendInvite() {
    setLoading(true);
    try {
      const result = await apiFetch<{ invite_url: string }>(
        `/api/enrollments/${enrollment.id}/resend-invite`,
        { method: "POST" },
      );
      setInviteLink(result.invite_url);
      toast.success("Novo convite gerado");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao reenviar convite");
    } finally {
      setLoading(false);
    }
  }

  async function grantAccess() {
    if (!selectedTechnique) return;
    setLoading(true);
    try {
      await apiFetch("/api/library/access", {
        ...jsonBody({
          enrollment_id: enrollment.id,
          technique_id: selectedTechnique,
        }),
      });
      toast.success("Acesso à técnica liberado");
      setSelectedTechnique("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível liberar o acesso");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Avatar name={enrollment.student_name} size="lg" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{enrollment.student_name}</h1>
              <EnrollmentStatusBadge status={enrollment.status} />
            </div>
            <p className="text-sm text-muted-foreground">{enrollment.student_email}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Vínculo desde {formatDate(enrollment.started_at, "dd 'de' MMMM 'de' yyyy")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/schedule?student=${enrollment.id}`} size="sm">
            <CalendarDays className="h-3.5 w-3.5" />
            Agendar aula
          </ButtonLink>
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </Button>
          {pending ? (
            <Button size="sm" variant="outline" onClick={() => void resendInvite()} loading={loading}>
              <MailPlus className="h-3.5 w-3.5" />
              Reenviar convite
            </Button>
          ) : null}
          {enrollment.status === "active" ? (
            <Button size="sm" variant="outline" onClick={() => setConfirm("pause")}>
              <Pause className="h-3.5 w-3.5" />
              Pausar
            </Button>
          ) : null}
          {enrollment.status === "paused" ? (
            <Button size="sm" variant="outline" onClick={() => setConfirm("reactivate")}>
              <Play className="h-3.5 w-3.5" />
              Reativar
            </Button>
          ) : null}
          {enrollment.status !== "archived" ? (
            <Button size="sm" variant="outline" onClick={() => setConfirm("archive")}>
              <Archive className="h-3.5 w-3.5" />
              Arquivar
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Aulas realizadas"
          value={enrollment.completed_lessons_count}
          icon={<CheckCircle2 className="h-4 w-4" />}
          accent="success"
        />
        <StatCard
          label="Aulas agendadas"
          value={enrollment.scheduled_lessons_count}
          icon={<CalendarDays className="h-4 w-4" />}
        />
        <StatCard
          label="Tempo de vínculo"
          value={`${enrollment.duration_days} dias`}
          icon={<Clock className="h-4 w-4" />}
        />
        <StatCard
          label="Próxima aula"
          value={
            enrollment.next_lesson
              ? formatDate(enrollment.next_lesson.starts_at, "dd/MM")
              : "—"
          }
          hint={
            enrollment.next_lesson
              ? formatDate(enrollment.next_lesson.starts_at, "HH:mm")
              : "Nenhuma agendada"
          }
          icon={<CalendarDays className="h-4 w-4" />}
        />
      </div>

      {pending ? (
        <Alert variant="warning" className="mt-4" title="Convite pendente">
          O aluno ainda não criou a conta. Reenvie o convite para gerar um novo link.
        </Alert>
      ) : null}

      <Tabs defaultValue="summary" className="mt-6">
        <TabsList>
          <TabsTrigger value="summary">Resumo</TabsTrigger>
          <TabsTrigger value="lessons">Aulas</TabsTrigger>
          <TabsTrigger value="library">Biblioteca liberada</TabsTrigger>
          <TabsTrigger value="data">Dados do vínculo</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Contato</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">E-mail:</span> {enrollment.student_email}
                </p>
                <p>
                  <span className="text-muted-foreground">Telefone:</span>{" "}
                  {enrollment.student_phone ?? "Não informado"}
                </p>
                <Separator />
                <div>
                  <p className="text-muted-foreground">Observações privadas</p>
                  <p className="mt-1 whitespace-pre-line rounded-lg bg-muted/50 p-3">
                    {enrollment.private_notes ?? "Nenhuma observação registrada."}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Estas observações nunca são exibidas ao aluno.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Horários recorrentes</CardTitle>
              </CardHeader>
              <CardContent>
                {weeklySlots.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum horário recorrente cadastrado.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {weeklySlots.map((slot) => (
                      <li
                        key={slot.id}
                        className="flex items-center justify-between rounded-lg border p-3 text-sm"
                      >
                        <span>
                          {WEEKDAY_LABELS[slot.weekday]} · {slot.start_time.slice(0, 5)} às{" "}
                          {slot.end_time.slice(0, 5)}
                        </span>
                        <Badge variant={slot.status === "active" ? "success" : "muted"}>
                          {slot.status === "active" ? "Ativo" : "Pausado"}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
                <ButtonLink href="/schedule" variant="outline" size="sm" className="mt-3">
                  Gerenciar na agenda
                </ButtonLink>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Últimas aulas</CardTitle>
            </CardHeader>
            <CardContent>
              {lessons.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma aula registrada.</p>
              ) : (
                <ul className="divide-y">
                  {lessons.slice(0, 5).map((lesson) => (
                    <li key={lesson.id} className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="text-sm font-medium">
                          {formatDateTime(lesson.starts_at)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {lesson.plan_day_title ?? "Sem tema definido"}
                        </p>
                      </div>
                      <LessonStatusBadge status={lesson.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lessons" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Histórico de aulas</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {completed.length} realizada(s) · {scheduled.length} agendada(s)
                </p>
              </div>
              <ButtonLink href={`/schedule?student=${enrollment.id}`} size="sm" variant="outline">
                Agendar nova
              </ButtonLink>
            </CardHeader>
            <CardContent>
              {lessons.length === 0 ? (
                <EmptyState
                  title="Nenhuma aula ainda"
                  description="Agende a primeira aula deste aluno."
                  icon={<CalendarDays className="h-5 w-5" />}
                  action={<ButtonLink href={`/schedule?student=${enrollment.id}`} size="sm">Agendar aula</ButtonLink>}
                />
              ) : (
                <ul className="divide-y">
                  {lessons.map((lesson) => (
                    <li key={lesson.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium">{formatDateTime(lesson.starts_at)}</p>
                        <p className="text-xs text-muted-foreground">
                          {lesson.plan_day_title ?? "Sem plano vinculado"} ·{" "}
                          {lesson.video_count} vídeo(s)
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <LessonStatusBadge status={lesson.status} />
                        <ButtonLink href={`/schedule?lesson=${lesson.id}`} size="sm" variant="ghost">
                          Ver detalhes
                        </ButtonLink>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="library" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Técnicas liberadas</CardTitle>
                <p className="text-sm text-muted-foreground">
                  O aluno pode acessar todas as videoaulas das técnicas liberadas.
                </p>
              </div>
              <Library className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-4">
              {access.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma técnica liberada individualmente. Vídeos de aulas continuam disponíveis.
                </p>
              ) : (
                <ul className="space-y-2">
                  {access.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">{item.technique_name}</p>
                        <p className="text-xs text-muted-foreground">
                          Liberada em {formatDate(item.granted_at, "dd/MM/yyyy")}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void runAction(
                            `/api/library/access/${item.id}`,
                            "DELETE",
                            "Acesso revogado",
                          )
                        }
                      >
                        Revogar
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Select
                  value={selectedTechnique}
                  onChange={(event) => setSelectedTechnique(event.target.value)}
                  aria-label="Selecionar técnica"
                >
                  <option value="">Selecione uma técnica…</option>
                  {availableTechniques.map((technique) => (
                    <option key={technique.id} value={technique.id}>
                      {technique.name} ({technique.video_count} vídeos)
                    </option>
                  ))}
                </Select>
                <Button
                  onClick={() => void grantAccess()}
                  disabled={!selectedTechnique}
                  loading={loading}
                >
                  Liberar acesso
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Dados do vínculo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Início</p>
                  <p className="mt-1 font-medium">{formatDate(enrollment.started_at)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Arquivado em
                  </p>
                  <p className="mt-1 font-medium">
                    {enrollment.archived_at ? formatDate(enrollment.archived_at) : "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Total de aulas
                  </p>
                  <p className="mt-1 font-medium">{enrollment.lessons_count}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Convite expira
                  </p>
                  <p className="mt-1 font-medium">
                    {enrollment.invite_expires_at
                      ? formatDateTime(enrollment.invite_expires_at)
                      : "—"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Editar dados
                </Button>
                {pending ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void runAction(
                        `/api/enrollments/${enrollment.id}`,
                        "DELETE",
                        "Aluno removido",
                      )
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Excluir vínculo
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                Vínculos com histórico de aulas não podem ser excluídos — use o arquivamento.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Editar dados do aluno"
        size="md"
      >
        <StudentForm
          enrollment={enrollment}
          onCancel={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            router.refresh();
          }}
        />
      </Dialog>

      <Dialog
        open={Boolean(inviteLink)}
        onOpenChange={(open) => !open && setInviteLink(null)}
        title="Novo convite gerado"
        size="md"
        footer={
          <Button variant="outline" onClick={() => setInviteLink(null)}>
            Fechar
          </Button>
        }
      >
        {inviteLink ? (
          <div className="space-y-3">
            <code className="block break-all rounded-lg bg-muted p-3 text-xs">{inviteLink}</code>
            <CopyButton value={inviteLink} label="Copiar convite" variant="default" />
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={confirm === "pause"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Pausar vínculo?"
        confirmLabel="Pausar"
        loading={loading}
        onConfirm={() =>
          runAction(`/api/enrollments/${enrollment.id}/pause`, "POST", "Vínculo pausado")
        }
      />
      <ConfirmDialog
        open={confirm === "reactivate"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Reativar vínculo?"
        confirmLabel="Reativar"
        loading={loading}
        onConfirm={() =>
          runAction(
            `/api/enrollments/${enrollment.id}/reactivate`,
            "POST",
            "Vínculo reativado",
          )
        }
      />
      <ConfirmDialog
        open={confirm === "archive"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Arquivar aluno?"
        description="O histórico será preservado e o aluno sairá da lista ativa."
        confirmLabel="Arquivar"
        destructive
        loading={loading}
        onConfirm={() =>
          runAction(`/api/enrollments/${enrollment.id}/archive`, "POST", "Aluno arquivado")
        }
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Excluir vínculo?"
        description="Esta ação só é permitida quando não há aulas registradas."
        confirmLabel="Excluir"
        destructive
        loading={loading}
        onConfirm={() =>
          runAction(`/api/enrollments/${enrollment.id}`, "DELETE", "Vínculo excluído")
        }
      />
    </div>
  );
}
