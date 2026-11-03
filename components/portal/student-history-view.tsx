"use client";

import * as React from "react";
import { CheckCircle2, History, Video as VideoIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader, EmptyState } from "@/components/common/layout-pieces";
import { LessonStatusBadge } from "@/components/common/status-badge";
import { StudentLessonDialog } from "./student-lesson-dialog";
import { apiFetch } from "@/lib/api/client";
import { formatDate } from "@/lib/utils/date";
import type { StudentLessonDetail, StudentTeacher } from "@/types/lesson";

interface HistoryResult {
  lessons: StudentLessonDetail[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

export function StudentHistoryView({
  initial,
  teachers,
}: {
  initial: HistoryResult;
  teachers: StudentTeacher[];
}) {
  const [result, setResult] = React.useState(initial);
  const [teacherId, setTeacherId] = React.useState("");
  const [fromDate, setFromDate] = React.useState("");
  const [toDate, setToDate] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [lessonId, setLessonId] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (teacherId) query.set("enrollment_id", teacherId);
      if (fromDate) query.set("from_date", fromDate);
      if (toDate) query.set("to_date", toDate);
      query.set("page", String(page));
      query.set("pageSize", "20");
      const data = await apiFetch<HistoryResult>(`/api/student/lessons/history?${query}`);
      setResult(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar histórico");
    } finally {
      setLoading(false);
    }
  }, [fromDate, page, teacherId, toDate]);

  React.useEffect(() => {
    const timeout = setTimeout(() => void load(), 200);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId, fromDate, toDate, page]);

  return (
    <div>
      <PageHeader
        title="Meu histórico"
        description={`${result.pagination.total} aula(s) realizada(s) registrada(s).`}
      />

      <div className="surface mb-4 flex flex-col gap-3 p-4 lg:flex-row lg:items-end">
        <div className="w-full lg:max-w-xs">
          <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="history-teacher">
            Professor
          </label>
          <Select
            id="history-teacher"
            value={teacherId}
            onChange={(event) => {
              setTeacherId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos os professores</option>
            {teachers.map((teacher) => (
              <option key={teacher.enrollment_id} value={teacher.enrollment_id}>
                {teacher.display_name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="history-from">
              De
            </label>
            <Input
              id="history-from"
              type="date"
              value={fromDate}
              onChange={(event) => {
                setFromDate(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="history-to">
              Até
            </label>
            <Input
              id="history-to"
              type="date"
              value={toDate}
              onChange={(event) => {
                setToDate(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setTeacherId("");
            setFromDate("");
            setToDate("");
            setPage(1);
          }}
        >
          Limpar filtros
        </Button>
      </div>

      {loading ? (
        <div className="surface p-6 text-sm text-muted-foreground">Carregando histórico…</div>
      ) : result.lessons.length === 0 ? (
        <EmptyState
          title="Nenhuma aula realizada"
          description="Quando seu professor concluir uma aula, ela aparecerá aqui com as observações e os vídeos."
          icon={<History className="h-5 w-5" />}
        />
      ) : (
        <div className="space-y-3">
          {result.lessons.map((lesson) => (
            <Card key={lesson.id}>
              <CardContent className="p-4">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => {
                    setLessonId(lesson.id);
                    setOpen(true);
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">
                        {formatDate(lesson.completed_at ?? lesson.starts_at, "EEEE, dd 'de' MMMM 'de' yyyy")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {lesson.teacher_name} · {lesson.plan_day_title ?? "Aula livre"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {lesson.videos.length > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <VideoIcon className="h-3.5 w-3.5" />
                          {lesson.videos.length}
                        </span>
                      ) : null}
                      <LessonStatusBadge status={lesson.status} />
                    </div>
                  </div>
                  {lesson.shared_notes ? (
                    <p className="mt-2 line-clamp-2 rounded-lg bg-muted/40 p-2.5 text-sm text-muted-foreground">
                      {lesson.shared_notes}
                    </p>
                  ) : null}
                  <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Ver detalhes da aula
                  </p>
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {result.pagination.total > 0 ? (
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Página {result.pagination.page} de {Math.max(1, result.pagination.totalPages)}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!result.pagination.hasPrevious}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Anterior
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!result.pagination.hasNext}
              onClick={() => setPage((value) => value + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      ) : null}

      <StudentLessonDialog
        lessonId={lessonId}
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) setLessonId(null);
        }}
      />
    </div>
  );
}
