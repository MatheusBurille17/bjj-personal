"use client";

import * as React from "react";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";

export interface VideoUploadErrorProps {
  message: string;
  code?: string | null;
  onRetry?: () => void;
  onCancel?: () => void;
}

const MESSAGES: Record<string, string> = {
  file_too_large: "O arquivo excede o limite de 5GB.",
  invalid_file: "Formato não suportado. Use mp4, mov, webm, avi, mkv, flv ou wmv.",
  quota_exceeded: "Espaço insuficiente no Google Drive. Libere espaço e tente novamente.",
  token_expired: "Sua conexão com o Google Drive expirou. Reconecte e tente novamente.",
  permission_denied: "A plataforma não tem permissão para acessar esta pasta do Drive.",
  rate_limited: "O Google Drive está ocupado. Tente novamente em alguns minutos.",
  timeout: "A conexão com o Google Drive demorou demais. Tente novamente.",
  configuration_error: "O Google Drive não está configurado neste ambiente.",
  network_error: "Erro de conexão. Verifique sua internet e tente novamente.",
};

export function VideoUploadError({
  message,
  code,
  onRetry,
  onCancel,
}: VideoUploadErrorProps) {
  return (
    <Alert variant="destructive">
      <p className="font-medium">Falha no upload</p>
      <p className="mt-1 text-sm">
        {code && MESSAGES[code] ? MESSAGES[code] : message}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {onRetry ? (
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            Tentar novamente
          </Button>
        ) : null}
        {onCancel ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Fechar
          </Button>
        ) : null}
      </div>
    </Alert>
  );
}
