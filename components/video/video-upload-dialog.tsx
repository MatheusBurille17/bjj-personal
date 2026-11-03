"use client";

import * as React from "react";
import { UploadCloud, Video as VideoIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { VideoUploadProgress } from "./video-upload-progress";
import { VideoUploadError } from "./video-upload-error";
import { uploadVideoResumable, type UploadHandle } from "@/lib/api/videos";
import { ApiClientError } from "@/lib/api/client";

const MAX_BYTES = 5 * 1024 * 1024 * 1024;
const SUPPORTED = ["mp4", "mov", "webm", "avi", "mkv", "flv", "wmv"];
const ACCEPT = ".mp4,.mov,.webm,.avi,.mkv,.flv,.wmv,video/*";

export interface VideoModuleOption {
  id: string;
  name: string;
  technique_id: string;
  technique_name: string;
}

export interface VideoUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  destination: "library" | "personal";
  modules?: VideoModuleOption[];
  defaultModuleId?: string;
  driveConnected?: boolean;
  onUploaded?: (video: unknown) => void;
}

function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function VideoUploadDialog({
  open,
  onOpenChange,
  destination,
  modules = [],
  defaultModuleId,
  driveConnected = true,
  onUploaded,
}: VideoUploadDialogProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [moduleId, setModuleId] = React.useState(defaultModuleId ?? "");
  const [uploading, setUploading] = React.useState(false);
  const [progress, setProgress] = React.useState({
    loaded: 0,
    total: 0,
    percentage: 0,
  });
  const [startedAt, setStartedAt] = React.useState<number | undefined>();
  const [error, setError] = React.useState<{ message: string; code?: string } | null>(null);
  const handleRef = React.useRef<UploadHandle | null>(null);

  React.useEffect(() => {
    if (!open) {
      setFile(null);
      setTitle("");
      setDescription("");
      setModuleId(defaultModuleId ?? "");
      setUploading(false);
      setProgress({ loaded: 0, total: 0, percentage: 0 });
      setError(null);
      handleRef.current = null;
    }
  }, [open, defaultModuleId]);

  React.useEffect(() => {
    if (open) setModuleId(defaultModuleId ?? "");
  }, [defaultModuleId, open]);

  function chooseFile(candidate: File | null | undefined) {
    setError(null);
    if (!candidate) return;
    const extension = extensionOf(candidate.name);
    if (!SUPPORTED.includes(extension)) {
      setError({
        message: "Formato não suportado. Use mp4, mov, webm, avi, mkv, flv ou wmv.",
        code: "invalid_file",
      });
      return;
    }
    if (candidate.size <= 0) {
      setError({ message: "O arquivo está vazio.", code: "invalid_file" });
      return;
    }
    if (candidate.size > MAX_BYTES) {
      setError({
        message: "O arquivo excede o limite de 5GB.",
        code: "file_too_large",
      });
      return;
    }
    setFile(candidate);
    if (!title) {
      setTitle(candidate.name.replace(/\.[^.]+$/, ""));
    }
  }

  function startUpload() {
    setError(null);
    if (!file) {
      setError({ message: "Selecione um arquivo de vídeo.", code: "invalid_file" });
      return;
    }
    if (destination === "library" && !moduleId) {
      setError({ message: "Selecione o módulo de destino.", code: "invalid_file" });
      return;
    }

    setUploading(true);
    setStartedAt(Date.now());
    setProgress({ loaded: 0, total: file.size, percentage: 0 });
    const handle = uploadVideoResumable(
      {
        title: title.trim() || file.name,
        description: description.trim() || null,
        destination,
        moduleId: destination === "library" ? moduleId : null,
        file,
      },
      (next) => setProgress(next),
    );
    handleRef.current = handle;

    handle.promise
      .then((result) => {
        toast.success("Vídeo enviado para o Google Drive");
        onUploaded?.(result);
        onOpenChange(false);
      })
      .catch((caught) => {
        const code =
          caught instanceof ApiClientError
            ? String(
                (caught.details as { drive_error?: string } | undefined)
                  ?.drive_error ?? "",
              ) || undefined
            : undefined;
        setError({
          message: caught instanceof Error ? caught.message : "Falha no upload",
          code,
        });
      })
      .finally(() => {
        setUploading(false);
        handleRef.current = null;
      });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startUpload();
  }

  function cancelUpload() {
    handleRef.current?.abort();
    setUploading(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && uploading) cancelUpload();
        onOpenChange(next);
      }}
      title={destination === "personal" ? "Enviar vídeo pessoal" : "Enviar vídeo"}
      description="O arquivo é enviado diretamente para o Google Drive. A plataforma guarda apenas os metadados."
      size="lg"
    >
      {!driveConnected ? (
        <Alert variant="warning">
          Conecte sua conta do Google Drive antes de enviar vídeos.
        </Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error ? (
            <VideoUploadError
              message={error.message}
              code={error.code}
              onRetry={file && !uploading ? startUpload : undefined}
              onCancel={() => {
                setError(null);
                onOpenChange(false);
              }}
            />
          ) : null}

          <label
            htmlFor="video-upload-file"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              chooseFile(event.dataTransfer.files?.[0]);
            }}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/30 px-4 py-10 text-center transition-colors hover:bg-muted/50"
          >
            <UploadCloud className="h-7 w-7 text-muted-foreground" />
            <span className="text-sm font-medium">
              Arraste um vídeo ou clique para selecionar
            </span>
            <span className="text-xs text-muted-foreground">
              mp4, mov, webm, avi, mkv, flv, wmv · até 5GB
            </span>
            <input
              id="video-upload-file"
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(event) => chooseFile(event.target.files?.[0])}
              disabled={uploading}
            />
          </label>

          {file ? (
            <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
              <VideoIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatBytes(file.size)}
              </span>
            </div>
          ) : null}

          <Field label="Título" htmlFor="video-upload-title" required>
            <Input
              id="video-upload-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Passagem de guarda — execução completa"
              disabled={uploading}
              required
            />
          </Field>

          <Field label="Descrição" htmlFor="video-upload-description">
            <Textarea
              id="video-upload-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={uploading}
            />
          </Field>

          {destination === "library" ? (
            <Field label="Módulo" htmlFor="video-upload-module" required>
              <Select
                id="video-upload-module"
                value={moduleId}
                onChange={(event) => setModuleId(event.target.value)}
                disabled={uploading}
                required
              >
                <option value="">Selecione um módulo</option>
                {modules.map((module) => (
                  <option key={module.id} value={module.id}>
                    {module.technique_name} · {module.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {uploading ? (
            <VideoUploadProgress
              loaded={progress.loaded}
              total={progress.total || file?.size || 0}
              percentage={progress.percentage}
              startedAt={startedAt}
              onCancel={cancelUpload}
            />
          ) : (
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={uploading}
              >
                Cancelar
              </Button>
              <Button type="submit" loading={uploading} disabled={!file}>
                <UploadCloud className="h-4 w-4" />
                Enviar
              </Button>
            </div>
          )}
        </form>
      )}
    </Dialog>
  );
}
