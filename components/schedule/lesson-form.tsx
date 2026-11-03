"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/feedback";
import { apiFetch, fieldErrorsFrom, jsonBody } from "@/lib/api/client";
import { formatTime, WEEKDAY_LABELS } from "@/lib/utils/date";
import type { EnrollmentListItem } from "@/types/enrollment";
import type { LessonDetail, LessonListItem, PlanDayOption } from "@/types/lesson";

export function LessonForm({
  enrollments,
  planDays,
  defaultEnrollmentId,
  defaultDate,
  onSaved,
  onCancel,
}: {
  enrollments: EnrollmentListItem[];
  planDays: PlanDayOption[];
  defaultEnrollmentId?: string;
  defaultDate?: string;
  onSaved: (lesson: LessonDetail) => void;
  onCancel?: () => void;
}) {
  const activeEnrollments = enrollments.filter(
    (enrollment) => enrollment.status === "active" || enrollment.id === defaultEnrollmentId,
  );
  const [enrollmentId, setEnrollmentId] = React.useState(
    defaultEnrollmentId ?? activeEnrollments[0]?.id ?? "",
  );
  const [date, setDate] = React.useState(defaultDate ?? new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = React.useState("18:00");
  const [endTime, setEndTime] = React.useState("19:00");
  const [planDayId, setPlanDayId] = React.useState("");
  const [sharedNotes, setSharedNotes] = React.useState("");
  const [privateNotes, setPrivateNotes] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [conflicts, setConflicts] = React.useState<LessonListItem[] | null>(null);

  const weekday = new Date(`${date}T12:00:00`).getDay();
  const relevantPlanDays = planDays.filter(
    (day) => day.weekday === weekday || day.planned_date === date,
  );

  async function submit(override = false) {
    setLoading(true);
    setError(null);
    setFieldErrors({});
    setConflicts(null);
    try {
      const startsAt = new Date(`${date}T${startTime}:00`).toISOString();
      const endsAt = new Date(`${date}T${endTime}:00`).toISOString();
      if (new Date(endsAt) <= new Date(startsAt)) {
        setError("O horário final deve ser posterior ao inicial.");
        return;
      }
      const result = await apiFetch<LessonDetail>("/api/lessons", {
        ...jsonBody({
          enrollment_id: enrollmentId,
          plan_day_id: planDayId || null,
          starts_at: startsAt,
          ends_at: endsAt,
          shared_notes: sharedNotes.trim() || null,
          private_notes: privateNotes.trim() || null,
          override_conflict: override,
        }),
      });
      toast.success("Aula agendada");
      onSaved(result);
    } catch (caught) {
      const details = (caught as { details?: { conflicts?: LessonListItem[] } })?.details;
      if (details?.conflicts?.length) {
        setConflicts(details.conflicts);
      } else {
        setError(caught instanceof Error ? caught.message : "Não foi possível agendar a aula.");
        setFieldErrors(fieldErrorsFrom(caught));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit(false);
      }}
      className="space-y-4"
      noValidate
    >
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {conflicts ? (
        <Alert variant="warning" title="Conflito de horário">
          <p>Já existe(m) {conflicts.length} aula(s) agendada(s) neste intervalo:</p>
          <ul className="mt-1 list-disc pl-4 text-xs">
            {conflicts.map((lesson) => (
              <li key={lesson.id}>
                {lesson.student_name} · {formatTime(lesson.starts_at)}–{formatTime(lesson.ends_at)}
              </li>
            ))}
          </ul>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => void submit(true)}
            loading={loading}
          >
            Agendar mesmo assim
          </Button>
        </Alert>
      ) : null}

      <Field label="Aluno" htmlFor="enrollment" error={fieldErrors.enrollment_id} required>
        <Select
          id="enrollment"
          value={enrollmentId}
          onChange={(event) => setEnrollmentId(event.target.value)}
          required
        >
          <option value="">Selecione o aluno…</option>
          {activeEnrollments.map((enrollment) => (
            <option key={enrollment.id} value={enrollment.id}>
              {enrollment.student_name}
              {enrollment.status === "paused" ? " (pausado)" : ""}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Data" htmlFor="lesson-date" error={fieldErrors.starts_at} required>
          <Input
            id="lesson-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </Field>
        <Field label="Início" htmlFor="lesson-start" required>
          <Input
            id="lesson-start"
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            required
          />
        </Field>
        <Field label="Fim" htmlFor="lesson-end" error={fieldErrors.ends_at} required>
          <Input
            id="lesson-end"
            type="time"
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
            required
          />
        </Field>
      </div>

      <Field
        label="Dia do plano (opcional)"
        htmlFor="plan-day"
        hint="O tema e o objetivo serão copiados como referência para a aula."
      >
        <Select
          id="plan-day"
          value={planDayId}
          onChange={(event) => setPlanDayId(event.target.value)}
        >
          <option value="">Sem plano vinculado</option>
          {relevantPlanDays.map((day) => (
            <option key={day.id} value={day.id}>
              {day.plan_title} · {day.title} (
              {day.weekday !== null ? WEEKDAY_LABELS[day.weekday] : day.planned_date})
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Observações para o aluno"
        htmlFor="shared-notes"
        error={fieldErrors.shared_notes}
        hint="Visíveis no portal do aluno."
      >
        <Textarea
          id="shared-notes"
          value={sharedNotes}
          onChange={(event) => setSharedNotes(event.target.value)}
          placeholder="Conteúdo previsto, materiais, aquecimento…"
        />
      </Field>

      <Field
        label="Notas privadas"
        htmlFor="private-notes"
        error={fieldErrors.private_notes}
        hint="Visíveis apenas para você."
      >
        <Textarea
          id="private-notes"
          value={privateNotes}
          onChange={(event) => setPrivateNotes(event.target.value)}
          placeholder="Pontos de atenção, evolução, lesões…"
        />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" loading={loading} disabled={!enrollmentId}>
          Agendar aula
        </Button>
      </div>
    </form>
  );
}
