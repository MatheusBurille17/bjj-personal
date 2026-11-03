"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/feedback";
import { apiFetch, fieldErrorsFrom, jsonBody } from "@/lib/api/client";
import { COMMON_TIMEZONES } from "@/lib/utils/validation";
import type { AuthResult } from "@/types/auth";
import { GoogleAuthButton } from "./google-auth-button";

export function SignupForm() {
  const router = useRouter();
  const [form, setForm] = React.useState({
    fullName: "",
    displayName: "",
    email: "",
    password: "",
    timezone: "America/Sao_Paulo",
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
    try {
      await apiFetch<AuthResult>("/api/auth/signup", jsonBody(form));
      toast.success("Conta criada com sucesso!");
      router.push("/dashboard");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível criar a conta.");
      setFieldErrors(fieldErrorsFrom(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="surface p-6 sm:p-7">
      <h2 className="text-xl font-semibold">Criar conta de professor</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Comece a organizar seus alunos, planos e aulas.
      </p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
        {error ? <Alert variant="destructive">{error}</Alert> : null}

        <GoogleAuthButton mode="signup" redirectPath="/dashboard" />

        <div className="relative py-1" aria-hidden="true">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">ou</span>
          </div>
        </div>

        <Field label="Nome completo" htmlFor="fullName" error={fieldErrors.fullName} required>
          <Input
            id="fullName"
            value={form.fullName}
            onChange={(event) => update("fullName", event.target.value)}
            placeholder="Rafael Mendes"
            autoComplete="name"
            required
          />
        </Field>

        <Field
          label="Nome de exibição"
          htmlFor="displayName"
          error={fieldErrors.displayName}
          hint="Como seus alunos verão seu nome."
          required
        >
          <Input
            id="displayName"
            value={form.displayName}
            onChange={(event) => update("displayName", event.target.value)}
            placeholder="Prof. Rafael"
            required
          />
        </Field>

        <Field label="E-mail" htmlFor="email" error={fieldErrors.email} required>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(event) => update("email", event.target.value)}
            placeholder="voce@exemplo.com"
            autoComplete="email"
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
            value={form.password}
            onChange={(event) => update("password", event.target.value)}
            placeholder="Crie uma senha segura"
            autoComplete="new-password"
            required
          />
        </Field>

        <Field label="Fuso horário" htmlFor="timezone" error={fieldErrors.timezone}>
          <Select
            id="timezone"
            value={form.timezone}
            onChange={(event) => update("timezone", event.target.value)}
          >
            {COMMON_TIMEZONES.map((timezone) => (
              <option key={timezone} value={timezone}>
                {timezone}
              </option>
            ))}
          </Select>
        </Field>

        <Button type="submit" className="w-full" loading={loading}>
          <UserPlus className="h-4 w-4" />
          Criar conta
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        Já tem uma conta?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
