"use client";

import * as React from "react";
import { Link2, Unlink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

export interface GoogleAccountStatusProps {
  connected: boolean;
  googleEmail?: string | null;
  googleName?: string | null;
  picture?: string | null;
  lastTokenRefreshAt?: string | null;
  onConnectClick: () => void;
  onDisconnectClick: () => void;
  isLoading?: boolean;
  className?: string;
}

/** Status da integração Google na tela de configurações/perfil. */
export function GoogleAccountStatus({
  connected,
  googleEmail,
  googleName,
  picture,
  lastTokenRefreshAt,
  onConnectClick,
  onDisconnectClick,
  isLoading,
  className,
}: GoogleAccountStatusProps) {
  return (
    <Card className={cn(className)}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>Conta Google</CardTitle>
            <CardDescription>
              Necessária para armazenar vídeos no Google Drive.
            </CardDescription>
          </div>
          <Badge variant={connected ? "success" : "secondary"}>
            {connected ? "Conectada" : "Não conectada"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {connected ? (
          <>
            <div className="flex items-center gap-3">
              <Avatar src={picture} name={googleName || googleEmail || "Google"} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {googleName || "Conta Google"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {googleEmail || "E-mail indisponível"}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div className="space-y-1">
                <p>Acesso ao Google Drive autorizado.</p>
                <p>
                  Última renovação do token:{" "}
                  {lastTokenRefreshAt
                    ? formatDateTime(lastTokenRefreshAt)
                    : "ainda não renovado"}
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={onDisconnectClick}
              loading={isLoading}
            >
              <Unlink className="h-4 w-4" />
              Desconectar Google
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Conecte sua conta Google para permitir que a plataforma acesse o
              Google Drive em seu nome. Você poderá desconectar quando quiser.
            </p>
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={onConnectClick}
              loading={isLoading}
            >
              <Link2 className="h-4 w-4" />
              Conectar Google
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
