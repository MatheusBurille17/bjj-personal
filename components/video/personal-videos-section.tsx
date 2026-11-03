"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Play, Upload, Video as VideoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api/client";
import type { Video } from "@/types/library";
import { VideoPlayer } from "@/components/video/video-player";
import { VideoUploadDialog } from "@/components/video/video-upload-dialog";

export interface PersonalVideosSectionProps {
  driveConnected: boolean;
}

/** Área "Meus Vídeos Pessoais" do aluno. */
export function PersonalVideosSection({
  driveConnected,
}: PersonalVideosSectionProps) {
  const router = useRouter();
  const [videos, setVideos] = React.useState<Video[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Video | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<{ videos: Video[] }>(
        "/api/videos?visibility=personal&pageSize=50",
      );
      setVideos(result.videos ?? []);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Não foi possível carregar seus vídeos",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  function onUploaded() {
    void load();
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <VideoIcon className="h-4 w-4" />
              Meus Vídeos Pessoais
            </CardTitle>
            <CardDescription>
              Vídeos armazenados no seu próprio Google Drive.
            </CardDescription>
          </div>
          {driveConnected ? (
            <Button type="button" size="sm" onClick={() => setUploadOpen(true)}>
              <Upload className="h-3.5 w-3.5" />
              Upload de vídeo pessoal
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!driveConnected ? (
          <Alert variant="warning">
            Conecte sua conta Google na seção de conta acima para enviar e
            assistir vídeos pessoais. O mesmo consentimento já autoriza o Drive.
          </Alert>
        ) : loading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : error ? (
          <Alert variant="destructive">{error}</Alert>
        ) : videos.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm font-medium">Nenhum vídeo pessoal ainda</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Envie um vídeo para compartilhar com seu professor quando quiser.
            </p>
            <Button
              type="button"
              size="sm"
              className="mt-3"
              onClick={() => setUploadOpen(true)}
            >
              <Upload className="h-3.5 w-3.5" />
              Enviar vídeo
            </Button>
          </div>
        ) : (
          <ul className="space-y-2">
            {videos.map((video) => (
              <li
                key={video.id}
                className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{video.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(video.created_at).toLocaleDateString("pt-BR")} ·{" "}
                    {video.size_bytes
                      ? `${(video.size_bytes / (1024 * 1024)).toFixed(1)} MB`
                      : "Google Drive"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={video.provider === "google_drive" ? "info" : "outline"}>
                    {video.provider === "google_drive" ? "Drive" : video.provider}
                  </Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setSelected(video)}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Assistir
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <VideoUploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          destination="personal"
          driveConnected={driveConnected}
          onUploaded={onUploaded}
        />

        <Dialog
          open={Boolean(selected)}
          onOpenChange={(open) => !open && setSelected(null)}
          title={selected?.title ?? "Vídeo pessoal"}
          size="xl"
        >
          {selected ? (
            <VideoPlayer
              videoId={selected.id}
              title={selected.title}
              description={selected.description}
              autoplay
            />
          ) : null}
        </Dialog>
      </CardContent>
    </Card>
  );
}
