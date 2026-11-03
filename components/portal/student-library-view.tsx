"use client";

import * as React from "react";
import { Clock3, FolderOpen, Library, Search, Video as VideoIcon } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/common/layout-pieces";
import { Skeleton } from "@/components/ui/feedback";
import { StudentVideoPlayer } from "./student-video-player";
import { apiFetch } from "@/lib/api/client";
import { formatDuration } from "@/lib/utils/date";
import type { StudentLibraryTechnique, StudentTechniqueVideos } from "@/types/plan";

export function StudentLibraryView({ techniques }: { techniques: StudentLibraryTechnique[] }) {
  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState(techniques[0]?.id ?? "");
  const [data, setData] = React.useState<StudentTechniqueVideos | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (techniqueId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<StudentTechniqueVideos>(
        `/api/student/library/techniques/${techniqueId}/videos`,
      );
      setData(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível abrir a técnica.");
      toast.error(caught instanceof Error ? caught.message : "Erro ao carregar técnica");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (selectedId) void load(selectedId);
  }, [load, selectedId]);

  const filtered = techniques.filter((technique) =>
    technique.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  if (techniques.length === 0) {
    return (
      <div>
        <PageHeader
          title="Biblioteca"
          description="Vídeos e técnicas liberados pelos seus professores."
        />
        <EmptyState
          title="Nenhum conteúdo liberado"
          description="Seu professor ainda não liberou técnicas na biblioteca. Vídeos de aulas concluídas continuam disponíveis no histórico."
          icon={<Library className="h-5 w-5" />}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Biblioteca"
        description="Técnicas e módulos liberados pelos seus professores, além de vídeos das suas aulas."
      />

      <div className="relative mb-4 max-w-lg">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar técnica liberada…"
          className="pl-9"
          aria-label="Buscar técnica"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Library className="h-4 w-4" />
              Técnicas liberadas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-3">
            {filtered.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Nenhuma técnica encontrada.</p>
            ) : (
              filtered.map((technique) => {
                const active = technique.id === selectedId;
                return (
                  <button
                    key={technique.id}
                    type="button"
                    onClick={() => setSelectedId(technique.id)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      active ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/40"
                    }`}
                  >
                    <p className="text-sm font-medium">{technique.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {technique.teacher_name} · {technique.module_count} módulo(s) ·{" "}
                      {technique.video_count} vídeo(s)
                    </p>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-8">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : error ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">{error}</CardContent>
            </Card>
          ) : data ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>{data.technique.name}</CardTitle>
                    <Badge variant="outline">{data.technique.teacher_name}</Badge>
                    <Badge variant={data.source === "technique" ? "success" : "info"}>
                      {data.source === "technique" ? "Técnica liberada" : "Vídeos das suas aulas"}
                    </Badge>
                  </div>
                  {data.technique.description ? (
                    <p className="text-sm text-muted-foreground">{data.technique.description}</p>
                  ) : null}
                </CardHeader>
              </Card>

              {data.modules.length === 0 ? (
                <EmptyState
                  title="Nenhum vídeo disponível"
                  description="Os vídeos desta técnica ainda estão sendo preparados."
                  icon={<VideoIcon className="h-5 w-5" />}
                />
              ) : (
                data.modules.map((module) => (
                  <Card key={module.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <FolderOpen className="h-4 w-4 text-muted-foreground" />
                        {module.name}
                      </CardTitle>
                      {module.description ? (
                        <p className="text-sm text-muted-foreground">{module.description}</p>
                      ) : null}
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {module.videos.map((video) => (
                          <li
                            key={video.id}
                            className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{video.title}</p>
                              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock3 className="h-3 w-3" />
                                {formatDuration(video.duration_seconds)}
                              </p>
                            </div>
                            {video.status === "ready" ? (
                              <StudentVideoPlayer
                                videoId={video.id}
                                title={video.title}
                                label="Assistir"
                              />
                            ) : (
                              <Badge variant="warning">Processando</Badge>
                            )}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))
              )}
            </>
          ) : (
            <EmptyState
              title="Selecione uma técnica"
              description="Escolha uma técnica liberada para ver os módulos e vídeos."
              icon={<VideoIcon className="h-5 w-5" />}
            />
          )}
        </div>
      </div>
    </div>
  );
}
