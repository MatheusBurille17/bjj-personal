"use client";

import * as React from "react";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { apiFetch } from "@/lib/api/client";

export function StudentVideoPlayer({
  videoId,
  title,
  label = "Assistir",
  size = "sm",
  variant = "outline",
}: {
  videoId: string;
  title: string;
  label?: string;
  size?: "sm" | "md";
  variant?: "outline" | "ghost" | "default";
}) {
  const [open, setOpen] = React.useState(false);
  const [url, setUrl] = React.useState<string | null>(null);
  const [provider, setProvider] = React.useState<string>("demo");
  const [expiresAt, setExpiresAt] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function openPlayer() {
    setOpen(true);
    if (url) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<{
        playback_url: string;
        provider?: string;
        expires_at?: string;
      }>(`/api/student/videos/${videoId}/playback-url`);
      setUrl(result.playback_url);
      setProvider(result.provider ?? "demo");
      setExpiresAt(result.expires_at ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Vídeo indisponível.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" size={size} variant={variant} onClick={() => void openPlayer()}>
        <Play className="h-3.5 w-3.5" />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={title} size="xl">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verificando acesso e preparando o vídeo…
          </div>
        ) : error ? (
          <Alert variant="destructive">{error}</Alert>
        ) : url ? (
          <div className="space-y-2">
            {provider === "google_drive" ? (
              <iframe
                key={url}
                src={url}
                title={title}
                className="aspect-video w-full rounded-lg border bg-black"
                allow="autoplay; fullscreen; encrypted-media"
                allowFullScreen
                referrerPolicy="no-referrer"
              />
            ) : (
              <video
                key={url}
                controls
                autoPlay
                className="w-full rounded-lg bg-black"
                src={url}
              >
                Seu navegador não suporta a reprodução de vídeo.
              </video>
            )}
            <p className="text-xs text-muted-foreground">
              A reprodução é autorizada pelo servidor e a URL expira em{" "}
              {expiresAt
                ? new Date(expiresAt).toLocaleString("pt-BR")
                : "pouco tempo"}
              .
            </p>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
