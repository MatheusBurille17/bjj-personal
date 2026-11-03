"use client";

import * as React from "react";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { googleErrorMessage } from "@/lib/google-oauth-messages";
import { cn } from "@/lib/utils";

export interface GoogleErrorAlertProps {
  error: string | null | undefined;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

/** Alerta amigável para falhas do fluxo Google OAuth. */
export function GoogleErrorAlert({
  error,
  onRetry,
  onDismiss,
  className,
}: GoogleErrorAlertProps) {
  const [visible, setVisible] = React.useState(Boolean(error));

  React.useEffect(() => {
    setVisible(Boolean(error));
  }, [error]);

  if (!error || !visible) return null;

  function dismiss() {
    setVisible(false);
    onDismiss?.();
  }

  return (
    <div role="alert" className={cn("space-y-2", className)}>
      <Alert variant="destructive" title="Não foi possível concluir a autenticação">
        <p>{googleErrorMessage(error)}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {onRetry ? (
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
              Tentar novamente
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" onClick={dismiss}>
            Dispensar
          </Button>
        </div>
      </Alert>
    </div>
  );
}
