"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/feedback";

export interface VideoUploadProgressProps {
  loaded: number;
  total: number;
  percentage: number;
  startedAt?: number;
  onCancel?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function VideoUploadProgress({
  loaded,
  total,
  percentage,
  startedAt,
  onCancel,
}: VideoUploadProgressProps) {
  const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0;
  const speed = elapsed > 0 ? loaded / elapsed : 0;
  const remaining = speed > 0 ? Math.max(0, (total - loaded) / speed) : null;

  return (
    <div className="space-y-2">
      <Progress value={percentage} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {percentage}% · {formatBytes(loaded)} de {formatBytes(total)}
        </span>
        <span>
          {remaining !== null
            ? `~${Math.ceil(remaining)}s restantes`
            : "Calculando tempo restante…"}
        </span>
      </div>
      {onCancel ? (
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
          Cancelar upload
        </Button>
      ) : null}
    </div>
  );
}
