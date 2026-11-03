import { Badge } from "@/components/ui/badge";
import type { EnrollmentStatus } from "@/types/enrollment";
import type { LessonStatus } from "@/types/lesson";
import type { PlanStatus } from "@/types/plan";
import type { VideoStatus } from "@/types/library";

const enrollmentMap: Record<EnrollmentStatus, { label: string; variant: "warning" | "success" | "muted" | "danger" }> = {
  pending: { label: "Convite pendente", variant: "warning" },
  active: { label: "Ativo", variant: "success" },
  paused: { label: "Pausado", variant: "muted" },
  archived: { label: "Arquivado", variant: "danger" },
};

const lessonMap: Record<LessonStatus, { label: string; variant: "info" | "success" | "muted" | "danger" }> = {
  scheduled: { label: "Agendada", variant: "info" },
  completed: { label: "Realizada", variant: "success" },
  cancelled: { label: "Cancelada", variant: "muted" },
  no_show: { label: "Falta", variant: "danger" },
};

const planMap: Record<PlanStatus, { label: string; variant: "muted" | "success" | "danger" }> = {
  draft: { label: "Rascunho", variant: "muted" },
  published: { label: "Publicado", variant: "success" },
  archived: { label: "Arquivado", variant: "danger" },
};

const videoMap: Record<VideoStatus, { label: string; variant: "muted" | "warning" | "success" | "danger" }> = {
  uploading: { label: "Enviando", variant: "muted" },
  processing: { label: "Processando", variant: "warning" },
  ready: { label: "Disponível", variant: "success" },
  error: { label: "Erro no processamento", variant: "danger" },
  archived: { label: "Arquivado", variant: "danger" },
};

export function EnrollmentStatusBadge({ status }: { status: EnrollmentStatus }) {
  const item = enrollmentMap[status];
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

export function LessonStatusBadge({ status }: { status: LessonStatus }) {
  const item = lessonMap[status];
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

export function PlanStatusBadge({ status }: { status: PlanStatus }) {
  const item = planMap[status];
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

export function VideoStatusBadge({ status }: { status: VideoStatus }) {
  const item = videoMap[status];
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

export function ActiveStatusBadge({ status }: { status: "active" | "archived" }) {
  return status === "active" ? (
    <Badge variant="success">Ativa</Badge>
  ) : (
    <Badge variant="danger">Arquivada</Badge>
  );
}
