"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/feedback";
import { apiFetch, fieldErrorsFrom, jsonBody } from "@/lib/api/client";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/api/auth/reset-password", jsonBody({ token, password }));
      toast.success("Senha atualizada. Entre com a nova senha.");
      router.push("/login");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível redefinir a senha.");
      setFieldErrors(fieldErrorsFrom(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="surface p-6 sm:p-7">
      <h2 className="text-xl font-semibold">Criar nova senha</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Escolha uma senha com pelo menos 8 caracteres.
      </p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
        {error ? <Alert variant="destructive">{error}</Alert> : null}

        <Field label="Nova senha" htmlFor="password" error={fieldErrors.password} required>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>

        <Field label="Confirmar senha" htmlFor="confirm" required>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>

        <Button type="submit" className="w-full" loading={loading}>
          <KeyRound className="h-4 w-4" />
          Salvar nova senha
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Voltar para o login
        </Link>
      </p>
    </div>
  );
}
