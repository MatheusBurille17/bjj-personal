"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  beginGoogleAuthorization,
  disconnectGoogleAccount,
  googleErrorCodeFrom,
} from "@/lib/api/google-auth";
import { googleErrorMessage } from "@/lib/google-oauth-messages";
import { GoogleErrorAlert } from "@/components/auth/google-error-alert";
import { GoogleAccountStatus } from "./google-account-status";
import { GoogleDisconnectDialog } from "./google-disconnect-dialog";

export interface GoogleAccountSectionProps {
  connected: boolean;
  googleEmail: string | null;
  googleName: string | null;
  picture: string | null;
  lastTokenRefreshAt: string | null;
  redirectPath: string;
  initialError?: string | null;
}

/** Seção de conta Google nas configurações/perfil. */
export function GoogleAccountSection({
  connected: initialConnected,
  googleEmail,
  googleName,
  picture,
  lastTokenRefreshAt,
  redirectPath,
  initialError,
}: GoogleAccountSectionProps) {
  const router = useRouter();
  const [connected, setConnected] = React.useState(initialConnected);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(initialError ?? null);

  React.useEffect(() => {
    setConnected(initialConnected);
  }, [initialConnected]);

  React.useEffect(() => {
    setError(initialError ?? null);
  }, [initialError]);

  async function startConnect() {
    setConnecting(true);
    setError(null);
    try {
      const url = await beginGoogleAuthorization({
        redirectPath,
        connectMode: true,
      });
      window.location.assign(url);
    } catch (caught) {
      const code = googleErrorCodeFrom(caught);
      setError(code);
      toast.error(googleErrorMessage(code));
    } finally {
      setConnecting(false);
    }
  }

  async function confirmDisconnect() {
    setDisconnecting(true);
    setError(null);
    try {
      await disconnectGoogleAccount();
      setConnected(false);
      setDialogOpen(false);
      toast.success("Conta Google desconectada.");
      router.refresh();
    } catch (caught) {
      const code = googleErrorCodeFrom(caught);
      setError(code);
      toast.error(googleErrorMessage(code));
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <GoogleErrorAlert
          error={error}
          onRetry={connected ? confirmDisconnect : startConnect}
          onDismiss={() => setError(null)}
        />
      ) : null}

      <GoogleAccountStatus
        connected={connected}
        googleEmail={connected ? googleEmail : null}
        googleName={connected ? googleName : null}
        picture={connected ? picture : null}
        lastTokenRefreshAt={connected ? lastTokenRefreshAt : null}
        onConnectClick={startConnect}
        onDisconnectClick={() => setDialogOpen(true)}
        isLoading={connecting || disconnecting}
      />

      <GoogleDisconnectDialog
        open={dialogOpen}
        googleEmail={googleEmail ?? ""}
        onConfirm={confirmDisconnect}
        onCancel={() => setDialogOpen(false)}
        isLoading={disconnecting}
      />
    </div>
  );
}
