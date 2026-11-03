"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { HardDrive, RotateCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, Progress, Skeleton } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  fetchDriveStatus,
  disconnectDrive,
  type DriveStatusResponse,
} from "@/lib/api/videos";
import { GoogleDriveConnectButton } from "./google-drive-connect-button";

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export interface GoogleDriveStatusProps {
  redirectPath: string;
  initialStatus?: DriveStatusResponse | null;
  /** Quando true, não exibe um segundo botão de conexão (a conta Google já é
   *  conectada pela seção principal). */
  readOnly?: boolean;
}

/** Card de status, quota e conexão do Google Drive. */
export function GoogleDriveStatus({
  redirectPath,
  initialStatus = null,
  readOnly = false,
}: GoogleDriveStatusProps) {
  const router = useRouter();
  const [status, setStatus] = React.useState<DriveStatusResponse | null>(initialStatus);
  const [loading, setLoading] = React.useState(!initialStatus);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await fetchDriveStatus());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Status indisponível");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    // Busca a quota no cliente quando o servidor enviou um status conectado
    // sem os dados de armazenamento.
    if (!initialStatus || (initialStatus.connected && !initialStatus.storage)) {
      void load();
    }
  }, [initialStatus, load]);

  async function confirmDisconnect() {
    setDisconnecting(true);
    try {
      await disconnectDrive();
      setConfirmOpen(false);
      setStatus((current) =>
        current
          ? { ...current, connected: false, userEmail: null, driveId: null }
          : current,
      );
      toast.success("Google Drive desconectado");
      router.refresh();
      await load();
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Não foi possível desconectar";
      setError(message);
      toast.error(message);
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Google Drive</CardTitle>
          <CardDescription>Verificando conexão…</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  const connected = status?.connected === true;
  const limit = status?.storage?.limit ?? null;
  const usage = status?.storage?.usage ?? null;
  const percentage = limit && usage ? Math.min(100, (usage / limit) * 100) : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>Google Drive</CardTitle>
            <CardDescription>
              Armazenamento dos vídeos da biblioteca e vídeos pessoais.
            </CardDescription>
          </div>
          <Badge variant={connected ? "success" : "secondary"}>
            {connected ? "Conectado" : "Desconectado"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <Alert variant="destructive">{error}</Alert> : null}

        {connected ? (
          <>
            <div className="space-y-1 text-sm">
              <p className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{status?.userEmail ?? "Conta Google"}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Drive: {status?.driveId ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                Última sincronização:{" "}
                {status?.lastSync
                  ? new Date(status.lastSync).toLocaleString("pt-BR")
                  : "—"}
              </p>
            </div>

            {percentage !== null ? (
              <div className="space-y-1">
                <Progress value={percentage} />
                <p className="text-xs text-muted-foreground">
                  {formatBytes(usage)} de {formatBytes(limit)} utilizados
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
                <RotateCw className="h-3.5 w-3.5" />
                Atualizar status
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
              >
                <Unplug className="h-3.5 w-3.5" />
                Desconectar Drive
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {readOnly
                ? "Conecte sua conta Google na seção de conta acima para ativar o armazenamento de vídeos."
                : "Conecte sua conta Google para armazenar e reproduzir vídeos com o Google Drive."}
            </p>
            {readOnly ? null : (
              <GoogleDriveConnectButton
                redirectPath={redirectPath}
                onError={setError}
                onConnected={() => void load()}
              />
            )}
          </>
        )}

        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Desconectar Google Drive"
          description="Os vídeos continuarão no seu Drive, mas a plataforma perderá o acesso até você reconectar."
          confirmLabel="Desconectar"
          destructive
          loading={disconnecting}
          onConfirm={confirmDisconnect}
        />
      </CardContent>
    </Card>
  );
}
