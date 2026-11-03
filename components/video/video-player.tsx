"use client";

import * as React from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { requestPlayback, type PlaybackResponse } from "@/lib/api/videos";

export interface VideoErrorDisplayProps {
  message: string;
  code?: string;
  onRetry?: () => void;
}

export function VideoErrorDisplay({ message, code, onRetry }: VideoErrorDisplayProps) {
  return (
    <Alert variant="destructive">
      <p className="font-medium">Vídeo indisponível</p>
      <p className="mt-1 text-sm">{message}</p>
      {code ? <p className="mt-1 text-xs opacity-70">{code}</p> : null}
      {onRetry ? (
        <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Tentar novamente
        </Button>
      ) : null}
    </Alert>
  );
}

export interface VideoMetadataProps {
  title: string;
  description?: string | null;
  durationSeconds?: number | null;
  createdAt?: string | null;
  thumbnailUrl?: string | null;
  provider?: string;
}

export function VideoMetadata({
  title,
  description,
  durationSeconds,
  createdAt,
  thumbnailUrl,
  provider,
}: VideoMetadataProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {provider ? (
          <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
            {provider === "google_drive" ? "Google Drive" : provider.toUpperCase()}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {durationSeconds ? <span>Duração: {Math.round(durationSeconds / 60)} min</span> : null}
        {createdAt ? (
          <span>Adicionado em {new Date(createdAt).toLocaleDateString("pt-BR")}</span>
        ) : null}
      </div>
      {thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailUrl}
          alt={`Miniatura de ${title}`}
          className="w-full rounded-lg border object-cover"
        />
      ) : null}
    </div>
  );
}

export interface VideoPlayerProps {
  videoId: string;
  title: string;
  description?: string | null;
  autoplay?: boolean;
  initialProvider?: string;
  onLoaded?: (playback: PlaybackResponse) => void;
}

/**
 * Player híbrido: iframe para Google Drive e <video> para Mux/demo. A URL é
 * buscada sob demanda e nunca fica armazenada no banco.
 */
export function VideoPlayer({
  videoId,
  title,
  description,
  autoplay = false,
  onLoaded,
}: VideoPlayerProps) {
  const [playback, setPlayback] = React.useState<PlaybackResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<{ message: string; code?: string } | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await requestPlayback(videoId);
      setPlayback(result);
      onLoaded?.(result);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Vídeo indisponível";
      const code =
        caught && typeof caught === "object" && "code" in caught
          ? String((caught as { code: unknown }).code)
          : undefined;
      setError({ message, code });
    } finally {
      setLoading(false);
    }
  }, [onLoaded, videoId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Verificando acesso e preparando o vídeo…
      </div>
    );
  }

  if (error) {
    return (
      <VideoErrorDisplay
        message={error.message}
        code={error.code}
        onRetry={() => void load()}
      />
    );
  }

  if (!playback) return null;

  return (
    <div className="space-y-3">
      <VideoMetadata title={title} description={description} provider={playback.provider} />
      {playback.provider === "google_drive" ? (
        <iframe
          key={playback.playback_url}
          src={playback.playback_url}
          title={title}
          className="aspect-video w-full rounded-lg border bg-black"
          allow="autoplay; fullscreen; encrypted-media"
          allowFullScreen
          referrerPolicy="no-referrer"
        />
      ) : (
        <video
          key={playback.playback_url}
          controls
          autoPlay={autoplay}
          className="w-full rounded-lg bg-black"
          src={playback.playback_url}
        >
          Seu navegador não suporta a reprodução de vídeo.
        </video>
      )}
      <p className="text-xs text-muted-foreground">
        URL de reprodução temporária, válida até{" "}
        {new Date(playback.expires_at).toLocaleString("pt-BR")}.
      </p>
    </div>
  );
}
