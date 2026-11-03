"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/feedback";
import { apiFetch, fieldErrorsFrom, jsonBody } from "@/lib/api/client";
import type { Enrollment } from "@/types/enrollment";

export interface StudentFormValues {
  student_name: string;
  student_email: string;
  student_phone: string;
  private_notes: string;
}

export function StudentForm({
  enrollment,
  onSaved,
  onCancel,
}: {
  enrollment?: Pick<Enrollment, "id" | "student_name" | "student_email" | "student_phone" | "private_notes">;
  onSaved: (result: { enrollment?: Enrollment; invite_url?: string }) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = React.useState<StudentFormValues>({
    student_name: enrollment?.student_name ?? "",
    student_email: enrollment?.student_email ?? "",
    student_phone: enrollment?.student_phone ?? "",
    private_notes: enrollment?.private_notes ?? "",
  });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  function update(key: keyof StudentFormValues, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});
    const payload = {
      student_name: form.student_name,
      student_email: form.student_email,
      student_phone: form.student_phone.trim() || null,
      private_notes: form.private_notes.trim() || null,
    };

    try {
      if (enrollment) {
        const updated = await apiFetch<Enrollment>(`/api/enrollments/${enrollment.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast.success("Dados do aluno atualizados");
        onSaved({ enrollment: updated });
      } else {
        const created = await apiFetch<{ enrollment: Enrollment; invite_url: string }>(
          "/api/enrollments",
          jsonBody(payload),
        );
        toast.success("Aluno cadastrado e convite gerado");
        onSaved(created);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar o aluno.");
      setFieldErrors(fieldErrorsFrom(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <Alert variant="destructive">{error}</Alert> : null}

      <Field label="Nome completo" htmlFor="student_name" error={fieldErrors.student_name} required>
        <Input
          id="student_name"
          value={form.student_name}
          onChange={(event) => update("student_name", event.target.value)}
          placeholder="Nome do aluno"
          required
        />
      </Field>

      <Field label="E-mail" htmlFor="student_email" error={fieldErrors.student_email} required>
        <Input
          id="student_email"
          type="email"
          value={form.student_email}
          onChange={(event) => update("student_email", event.target.value)}
          placeholder="aluno@exemplo.com"
          required
        />
      </Field>

      <Field label="Telefone" htmlFor="student_phone" error={fieldErrors.student_phone}>
        <Input
          id="student_phone"
          value={form.student_phone}
          onChange={(event) => update("student_phone", event.target.value)}
          placeholder="(11) 90000-0000"
        />
      </Field>

      <Field
        label="Observações privadas"
        htmlFor="private_notes"
        error={fieldErrors.private_notes}
        hint={`${form.private_notes.length}/5000 caracteres · visível apenas para você`}
      >
        <Textarea
          id="private_notes"
          value={form.private_notes}
          onChange={(event) => update("private_notes", event.target.value)}
          maxLength={5000}
          placeholder="Anotações sobre evolução, lesões, preferências…"
        />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" loading={loading}>
          {enrollment ? "Salvar alterações" : "Cadastrar e convidar"}
        </Button>
      </div>
    </form>
  );
}
