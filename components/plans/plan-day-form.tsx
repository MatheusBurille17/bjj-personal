"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/feedback";
import { WEEKDAY_LABELS } from "@/lib/utils/date";
import { apiFetch, fieldErrorsFrom, jsonBody } from "@/lib/api/client";
import type { PlanDayWithVideos } from "@/types/plan";

export function PlanDayForm({
  planId,
  day,
  onSaved,
  onCancel,
}: {
  planId: string;
  day?: PlanDayWithVideos;
  onSaved: (day: PlanDayWithVideos) => void;
  onCancel?: () => void;
}) {
  const [mode, setMode] = React.useState<"weekday" | "date">(
    day?.planned_date ? "date" : "weekday",
  );
  const [weekday, setWeekday] = React.useState(day?.weekday ?? 1);
  const [plannedDate, setPlannedDate] = React.useState(day?.planned_date ?? "");
  const [title, setTitle] = React.useState(day?.title ?? "");
  const [objective, setObjective] = React.useState(day?.objective ?? "");
  const [notes, setNotes] = React.useState(day?.notes ?? "");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (mode === "date" && !plannedDate) {
      setError("Informe a data específica do dia planejado.");
      return;
    }
    setLoading(true);
    setError(null);
    setFieldErrors({});

    const payload = {
      weekday: mode === "weekday" ? weekday : null,
      planned_date: mode === "date" ? plannedDate : null,
      title,
      objective: objective.trim() || null,
      notes: notes.trim() || null,
    };

    try {
      const result = day
        ? await apiFetch<PlanDayWithVideos>(`/api/plans/days/${day.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await apiFetch<PlanDayWithVideos>(`/api/plans/${planId}/days`, jsonBody(payload));
      toast.success(day ? "Dia atualizado" : "Dia adicionado ao plano");
      onSaved(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar o dia.");
      setFieldErrors(fieldErrorsFrom(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <Alert variant="destructive">{error}</Alert> : null}

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "weekday" ? "default" : "outline"}
          onClick={() => setMode("weekday")}
        >
          Dia da semana
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "date" ? "default" : "outline"}
          onClick={() => setMode("date")}
        >
          Data específica
        </Button>
      </div>

      {mode === "weekday" ? (
        <Field label="Dia da semana" htmlFor="weekday" required>
          <Select
            id="weekday"
            value={String(weekday)}
            onChange={(event) => setWeekday(Number(event.target.value))}
          >
            {WEEKDAY_LABELS.map((label, index) => (
              <option key={label} value={index}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field label="Data" htmlFor="planned_date" error={fieldErrors.planned_date} required>
          <Input
            id="planned_date"
            type="date"
            value={plannedDate}
            onChange={(event) => setPlannedDate(event.target.value)}
          />
        </Field>
      )}

      <Field label="Tema / título" htmlFor="title" error={fieldErrors.title} required>
        <Input
          id="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Passagem de guarda — execução"
          required
        />
      </Field>

      <Field label="Objetivo da aula" htmlFor="objective" error={fieldErrors.objective}>
        <Textarea
          id="objective"
          value={objective}
          onChange={(event) => setObjective(event.target.value)}
          placeholder="O que o aluno deve desenvolver nesta aula?"
        />
      </Field>

      <Field
        label="Observações e instruções"
        htmlFor="notes"
        error={fieldErrors.notes}
        hint={`${notes.length}/2000 caracteres`}
      >
        <Textarea
          id="notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={2000}
          placeholder="Detalhes, progressões e cuidados…"
        />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" loading={loading}>
          {day ? "Salvar dia" : "Adicionar dia"}
        </Button>
      </div>
    </form>
  );
}
