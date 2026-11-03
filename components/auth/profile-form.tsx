"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/feedback";
import { apiFetch, fieldErrorsFrom } from "@/lib/api/client";
import { COMMON_TIMEZONES } from "@/lib/utils/validation";
import type { ProfileResponse } from "@/types/auth";

export function ProfileForm({
  data,
  teacherMode,
}: {
  data: ProfileResponse;
  teacherMode: boolean;
}) {
  const router = useRouter();
  const [fullName, setFullName] = React.useState(data.profile.full_name);
  const [displayName, setDisplayName] = React.useState(data.teacher?.display_name ?? "");
  const [timezone, setTimezone] = React.useState(data.teacher?.timezone ?? "America/Sao_Paulo");
  const [bio, setBio] = React.useState(data.teacher?.bio ?? "");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      await apiFetch("/api/profiles/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          ...(teacherMode
            ? {
                display_name: displayName,
                timezone,
                bio: bio.trim() || null,
              }
            : {}),
        }),
      });
      toast.success("Perfil atualizado");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar o perfil.");
      setFieldErrors(fieldErrorsFrom(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <Alert variant="destructive">{error}</Alert> : null}

      <Field label="Nome completo" htmlFor="full_name" error={fieldErrors.full_name} required>
        <Input
          id="full_name"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          autoComplete="name"
          required
        />
      </Field>

      <Field label="E-mail" htmlFor="email" hint="O e-mail da conta não pode ser alterado aqui.">
        <Input id="email" value={data.profile.email} readOnly disabled />
      </Field>

      {teacherMode ? (
        <>
          <Field
            label="Nome de exibição"
            htmlFor="display_name"
            error={fieldErrors.display_name}
            hint="Nome mostrado aos alunos no portal."
            required
          >
            <Input
              id="display_name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
            />
          </Field>

          <Field label="Fuso horário" htmlFor="timezone" error={fieldErrors.timezone}>
            <Select
              id="timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
            >
              {COMMON_TIMEZONES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Bio pública"
            htmlFor="bio"
            error={fieldErrors.bio}
            hint={`${bio.length}/1000 caracteres`}
          >
            <Textarea
              id="bio"
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              maxLength={1000}
              placeholder="Conte um pouco sobre sua experiência e metodologia."
            />
          </Field>
        </>
      ) : null}

      <Button type="submit" loading={loading}>
        <Save className="h-4 w-4" />
        Salvar alterações
      </Button>
    </form>
  );
}
