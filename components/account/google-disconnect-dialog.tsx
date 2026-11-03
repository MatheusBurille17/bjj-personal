"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";

export interface GoogleDisconnectDialogProps {
  open: boolean;
  googleEmail: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

/** Confirmação com trava de 2 segundos contra cliques acidentais. */
export function GoogleDisconnectDialog({
  open,
  googleEmail,
  onConfirm,
  onCancel,
  isLoading,
}: GoogleDisconnectDialogProps) {
  const [seconds, setSeconds] = React.useState(2);

  React.useEffect(() => {
    if (!open) {
      setSeconds(2);
      return;
    }
    setSeconds(2);
    const interval = window.setInterval(() => {
      setSeconds((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [open]);

  const locked = seconds > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      title="Desconectar conta Google"
      description={`A conta ${googleEmail || "Google"} deixará de ser usada pela plataforma.`}
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={locked || isLoading}
            loading={isLoading}
            aria-disabled={locked || isLoading}
          >
            {locked ? `Aguarde ${seconds}s` : "Desconectar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Alert variant="warning" title="O que acontece ao desconectar">
          <ul className="list-disc space-y-1 pl-4">
            <li>O acesso da plataforma ao seu Google Drive será revogado.</li>
            <li>
              O armazenamento de vídeos no Drive deixará de funcionar até você
              reconectar a conta.
            </li>
            <li>O login por e-mail e senha continuará funcionando normalmente.</li>
          </ul>
        </Alert>

        <div className="flex items-start gap-2 rounded-lg border p-3 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>
            Esta ação não exclui sua conta na plataforma. Ela apenas revoga a
            autorização concedida ao Google.
          </p>
        </div>
      </div>
    </Dialog>
  );
}
