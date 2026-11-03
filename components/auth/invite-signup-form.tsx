"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/feedback";
import { apiFetch, fieldErrorsFrom, jsonBody } from "@/lib/api/client";
import type { AuthResult } from "@/types/auth";

export function InviteSignupForm({
  token,
  studentEmail,
  teacherName,
}: {
  token: string;
  studentEmail: string;
  teacherName: string;
}) {
  const router = useRouter();
  const [fullName, setFullName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      await apiFetch<AuthResult>(`/api/auth/invite/${token}`, jsonBody({ fullName, password }));
      toast.success(`Convite aceito. Bem-vindo!`);
      router.push("/portal");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível aceitar o convite.");
      setFieldErrors(fieldErrorsFrom(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="surface p-6 sm:p-7">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
        Convite de {teacherName}
      </p>
      <h2 className="mt-1 text-xl font-semibold">Crie seu acesso de aluno</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Você usará <strong>{studentEmail}</strong> para acessar sua agenda, plano e vídeos.
      </p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
        {error ? <Alert variant="destructive">{error}</Alert> : null}

        <Field label="Nome completo" htmlFor="fullName" error={fieldErrors.fullName} required>
          <Input
            id="fullName"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Seu nome completo"
            autoComplete="name"
            required
          />
        </Field>

        <Field
          label="Senha"
          htmlFor="password"
          error={fieldErrors.password}
          hint="Mínimo de 8 caracteres."
          required
        >
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>

        <Button type="submit" className="w-full" loading={loading}>
          <UserPlus className="h-4 w-4" />
          Aceitar convite e entrar
        </Button>
      </form>
    </div>
  );
}
