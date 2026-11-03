"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  FolderPlus,
  Layers,
  Library,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  Undo2,
  Upload,
  Video as VideoIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { EmptyState, PageHeader } from "@/components/common/layout-pieces";
import { ActiveStatusBadge, VideoStatusBadge } from "@/components/common/status-badge";
import { VideoUploadDialog, type VideoModuleOption } from "@/components/video/video-upload-dialog";
import { VideoAccess } from "@/components/video/video-access";
import { apiFetch, fieldErrorsFrom, jsonBody } from "@/lib/api/client";
import { formatDuration } from "@/lib/utils/date";
import type { LibraryTree, Module, Technique, Video, VideoStatus } from "@/types/library";

type TechniqueDialogState = { open: boolean; technique?: Technique };
type ModuleDialogState = { open: boolean; module?: Module };
type VideoDialogState = { open: boolean; video?: Video; moduleId?: string };

export function LibraryView({ tree, initialNew = false }: { tree: LibraryTree; initialNew?: boolean }) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [selectedTechniqueId, setSelectedTechniqueId] = React.useState(
    tree.techniques[0]?.id ?? "",
  );
  const [selectedModuleId, setSelectedModuleId] = React.useState(
    tree.techniques[0] ? (tree.modules[tree.techniques[0].id]?.[0]?.id ?? "") : "",
  );
  const [techniqueDialog, setTechniqueDialog] = React.useState<TechniqueDialogState>({
    open: initialNew,
  });
  const [moduleDialog, setModuleDialog] = React.useState<ModuleDialogState>({ open: false });
  const [videoDialog, setVideoDialog] = React.useState<VideoDialogState>({ open: false });
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [player, setPlayer] = React.useState<{
    id: string;
    title: string;
    url: string;
    provider: string;
    description?: string | null;
  } | null>(null);
  const [loading, setLoading] = React.useState(false);

  const moduleOptions = React.useMemo<VideoModuleOption[]>(
    () =>
      tree.techniques.flatMap((technique) =>
        (tree.modules[technique.id] ?? []).map((moduleRecord) => ({
          id: moduleRecord.id,
          name: moduleRecord.name,
          technique_id: technique.id,
          technique_name: technique.name,
        })),
      ),
    [tree],
  );

  const selectedTechnique = tree.techniques.find((item) => item.id === selectedTechniqueId);
  const modules = React.useMemo(
    () => (selectedTechniqueId ? (tree.modules[selectedTechniqueId] ?? []) : []),
    [selectedTechniqueId, tree.modules],
  );
  const selectedModule = modules.find((item) => item.id === selectedModuleId);
  const videos = selectedModule ? (tree.videos[selectedModule.id] ?? []) : [];

  React.useEffect(() => {
    if (!selectedTechniqueId && tree.techniques[0]) {
      setSelectedTechniqueId(tree.techniques[0].id);
    }
  }, [selectedTechniqueId, tree.techniques]);

  React.useEffect(() => {
    if (selectedTechnique && !modules.some((item) => item.id === selectedModuleId)) {
      setSelectedModuleId(modules[0]?.id ?? "");
    }
  }, [modules, selectedModuleId, selectedTechnique]);

  const searchResults = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    const output: Array<{
      video: Video;
      technique: string;
      module: string;
      techniqueId: string;
      moduleId: string;
    }> = [];
    for (const technique of tree.techniques) {
      for (const moduleRecord of tree.modules[technique.id] ?? []) {
        for (const video of tree.videos[moduleRecord.id] ?? []) {
          if (video.title.toLowerCase().includes(term)) {
            output.push({
              video,
              technique: technique.name,
              module: moduleRecord.name,
              techniqueId: technique.id,
              moduleId: moduleRecord.id,
            });
          }
        }
      }
    }
    return output;
  }, [search, tree]);

  function selectTechnique(id: string) {
    setSelectedTechniqueId(id);
    setSelectedModuleId(tree.modules[id]?.[0]?.id ?? "");
  }

  async function action(path: string, method: "POST" | "DELETE", success: string) {
    setLoading(true);
    try {
      await apiFetch(path, { method });
      toast.success(success);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a ação");
    } finally {
      setLoading(false);
    }
  }

  async function openPlayer(video: Video) {
    try {
      const result = await apiFetch<{ playback_url: string; provider?: string }>(
        `/api/library/videos/${video.id}/playback`,
      );
      setPlayer({
        id: video.id,
        title: video.title,
        url: result.playback_url,
        provider: result.provider ?? video.provider,
        description: video.description,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Vídeo indisponível");
    }
  }

  return (
    <div>
      <PageHeader
        title="Biblioteca de técnicas"
        description="Organize técnicas, módulos e vídeos reutilizáveis nos planos e nas aulas."
        actions={
          <>
            <Button variant="outline" onClick={() => setTechniqueDialog({ open: true })}>
              <FolderPlus className="h-4 w-4" />
              Nova técnica
            </Button>
            <Button
              variant="outline"
              onClick={() => setUploadOpen(true)}
              disabled={moduleOptions.length === 0}
            >
              <Upload className="h-4 w-4" />
              Upload de vídeo
            </Button>
            <Button
              onClick={() => setVideoDialog({ open: true, moduleId: selectedModule?.id })}
              disabled={!selectedModule || selectedModule.status === "archived"}
            >
              <Plus className="h-4 w-4" />
              Novo vídeo
            </Button>
          </>
        }
      />

      <div className="relative mb-4 max-w-lg">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar vídeos em toda a biblioteca…"
          className="pl-9"
          aria-label="Buscar vídeos"
        />
        {loading ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            Atualizando…
          </span>
        ) : null}
      </div>

      {search.trim() ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Resultados da busca</CardTitle>
            <p className="text-sm text-muted-foreground">
              {searchResults.length} vídeo(s) encontrado(s) para “{search}”.
            </p>
          </CardHeader>
          <CardContent>
            {searchResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum vídeo encontrado.</p>
            ) : (
              <ul className="divide-y">
                {searchResults.map(({ video, technique, module: moduleName, techniqueId, moduleId }) => (
                  <li key={video.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{video.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {technique} · {moduleName}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <VideoStatusBadge status={video.status} />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedTechniqueId(techniqueId);
                          setSelectedModuleId(moduleId);
                          setSearch("");
                        }}
                      >
                        Abrir módulo
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-4">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Técnicas
            </CardTitle>
            <Badge variant="muted">{tree.techniques.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-2 p-3">
            {tree.techniques.length === 0 ? (
              <EmptyState
                title="Nenhuma técnica"
                description="Crie sua primeira técnica para começar a organizar os vídeos."
                icon={<Library className="h-5 w-5" />}
              />
            ) : (
              tree.techniques.map((technique) => {
                const active = technique.id === selectedTechniqueId;
                return (
                  <div
                    key={technique.id}
                    className={`rounded-lg border p-3 transition-colors ${
                      active ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/40"
                    }`}
                  >
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-2 text-left"
                      onClick={() => selectTechnique(technique.id)}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{technique.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {technique.module_count} módulo(s) · {technique.video_count} vídeo(s)
                        </p>
                      </div>
                      <ChevronRight className={`h-4 w-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                    </button>
                    <div className="mt-2 flex items-center justify-between gap-1">
                      <ActiveStatusBadge status={technique.status} />
                      <div className="flex gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setTechniqueDialog({ open: true, technique })}
                          aria-label="Editar técnica"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {technique.status === "active" ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                              void action(
                                `/api/library/techniques/${technique.id}/archive`,
                                "POST",
                                "Técnica arquivada",
                              )
                            }
                            aria-label="Arquivar técnica"
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                              void action(
                                `/api/library/techniques/${technique.id}/unarchive`,
                                "POST",
                                "Técnica reativada",
                              )
                            }
                            aria-label="Reativar técnica"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Módulos
            </CardTitle>
            {selectedTechnique ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setModuleDialog({ open: true })}
                disabled={selectedTechnique.status === "archived"}
              >
                <Plus className="h-3.5 w-3.5" />
                Novo
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-2 p-3">
            {!selectedTechnique ? (
              <p className="p-3 text-sm text-muted-foreground">Selecione uma técnica.</p>
            ) : modules.length === 0 ? (
              <EmptyState
                title="Nenhum módulo"
                description="Agrupe os vídeos desta técnica em módulos."
                action={
                  <Button
                    size="sm"
                    onClick={() => setModuleDialog({ open: true })}
                    disabled={selectedTechnique.status === "archived"}
                  >
                    Criar módulo
                  </Button>
                }
              />
            ) : (
              modules.map((moduleRecord) => {
                const active = moduleRecord.id === selectedModuleId;
                return (
                  <div
                    key={moduleRecord.id}
                    className={`rounded-lg border p-3 transition-colors ${
                      active ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/40"
                    }`}
                  >
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-2 text-left"
                      onClick={() => setSelectedModuleId(moduleRecord.id)}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{moduleRecord.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {moduleRecord.video_count} vídeo(s)
                        </p>
                      </div>
                      <ChevronRight className={`h-4 w-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                    </button>
                    <div className="mt-2 flex items-center justify-between gap-1">
                      <ActiveStatusBadge status={moduleRecord.status} />
                      <div className="flex gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setModuleDialog({ open: true, module: moduleRecord })}
                          aria-label="Editar módulo"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {moduleRecord.status === "active" ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                              void action(
                                `/api/library/modules/${moduleRecord.id}/archive`,
                                "POST",
                                "Módulo arquivado",
                              )
                            }
                            aria-label="Arquivar módulo"
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <VideoIcon className="h-4 w-4" />
              Vídeos
            </CardTitle>
            {selectedModule ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setVideoDialog({ open: true, moduleId: selectedModule.id })}
                disabled={selectedModule.status === "archived"}
              >
                <Plus className="h-3.5 w-3.5" />
                Novo
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-2 p-3">
            {!selectedModule ? (
              <p className="p-3 text-sm text-muted-foreground">Selecione um módulo.</p>
            ) : videos.length === 0 ? (
              <EmptyState
                title="Nenhum vídeo"
                description="Adicione o primeiro vídeo a este módulo."
                icon={<VideoIcon className="h-5 w-5" />}
                action={
                  <Button
                    size="sm"
                    onClick={() => setVideoDialog({ open: true, moduleId: selectedModule.id })}
                  >
                    Adicionar vídeo
                  </Button>
                }
              />
            ) : (
              videos.map((video) => (
                <div key={video.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{video.title}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock3 className="h-3 w-3" />
                        {formatDuration(video.duration_seconds)}
                      </p>
                    </div>
                    <VideoStatusBadge status={video.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {video.status === "ready" ? (
                      <Button size="sm" variant="outline" onClick={() => void openPlayer(video)}>
                        <Play className="h-3.5 w-3.5" />
                        Assistir
                      </Button>
                    ) : null}
                    {video.status === "processing" || video.status === "uploading" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void action(
                            `/api/library/videos/${video.id}/status`,
                            "POST",
                            "Vídeo marcado como pronto",
                          )
                        }
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Marcar pronto
                      </Button>
                    ) : null}
                    {video.status === "error" ? (
                      <Badge variant="danger">
                        <CircleAlert className="h-3 w-3" />
                        Falha no processamento
                      </Badge>
                    ) : null}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setVideoDialog({ open: true, video })}
                      aria-label="Editar vídeo"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {video.status !== "archived" ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          void action(
                            `/api/library/videos/${video.id}/archive`,
                            "POST",
                            "Vídeo arquivado",
                          )
                        }
                        aria-label="Arquivar vídeo"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        void action(
                          `/api/library/videos/${video.id}`,
                          "DELETE",
                          "Vídeo removido",
                        )
                      }
                      aria-label="Excluir vídeo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <TechniqueDialog
        state={techniqueDialog}
        onOpenChange={(open) => setTechniqueDialog({ open, technique: open ? techniqueDialog.technique : undefined })}
        onSaved={(technique) => {
          setTechniqueDialog({ open: false });
          if (technique) selectTechnique(technique.id);
          router.refresh();
        }}
      />

      {selectedTechnique ? (
        <ModuleDialog
          state={moduleDialog}
          techniqueId={selectedTechnique.id}
          techniques={tree.techniques}
          onOpenChange={(open) => setModuleDialog({ open, module: open ? moduleDialog.module : undefined })}
          onSaved={(moduleRecord) => {
            setModuleDialog({ open: false });
            if (moduleRecord) {
              setSelectedTechniqueId(moduleRecord.technique_id);
              setSelectedModuleId(moduleRecord.id);
            }
            router.refresh();
          }}
        />
      ) : null}

      <VideoDialog
        state={videoDialog}
        onOpenChange={(open) => setVideoDialog({ open, video: open ? videoDialog.video : undefined, moduleId: videoDialog.moduleId })}
        onSaved={(video) => {
          setVideoDialog({ open: false });
          if (video) {
            setSelectedTechniqueId(video.technique_id);
            setSelectedModuleId(video.module_id);
          }
          router.refresh();
        }}
      />

      <VideoUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        destination="library"
        modules={moduleOptions}
        defaultModuleId={selectedModule?.id}
        onUploaded={() => {
          setUploadOpen(false);
          router.refresh();
        }}
      />

      <Dialog
        open={Boolean(player)}
        onOpenChange={(open) => !open && setPlayer(null)}
        title={player?.title ?? "Reprodução"}
        size="xl"
      >
        {player ? (
          <div className="space-y-3">
            {player.provider === "google_drive" ? (
              <iframe
                key={player.url}
                src={player.url}
                title={player.title}
                className="aspect-video w-full rounded-lg border bg-black"
                allow="autoplay; fullscreen; encrypted-media"
                allowFullScreen
                referrerPolicy="no-referrer"
              />
            ) : (
              <video
                key={player.url}
                controls
                autoPlay
                className="w-full rounded-lg bg-black"
                src={player.url}
              >
                Seu navegador não suporta a reprodução de vídeo.
              </video>
            )}
            <p className="text-xs text-muted-foreground">
              Reprodução protegida por URL temporária gerada sob demanda.
            </p>
            {player.provider === "google_drive" ? (
              <VideoAccess videoId={player.id} canShare />
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

function TechniqueDialog({
  state,
  onOpenChange,
  onSaved,
}: {
  state: TechniqueDialogState;
  onOpenChange: (open: boolean) => void;
  onSaved: (technique?: Technique) => void;
}) {
  const [name, setName] = React.useState(state.technique?.name ?? "");
  const [description, setDescription] = React.useState(state.technique?.description ?? "");
  const [category, setCategory] = React.useState(state.technique?.category ?? "");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    setName(state.technique?.name ?? "");
    setDescription(state.technique?.description ?? "");
    setCategory(state.technique?.category ?? "");
    setError(null);
  }, [state.technique, state.open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      const result = state.technique
        ? await apiFetch<Technique>(`/api/library/techniques/${state.technique.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              description: description.trim() || null,
              category: category.trim() || null,
            }),
          })
        : await apiFetch<Technique>("/api/library/techniques", {
            ...jsonBody({
              name,
              description: description.trim() || null,
              category: category.trim() || null,
            }),
          });
      toast.success(state.technique ? "Técnica atualizada" : "Técnica criada");
      onSaved(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar");
      setFieldErrors(fieldErrorsFrom(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={state.open}
      onOpenChange={onOpenChange}
      title={state.technique ? "Editar técnica" : "Nova técnica"}
      description="A técnica é o nível mais alto da biblioteca."
      size="md"
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        <Field label="Nome" htmlFor="technique-name" error={fieldErrors.name} required>
          <Input
            id="technique-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Passagem de guarda"
            required
          />
        </Field>
        <Field label="Categoria" htmlFor="technique-category" error={fieldErrors.category}>
          <Input
            id="technique-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Passagem, guarda, finalização…"
          />
        </Field>
        <Field label="Descrição" htmlFor="technique-description" error={fieldErrors.description}>
          <Textarea
            id="technique-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Conceitos e objetivos desta técnica…"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" loading={loading}>
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ModuleDialog({
  state,
  techniqueId,
  techniques,
  onOpenChange,
  onSaved,
}: {
  state: ModuleDialogState;
  techniqueId: string;
  techniques: Technique[];
  onOpenChange: (open: boolean) => void;
  onSaved: (module?: Module) => void;
}) {
  const [name, setName] = React.useState(state.module?.name ?? "");
  const [description, setDescription] = React.useState(state.module?.description ?? "");
  const [targetTechnique, setTargetTechnique] = React.useState(state.module?.technique_id ?? techniqueId);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    setName(state.module?.name ?? "");
    setDescription(state.module?.description ?? "");
    setTargetTechnique(state.module?.technique_id ?? techniqueId);
    setError(null);
  }, [state.module, state.open, techniqueId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      let result: Module;
      if (state.module) {
        result = await apiFetch<Module>(`/api/library/modules/${state.module.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description: description.trim() || null }),
        });
        if (targetTechnique !== state.module.technique_id) {
          result = await apiFetch<Module>(`/api/library/modules/${state.module.id}/move`, {
            ...jsonBody({ technique_id: targetTechnique }),
          });
        }
      } else {
        result = await apiFetch<Module>("/api/library/modules", {
          ...jsonBody({
            technique_id: targetTechnique,
            name,
            description: description.trim() || null,
          }),
        });
      }
      toast.success(state.module ? "Módulo atualizado" : "Módulo criado");
      onSaved(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar");
      setFieldErrors(fieldErrorsFrom(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={state.open}
      onOpenChange={onOpenChange}
      title={state.module ? "Editar módulo" : "Novo módulo"}
      size="md"
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        <Field label="Nome" htmlFor="module-name" error={fieldErrors.name} required>
          <Input
            id="module-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Fundamentos"
            required
          />
        </Field>
        <Field label="Técnica" htmlFor="module-technique">
          <Select
            id="module-technique"
            value={targetTechnique}
            onChange={(event) => setTargetTechnique(event.target.value)}
          >
            {techniques
              .filter((technique) => technique.status === "active")
              .map((technique) => (
                <option key={technique.id} value={technique.id}>
                  {technique.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Descrição" htmlFor="module-description" error={fieldErrors.description}>
          <Textarea
            id="module-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" loading={loading}>
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function VideoDialog({
  state,
  onOpenChange,
  onSaved,
}: {
  state: VideoDialogState;
  onOpenChange: (open: boolean) => void;
  onSaved: (video?: Video) => void;
}) {
  const [title, setTitle] = React.useState(state.video?.title ?? "");
  const [description, setDescription] = React.useState(state.video?.description ?? "");
  const [duration, setDuration] = React.useState(
    state.video?.duration_seconds ? String(Math.round(state.video.duration_seconds / 60)) : "",
  );
  const [status, setStatus] = React.useState<VideoStatus>("ready");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    setTitle(state.video?.title ?? "");
    setDescription(state.video?.description ?? "");
    setDuration(state.video?.duration_seconds ? String(Math.round(state.video.duration_seconds / 60)) : "");
    setStatus("ready");
    setError(null);
  }, [state.video, state.open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});
    const durationSeconds = duration.trim() ? Math.max(0, Number(duration) * 60) : null;
    try {
      const result = state.video
        ? await apiFetch<Video>(`/api/library/videos/${state.video.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title,
              description: description.trim() || null,
              duration_seconds: durationSeconds,
            }),
          })
        : await apiFetch<Video>("/api/library/videos", {
            ...jsonBody({
              module_id: state.moduleId,
              title,
              description: description.trim() || null,
              duration_seconds: durationSeconds,
              status,
            }),
          });
      toast.success(state.video ? "Vídeo atualizado" : "Vídeo adicionado à biblioteca");
      onSaved(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar");
      setFieldErrors(fieldErrorsFrom(caught));
    } finally {
      setLoading(false);
    }
  }

  if (!state.moduleId && !state.video) return null;

  return (
    <Dialog
      open={state.open}
      onOpenChange={onOpenChange}
      title={state.video ? "Editar vídeo" : "Novo vídeo"}
      description="O arquivo fica no provedor de mídia; aqui guardamos apenas os metadados."
      size="md"
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        {!state.video ? (
          <Alert>
            No ambiente de demonstração, o vídeo é cadastrado com uma mídia de exemplo. Em
            produção, o upload seria feito diretamente na Mux.
          </Alert>
        ) : null}
        <Field label="Título" htmlFor="video-title" error={fieldErrors.title} required>
          <Input
            id="video-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Passagem de guarda — execução completa"
            required
          />
        </Field>
        <Field label="Descrição" htmlFor="video-description" error={fieldErrors.description}>
          <Textarea
            id="video-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Duração (min)" htmlFor="video-duration" error={fieldErrors.duration_seconds}>
            <Input
              id="video-duration"
              type="number"
              min="0"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              placeholder="8"
            />
          </Field>
          {!state.video ? (
            <Field label="Status inicial" htmlFor="video-status">
              <Select
                id="video-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as VideoStatus)}
              >
                <option value="ready">Disponível</option>
                <option value="processing">Processando</option>
                <option value="uploading">Enviando</option>
              </Select>
            </Field>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" loading={loading}>
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
