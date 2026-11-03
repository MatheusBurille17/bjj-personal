"use client";

import * as React from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/feedback";
import { apiFetch, fieldErrorsFrom, jsonBody } from "@/lib/api/client";

export function PasswordRecoveryForm() {
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiFetch<{ message: string }>(
        "/api/auth/recover",
        jsonBody({ email }),
      );
      setMessage(result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível enviar o e-mail.");
      setFieldErrors(fieldErrorsFrom(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="surface p-6 sm:p-7">
      <h2 className="text-xl font-semibold">Recuperar senha</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Informe seu e-mail para receber um link de redefinição.
      </p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        {message ? <Alert variant="success">{message}</Alert> : null}

        <Field label="E-mail" htmlFor="email" error={fieldErrors.email} required>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@exemplo.com"
            autoComplete="email"
            required
          />
        </Field>

        <Button type="submit" className="w-full" loading={loading}>
          <Mail className="h-4 w-4" />
          Enviar link de recuperação
        </Button>
      </form>

      <p className="mt-4 text-xs text-muted-foreground">
        Por segurança, não informamos se o e-mail existe na plataforma. No ambiente de
        demonstração, o link fica na caixa de saída de teste disponível na tela de login.
      </p>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Voltar para o login
        </Link>
      </p>
    </div>
  );
}
