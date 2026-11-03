"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/feedback";
import { apiFetch, fieldErrorsFrom, jsonBody } from "@/lib/api/client";
import { DEMO_CREDENTIALS } from "@/lib/demo";
import type { AuthResult } from "@/types/auth";
import { GoogleAuthButton } from "./google-auth-button";
import { GoogleErrorAlert } from "./google-error-alert";

export function LoginForm({
  redirectTo,
  googleError,
}: {
  redirectTo?: string;
  googleError?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      const result = await apiFetch<AuthResult>("/api/auth/login", jsonBody({ email, password }));
      toast.success(`Bem-vindo, ${result.profile.full_name.split(" ")[0]}!`);
      const safeRedirect =
        redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")
          ? redirectTo
          : null;
      const destination =
        safeRedirect ?? (result.active_role === "teacher" ? "/dashboard" : "/portal");
      router.push(destination);
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Não foi possível entrar.";
      setError(message);
      setFieldErrors(fieldErrorsFrom(caught));
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(kind: "teacher" | "student") {
    setEmail(DEMO_CREDENTIALS[kind].email);
    setPassword(DEMO_CREDENTIALS[kind].password);
  }

  return (
    <div className="surface p-6 sm:p-7">
      <h2 className="text-xl font-semibold">Entrar na sua conta</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Acesse seu painel de aulas, alunos e biblioteca.
      </p>

      {googleError ? (
        <div className="mt-4">
          <GoogleErrorAlert error={googleError} />
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
        {error ? <Alert variant="destructive">{error}</Alert> : null}

        <GoogleAuthButton mode="login" redirectPath={redirectTo} />

        <div className="relative py-1" aria-hidden="true">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">ou</span>
          </div>
        </div>

        <Field label="E-mail" htmlFor="email" error={fieldErrors.email} required>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="voce@exemplo.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </Field>

        <Field label="Senha" htmlFor="password" error={fieldErrors.password} required>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Sua senha"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        <div className="flex justify-end">
          <Link href="/recover" className="text-sm font-medium text-primary hover:underline">
            Esqueci minha senha
          </Link>
        </div>

        <Button type="submit" className="w-full" loading={loading}>
          <LogIn className="h-4 w-4" />
          Entrar
        </Button>
      </form>

      <div className="mt-5 rounded-lg border border-dashed bg-muted/40 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Acesso de demonstração
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Senha para ambos: <strong>{DEMO_CREDENTIALS.teacher.password}</strong>
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => fillDemo("teacher")}>
            Professor
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => fillDemo("student")}>
            Aluno
          </Button>
        </div>
      </div>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Criar conta de professor
        </Link>
      </p>
    </div>
  );
}
