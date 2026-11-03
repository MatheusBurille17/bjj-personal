"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  CalendarClock,
  MailPlus,
  Pause,
  Play,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, PageHeader } from "@/components/common/layout-pieces";
import { EnrollmentStatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { CopyButton } from "@/components/common/copy-button";
import { Skeleton } from "@/components/ui/feedback";
import { StudentForm } from "./student-form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/api/client";
import { formatDate, relativeExpiration } from "@/lib/utils/date";
import type {
  EnrollmentListItem,
  EnrollmentListResponse,
  EnrollmentStatus,
} from "@/types/enrollment";
import type { PaginationMeta } from "@/types/api";

const FILTERS: Array<{ value: EnrollmentStatus; label: string }> = [
  { value: "active", label: "Ativos" },
  { value: "paused", label: "Pausados" },
  { value: "pending", label: "Convites" },
  { value: "archived", label: "Arquivados" },
];

type PendingAction = {
  type: "pause" | "reactivate" | "archive";
  enrollment: EnrollmentListItem;
};

export function StudentsView({
  initialEnrollments,
  initialPagination,
  initialOpen = false,
}: {
  initialEnrollments: EnrollmentListItem[];
  initialPagination: PaginationMeta;
  initialOpen?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = React.useState(initialEnrollments);
  const [pagination, setPagination] = React.useState(initialPagination);
  const [search, setSearch] = React.useState("");
  const [statuses, setStatuses] = React.useState<EnrollmentStatus[]>([
    "active",
    "paused",
    "pending",
  ]);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(initialOpen);
  const [pendingAction, setPendingAction] = React.useState<PendingAction | null>(null);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [inviteLink, setInviteLink] = React.useState<string | null>(null);

  const load = React.useCallback(
    async (options?: { search?: string; statuses?: EnrollmentStatus[]; page?: number }) => {
      setLoading(true);
      try {
        const query = new URLSearchParams();
        const term = options?.search ?? search;
        if (term.trim()) query.set("search", term.trim());
        for (const status of options?.statuses ?? statuses) query.append("status", status);
        query.set("page", String(options?.page ?? page));
        query.set("pageSize", "20");
        const result = await apiFetch<EnrollmentListResponse>(`/api/enrollments?${query}`);
        setItems(result.enrollments);
        setPagination(result.pagination);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Erro ao carregar alunos");
      } finally {
        setLoading(false);
      }
    },
    [page, search, statuses],
  );

  React.useEffect(() => {
    const timeout = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statuses, page]);

  function toggleStatus(status: EnrollmentStatus) {
    setPage(1);
    setStatuses((current) => {
      if (current.includes(status)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== status);
      }
      return [...current, status];
    });
  }

  async function executeAction() {
    if (!pendingAction) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/enrollments/${pendingAction.enrollment.id}/${pendingAction.type}`, {
        method: "POST",
      });
      toast.success(
        pendingAction.type === "pause"
          ? "Vínculo pausado"
          : pendingAction.type === "reactivate"
            ? "Vínculo reativado"
            : "Aluno arquivado",
      );
      setPendingAction(null);
      await load();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a ação");
    } finally {
      setActionLoading(false);
    }
  }

  async function resendInvite(enrollment: EnrollmentListItem) {
    try {
      const result = await apiFetch<{ invite_url: string }>(
        `/api/enrollments/${enrollment.id}/resend-invite`,
        { method: "POST" },
      );
      setInviteLink(result.invite_url);
      await load();
      toast.success("Novo convite gerado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível reenviar o convite");
    }
  }

  return (
    <div>
      <PageHeader
        title="Alunos"
        description="Gerencie os vínculos, convites e o acompanhamento de cada aluno."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Cadastrar aluno
          </Button>
        }
      />

      <div className="surface">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Buscar aluno pelo nome…"
              className="pl-9"
              aria-label="Buscar aluno"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((filter) => {
              const active = statuses.includes(filter.value);
              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => toggleStatus(filter.value)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted"
                  }`}
                  aria-pressed={active}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Nenhum aluno encontrado"
              description="Ajuste a busca ou cadastre seu primeiro aluno para começar."
              icon={<Users className="h-5 w-5" />}
              action={
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Cadastrar aluno
                </Button>
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Aluno</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Próxima aula</TableHead>
                <TableHead>Aulas</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((enrollment) => (
                <TableRow key={enrollment.id}>
                  <TableCell>
                    <Link
                      href={`/students/${enrollment.id}`}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {enrollment.student_name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{enrollment.student_email}</p>
                    {enrollment.status === "pending" ? (
                      <p className="mt-1 text-[11px] text-amber-700">
                        Convite expira em {relativeExpiration(enrollment.invite_expires_at)}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <EnrollmentStatusBadge status={enrollment.status} />
                  </TableCell>
                  <TableCell>
                    {enrollment.next_lesson ? (
                      <span className="inline-flex items-center gap-1 text-sm">
                        <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                        {formatDate(enrollment.next_lesson.starts_at, "dd/MM 'às' HH:mm")}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{enrollment.completed_lessons_count}</span>
                    <span className="text-xs text-muted-foreground"> realizadas</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {enrollment.status === "pending" ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void resendInvite(enrollment)}
                          >
                            <MailPlus className="h-3.5 w-3.5" />
                            Reenviar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setPendingAction({ type: "archive", enrollment })}
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : null}
                      {enrollment.status === "active" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPendingAction({ type: "pause", enrollment })}
                        >
                          <Pause className="h-3.5 w-3.5" />
                          Pausar
                        </Button>
                      ) : null}
                      {enrollment.status === "paused" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPendingAction({ type: "reactivate", enrollment })}
                        >
                          <Play className="h-3.5 w-3.5" />
                          Reativar
                        </Button>
                      ) : null}
                      {enrollment.status !== "archived" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPendingAction({ type: "archive", enrollment })}
                        >
                          <Archive className="h-3.5 w-3.5" />
                          Arquivar
                        </Button>
                      ) : null}
                      <ButtonLink href={`/students/${enrollment.id}`} size="sm" variant="outline">
                        Ver ficha
                      </ButtonLink>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {pagination.total > 0 ? (
          <div className="flex flex-col items-center justify-between gap-2 border-t p-3 text-sm sm:flex-row">
            <p className="text-xs text-muted-foreground">
              {pagination.total} aluno(s) · página {pagination.page} de{" "}
              {Math.max(1, pagination.totalPages)}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!pagination.hasPrevious}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!pagination.hasNext}
                onClick={() => setPage((value) => value + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Cadastrar aluno"
        description="O aluno receberá um convite por e-mail para criar a conta."
        size="md"
      >
        <StudentForm
          onCancel={() => setCreateOpen(false)}
          onSaved={(result) => {
            setCreateOpen(false);
            if (result.invite_url) setInviteLink(result.invite_url);
            void load({ page: 1 });
            router.refresh();
          }}
        />
      </Dialog>

      <Dialog
        open={Boolean(inviteLink)}
        onOpenChange={(open) => !open && setInviteLink(null)}
        title="Convite gerado"
        description="Compartilhe o link abaixo com o aluno. Em produção, o e-mail é enviado automaticamente."
        size="md"
        footer={
          <>
            {inviteLink ? <CopyButton value={inviteLink} label="Copiar convite" variant="default" size="md" /> : null}
            <Button type="button" variant="outline" onClick={() => setInviteLink(null)}>
              Fechar
            </Button>
          </>
        }
      >
        {inviteLink ? (
          <div className="space-y-3">
            <code className="block break-all rounded-lg bg-muted p-3 text-xs">{inviteLink}</code>
            <Badge variant="warning">O link expira em 7 dias</Badge>
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title={
          pendingAction?.type === "archive"
            ? "Arquivar aluno?"
            : pendingAction?.type === "pause"
              ? "Pausar vínculo?"
              : "Reativar vínculo?"
        }
        description={
          pendingAction?.type === "archive"
            ? `O histórico de ${pendingAction.enrollment.student_name} será preservado, mas o aluno sairá da lista ativa.`
            : undefined
        }
        confirmLabel={
          pendingAction?.type === "archive"
            ? "Arquivar"
            : pendingAction?.type === "pause"
              ? "Pausar"
              : "Reativar"
        }
        destructive={pendingAction?.type === "archive"}
        loading={actionLoading}
        onConfirm={executeAction}
      >
        {pendingAction?.type === "archive"
          ? "O aluno não aparecerá como ativo nos indicadores e não receberá novas aulas automáticas."
          : pendingAction?.type === "pause"
            ? "O vínculo continuará visível, mas não será considerado ativo nos indicadores."
            : "O aluno voltará a aparecer como ativo e poderá receber novas aulas."}
      </ConfirmDialog>
    </div>
  );
}
