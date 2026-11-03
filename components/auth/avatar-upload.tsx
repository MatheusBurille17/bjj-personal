"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, Alert } from "@/components/ui/feedback";
import { apiFetch, jsonBody } from "@/lib/api/client";
import { MAX_AVATAR_BYTES, isValidImageType } from "@/lib/utils/validation";

export function AvatarUpload({
  name,
  currentUrl,
}: {
  name: string;
  currentUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);

  async function upload(file: File) {
    setError(null);
    if (!isValidImageType(file.type)) {
      setError("Formato inválido. Envie uma imagem JPEG, PNG ou WebP.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError("A imagem deve ter no máximo 5MB.");
      return;
    }

    setPreview(URL.createObjectURL(file));
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await apiFetch<{ avatar_url: string }>("/api/storage/avatar/upload", {
        method: "POST",
        body: formData,
      });
      setPreview(result.avatar_url);
      toast.success("Foto de perfil atualizada");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível enviar a imagem.");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }

  async function remove() {
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/api/profiles/me", {
        method: "PATCH",
        ...jsonBody({ avatar_url: null }),
      });
      setPreview(null);
      toast.success("Foto removida");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível remover a foto.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) void upload(file);
        }}
        className={`flex items-center gap-4 rounded-xl border border-dashed p-4 ${
          dragging ? "border-primary bg-primary/5" : "bg-muted/30"
        }`}
      >
        <Avatar src={preview ?? currentUrl} name={name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Foto de perfil</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            JPEG, PNG ou WebP · até 5MB. Arraste a imagem ou selecione um arquivo.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              loading={loading}
            >
              <Upload className="h-3.5 w-3.5" />
              Enviar imagem
            </Button>
            {currentUrl || preview ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => void remove()}>
                <Trash2 className="h-3.5 w-3.5" />
                Remover
              </Button>
            ) : null}
          </div>
        </div>
        <Camera className="hidden h-5 w-5 text-muted-foreground sm:block" />
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
