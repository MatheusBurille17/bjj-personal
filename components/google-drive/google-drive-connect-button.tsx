"use client";

import * as React from "react";
import { HardDrive, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { beginDriveAuthorization } from "@/lib/api/videos";

export interface GoogleDriveConnectButtonProps {
  connected?: boolean;
  userEmail?: string | null;
  redirectPath: string;
  onConnected?: () => void;
  onError?: (message: string) => void;
  onRedirect?: (url: string) => void;
  disabled?: boolean;
}

/** Botão de conexão OAuth com o Google Drive (escopo drive.file). */
export function GoogleDriveConnectButton({
  connected = false,
  userEmail,
  redirectPath,
  onConnected,
  onError,
  onRedirect,
  disabled,
}: GoogleDriveConnectButtonProps) {
  const [loading, setLoading] = React.useState(false);

  async function connect() {
    setLoading(true);
    try {
      const url = await beginDriveAuthorization(redirectPath);
      onConnected?.();
      if (onRedirect) onRedirect(url);
      else window.location.assign(url);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Não foi possível conectar";
      onError?.(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  if (connected) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <HardDrive className="h-4 w-4 text-emerald-600" />
        <span className="font-medium">Conectado</span>
        {userEmail ? (
          <span className="text-muted-foreground">({userEmail})</span>
        ) : null}
      </div>
    );
  }

  return (
    <Button
      type="button"
      onClick={connect}
      loading={loading}
      disabled={disabled}
      className="w-full sm:w-auto"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
      Conectar ao Google Drive
    </Button>
  );
}
