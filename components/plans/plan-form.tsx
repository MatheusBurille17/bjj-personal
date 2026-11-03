"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/feedback";
import { apiFetch, fieldErrorsFrom, jsonBody } from "@/lib/api/client";
import type { MonthlyPlanWithCounts } from "@/types/plan";

function todayMonthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function todayMonthEnd(): string {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(
    last.getDate(),
  ).padStart(2, "0")}`;
}

export function PlanForm({
  plan,
  onSaved,
  onCancel,
}: {
  plan?: MonthlyPlanWithCounts;
  onSaved: (plan: MonthlyPlanWithCounts) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = React.useState({
    title: plan?.title ?? "",
    description: plan?.description ?? "",
    objective: plan?.objective ?? "",
    period_start: plan?.period_start ?? todayMonthStart(),
    period_end: plan?.period_end ?? todayMonthEnd(),
  });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});
    const payload = {
      title: form.title,
      description: form.description.trim() || null,
      objective: form.objective.trim() || null,
      period_start: form.period_start,
      period_end: form.period_end,
    };
    try {
      const result = plan
        ? await apiFetch<MonthlyPlanWithCounts>(`/api/plans/${plan.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await apiFetch<MonthlyPlanWithCounts>("/api/plans", jsonBody(payload));
      toast.success(plan ? "Plano atualizado" : "Plano criado");
      onSaved(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar o plano.");
      setFieldErrors(fieldErrorsFrom(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <Alert variant="destructive">{error}</Alert> : null}

      <Field label="Título do plano" htmlFor="title" error={fieldErrors.title} required>
        <Input
          id="title"
          value={form.title}
          onChange={(event) => update("title", event.target.value)}
          placeholder="Fundamentos do mês"
          required
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Início do período" htmlFor="period_start" error={fieldErrors.period_start} required>
          <Input
            id="period_start"
            type="date"
            value={form.period_start}
            onChange={(event) => update("period_start", event.target.value)}
            required
          />
        </Field>
        <Field label="Fim do período" htmlFor="period_end" error={fieldErrors.period_end} required>
          <Input
            id="period_end"
            type="date"
            value={form.period_end}
            onChange={(event) => update("period_end", event.target.value)}
            required
          />
        </Field>
      </div>

      <Field
        label="Objetivo geral"
        htmlFor="objective"
        error={fieldErrors.objective}
        hint="Resumo do que os alunos devem desenvolver no período."
      >
        <Input
          id="objective"
          value={form.objective}
          onChange={(event) => update("objective", event.target.value)}
          placeholder="Consolidar base, pressão e finalizações básicas"
        />
      </Field>

      <Field label="Descrição" htmlFor="description" error={fieldErrors.description}>
        <Textarea
          id="description"
          value={form.description}
          onChange={(event) => update("description", event.target.value)}
          placeholder="Detalhes do planejamento, metodologia e materiais…"
        />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" loading={loading}>
          {plan ? "Salvar alterações" : "Criar plano"}
        </Button>
      </div>
    </form>
  );
}
