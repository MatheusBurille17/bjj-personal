"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  CalendarRange,
  Copy,
  FileText,
  Plus,
  Search,
  Send,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { PageHeader, EmptyState } from "@/components/common/layout-pieces";
import { PlanStatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PlanForm } from "./plan-form";
import { apiFetch } from "@/lib/api/client";
import { formatDate } from "@/lib/utils/date";
import type { MonthlyPlanWithCounts, PlanStatus } from "@/types/plan";
import type { PaginationMeta } from "@/types/api";

const FILTERS: Array<{ value: PlanStatus; label: string }> = [
  { value: "draft", label: "Rascunhos" },
  { value: "published", label: "Publicados" },
  { value: "archived", label: "Arquivados" },
];

export function PlansView({
  initialPlans,
  initialPagination,
  initialOpen = false,
}: {
  initialPlans: MonthlyPlanWithCounts[];
  initialPagination: PaginationMeta;
  initialOpen?: boolean;
}) {
  const router = useRouter();
  const [plans, setPlans] = React.useState(initialPlans);
  const [pagination, setPagination] = React.useState(initialPagination);
  const [search, setSearch] = React.useState("");
  const [statuses, setStatuses] = React.useState<PlanStatus[]>(["draft", "published"]);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(initialOpen);
  const [action, setAction] = React.useState<{
    type: "archive" | "unarchive" | "publish" | "unpublish";
    plan: MonthlyPlanWithCounts;
  } | null>(null);
  const [actionLoading, setActionLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set("search", search.trim());
      for (const status of statuses) query.append("status", status);
      query.set("page", String(page));
      query.set("pageSize", "20");
      const result = await apiFetch<{
        plans: MonthlyPlanWithCounts[];
        pagination: PaginationMeta;
      }>(`/api/plans?${query}`);
      setPlans(result.plans);
      setPagination(result.pagination);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar planos");
    } finally {
      setLoading(false);
    }
  }, [page, search, statuses]);

  React.useEffect(() => {
    const timeout = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statuses, page]);

  function toggleStatus(status: PlanStatus) {
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
    if (!action) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/plans/${action.plan.id}/${action.type}`, { method: "POST" });
      toast.success(
        action.type === "publish"
          ? "Plano publicado"
          : action.type === "unpublish"
            ? "Plano voltou para rascunho"
            : action.type === "archive"
              ? "Plano arquivado"
              : "Plano reativado",
      );
      setAction(null);
      await load();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a ação");
    } finally {
      setActionLoading(false);
    }
  }

  async function duplicate(plan: MonthlyPlanWithCounts) {
    try {
      const copy = await apiFetch<MonthlyPlanWithCounts>(`/api/plans/${plan.id}/duplicate`, {
        method: "POST",
      });
      toast.success("Plano duplicado como rascunho");
      router.push(`/plans/${copy.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível duplicar");
    }
  }

  return (
    <div>
      <PageHeader
        title="Planos de aula"
        description="Planejamento pedagógico separado das aulas realizadas. Publique para os alunos autorizados."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Criar plano
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
              placeholder="Buscar plano pelo título…"
              className="pl-9"
              aria-label="Buscar plano"
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
          <div className="p-6 text-sm text-muted-foreground">Carregando planos…</div>
        ) : plans.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Nenhum plano encontrado"
              description="Crie um plano mensal para organizar o conteúdo das próximas aulas."
              icon={<FileText className="h-5 w-5" />}
              action={<Button onClick={() => setCreateOpen(true)}>Criar primeiro plano</Button>}
            />
          </div>
        ) : (
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => (
              <div key={plan.id} className="flex flex-col rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/plans/${plan.id}`}
                    className="line-clamp-2 text-base font-semibold hover:text-primary"
                  >
                    {plan.title}
                  </Link>
                  <PlanStatusBadge status={plan.status} />
                </div>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarRange className="h-3.5 w-3.5" />
                  {formatDate(plan.period_start)} — {formatDate(plan.period_end)}
                </p>
                <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
                  {plan.description ?? plan.objective ?? "Sem descrição."}
                </p>
                <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
                  <span>{plan.plan_day_count} dia(s)</span>
                  <span>{plan.enrolled_count} aluno(s) com acesso</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-1 border-t pt-3">
                  <ButtonLink href={`/plans/${plan.id}`} size="sm" variant="outline">
                    Abrir
                  </ButtonLink>
                  {plan.status === "draft" ? (
                    <Button size="sm" variant="ghost" onClick={() => setAction({ type: "publish", plan })}>
                      <Send className="h-3.5 w-3.5" />
                      Publicar
                    </Button>
                  ) : null}
                  {plan.status === "published" ? (
                    <Button size="sm" variant="ghost" onClick={() => setAction({ type: "unpublish", plan })}>
                      <Undo2 className="h-3.5 w-3.5" />
                      Despublicar
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => void duplicate(plan)}>
                    <Copy className="h-3.5 w-3.5" />
                    Duplicar
                  </Button>
                  {plan.status !== "archived" ? (
                    <Button size="sm" variant="ghost" onClick={() => setAction({ type: "archive", plan })}>
                      <Archive className="h-3.5 w-3.5" />
                      Arquivar
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setAction({ type: "unarchive", plan })}>
                      <Undo2 className="h-3.5 w-3.5" />
                      Restaurar
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {pagination.total > 0 ? (
          <div className="flex items-center justify-between border-t p-3 text-xs text-muted-foreground">
            <span>
              {pagination.total} plano(s) · página {pagination.page} de{" "}
              {Math.max(1, pagination.totalPages)}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={!pagination.hasPrevious} onClick={() => setPage((value) => value - 1)}>
                Anterior
              </Button>
              <Button size="sm" variant="outline" disabled={!pagination.hasNext} onClick={() => setPage((value) => value + 1)}>
                Próxima
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Criar plano de aula"
        description="O plano começa como rascunho e só fica visível após a publicação."
        size="lg"
      >
        <PlanForm
          onCancel={() => setCreateOpen(false)}
          onSaved={(plan) => {
            setCreateOpen(false);
            router.push(`/plans/${plan.id}`);
          }}
        />
      </Dialog>

      <ConfirmDialog
        open={Boolean(action)}
        onOpenChange={(open) => !open && setAction(null)}
        title={
          action?.type === "publish"
            ? "Publicar plano?"
            : action?.type === "unpublish"
              ? "Despublicar plano?"
              : action?.type === "archive"
                ? "Arquivar plano?"
                : "Restaurar plano?"
        }
        description={
          action?.type === "publish"
            ? "O plano ficará disponível para os alunos que você autorizar."
            : action?.type === "unpublish"
              ? "O plano voltará a ser rascunho e deixará de aparecer para os alunos."
              : undefined
        }
        confirmLabel={
          action?.type === "publish"
            ? "Publicar"
            : action?.type === "unpublish"
              ? "Despublicar"
              : action?.type === "archive"
                ? "Arquivar"
                : "Restaurar"
        }
        destructive={action?.type === "archive"}
        loading={actionLoading}
        onConfirm={executeAction}
      >
        {action?.type === "archive"
          ? "O plano e seus dias serão preservados, mas ele sairá das listas ativas."
          : action?.type === "publish"
            ? "A publicação não concede acesso automaticamente; use a ficha do plano para liberar alunos."
            : action?.type === "unpublish"
              ? "A publicação anterior permanece registrada para auditoria."
              : "O plano voltará ao estado de rascunho."}
      </ConfirmDialog>
    </div>
  );
}
