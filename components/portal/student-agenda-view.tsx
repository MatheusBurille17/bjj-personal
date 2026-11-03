"use client";

import * as React from "react";
import { CalendarDays, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader, EmptyState } from "@/components/common/layout-pieces";
import { LessonStatusBadge } from "@/components/common/status-badge";
import { StudentLessonDialog } from "./student-lesson-dialog";
import { apiFetch } from "@/lib/api/client";
import { formatDate, formatTime } from "@/lib/utils/date";
import type { StudentLessonItem, StudentTeacher } from "@/types/lesson";

export function StudentAgendaView({
  initialLessons,
  teachers,
}: {
  initialLessons: StudentLessonItem[];
  teachers: StudentTeacher[];
}) {
  const [lessons, setLessons] = React.useState(initialLessons);
  const [loading, setLoading] = React.useState(false);
  const [teacherId, setTeacherId] = React.useState("");
  const [fromDate, setFromDate] = React.useState("");
  const [toDate, setToDate] = React.useState("");
  const [lessonId, setLessonId] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (teacherId) query.set("enrollment_id", teacherId);
      if (fromDate) query.set("from_date", fromDate);
      if (toDate) query.set("to_date", toDate);
      const result = await apiFetch<StudentLessonItem[]>(`/api/student/agenda?${query}`);
      setLessons(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar agenda");
    } finally {
      setLoading(false);
    }
  }, [fromDate, teacherId, toDate]);

  React.useEffect(() => {
    const timeout = setTimeout(() => void load(), 200);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId, fromDate, toDate]);

  const grouped = React.useMemo(() => {
    const map: Record<string, StudentLessonItem[]> = {};
    for (const lesson of lessons) {
      const key = lesson.starts_at.slice(0, 10);
      map[key] = [...(map[key] ?? []), lesson];
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    }
    return map;
  }, [lessons]);

  return (
    <div>
      <PageHeader
        title="Minha agenda"
        description="Aulas futuras e passadas de todos os seus professores."
      />

      <div className="surface mb-4 flex flex-col gap-3 p-4 lg:flex-row lg:items-end">
        <div className="w-full lg:max-w-xs">
          <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="teacher-filter">
            Professor
          </label>
          <Select id="teacher-filter" value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>
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
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="from-date">
              De
            </label>
            <Input
              id="from-date"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="to-date">
              Até
            </label>
            <Input
              id="to-date"
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </div>
        </div>
        <Button variant="outline" onClick={() => { setTeacherId(""); setFromDate(""); setToDate(""); }}>
          Limpar filtros
        </Button>
      </div>

      {loading ? (
        <div className="surface p-6 text-sm text-muted-foreground">Carregando…</div>
      ) : lessons.length === 0 ? (
        <EmptyState
          title="Nenhuma aula encontrada"
          description="Ajuste os filtros ou aguarde seu professor agendar novas aulas."
          icon={<CalendarDays className="h-5 w-5" />}
        />
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([date, dayLessons]) => (
            <div key={date}>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                {formatDate(date, "EEEE, dd 'de' MMMM")}
              </h2>
              <Card>
                <CardContent className="divide-y p-0">
                  {dayLessons.map((lesson) => (
                    <button
                      key={lesson.id}
                      type="button"
                      onClick={() => {
                        setLessonId(lesson.id);
                        setOpen(true);
                      }}
                      className="flex w-full flex-col gap-2 p-4 text-left transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex w-14 flex-col text-center">
                          <span className="text-sm font-semibold">{formatTime(lesson.starts_at)}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatTime(lesson.ends_at)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{lesson.teacher_name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {lesson.plan_day_title ?? "Tema a definir"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {lesson.video_count > 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {lesson.video_count} vídeo(s)
                          </span>
                        ) : null}
                        <LessonStatusBadge status={lesson.status} />
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 flex items-center gap-1 text-xs text-muted-foreground">
        <Search className="h-3.5 w-3.5" />
        Aulas canceladas e faltas não são exibidas no portal.
      </p>

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
