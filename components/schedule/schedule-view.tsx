"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  Trash2,
  Video as VideoIcon,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/common/layout-pieces";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { LessonStatusBadge } from "@/components/common/status-badge";
import { LessonForm } from "./lesson-form";
import { LessonDetailDialog } from "./lesson-detail-dialog";
import { apiFetch, fieldErrorsFrom, jsonBody } from "@/lib/api/client";
import {
  addDays,
  dateKey,
  formatDate,
  formatDateTime,
  formatTime,
  startOfWeek,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
} from "@/lib/utils/date";
import type {
  GeneratedLessonSuggestion,
  LessonDetail,
  LessonListItem,
  PlanDayOption,
  VideoOption,
  WeeklySlotWithStudent,
} from "@/types/lesson";
import type { EnrollmentListItem } from "@/types/enrollment";

export function ScheduleView({
  initialAgenda,
  weeklySlots,
  enrollments,
  planDays,
  videos,
  initialNew = false,
  initialStudent,
  initialLessonId,
}: {
  initialAgenda: { week_start: string; lessons: LessonListItem[] };
  weeklySlots: WeeklySlotWithStudent[];
  enrollments: EnrollmentListItem[];
  planDays: PlanDayOption[];
  videos: VideoOption[];
  initialNew?: boolean;
  initialStudent?: string;
  initialLessonId?: string;
}) {
  const [weekStart, setWeekStart] = React.useState(initialAgenda.week_start);
  const [lessons, setLessons] = React.useState(initialAgenda.lessons);
  const [view, setView] = React.useState<"week" | "day">("week");
  const [selectedDate, setSelectedDate] = React.useState(dateKey(new Date()));
  const [loading, setLoading] = React.useState(false);
  const [newOpen, setNewOpen] = React.useState(initialNew);
  const [lessonId, setLessonId] = React.useState<string | null>(initialLessonId ?? null);
  const [lessonOpen, setLessonOpen] = React.useState(Boolean(initialLessonId));
  const [generateOpen, setGenerateOpen] = React.useState(false);
  const [slotDialog, setSlotDialog] = React.useState<{ open: boolean; slot?: WeeklySlotWithStudent }>({
    open: false,
  });
  const [deleteSlot, setDeleteSlot] = React.useState<WeeklySlotWithStudent | null>(null);
  const [actionLoading, setActionLoading] = React.useState(false);

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      if (view === "week") {
        const result = await apiFetch<{ week_start: string; lessons: LessonListItem[] }>(
          `/api/agenda/weekly?week_start=${weekStart}`,
        );
        setLessons(result.lessons);
      } else {
        const result = await apiFetch<{ date: string; lessons: LessonListItem[] }>(
          `/api/agenda/daily?date=${selectedDate}`,
        );
        setLessons(result.lessons);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar agenda");
    } finally {
      setLoading(false);
    }
  }, [selectedDate, view, weekStart]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const days = React.useMemo(() => {
    const monday = new Date(`${weekStart}T00:00:00`);
    return Array.from({ length: 7 }).map((_, index) => addDays(monday, index));
  }, [weekStart]);

  const grouped = React.useMemo(() => {
    const map: Record<string, LessonListItem[]> = {};
    for (const lesson of lessons) {
      const key = dateKey(new Date(lesson.starts_at));
      map[key] = [...(map[key] ?? []), lesson];
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    }
    return map;
  }, [lessons]);

  async function slotStatus(slot: WeeklySlotWithStudent, status: "pause" | "activate") {
    setActionLoading(true);
    try {
      await apiFetch(`/api/weekly-slots/${slot.id}/${status}`, { method: "POST" });
      toast.success(status === "pause" ? "Horário pausado" : "Horário reativado");
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar o horário");
    } finally {
      setActionLoading(false);
    }
  }

  async function removeSlot() {
    if (!deleteSlot) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/weekly-slots/${deleteSlot.id}`, { method: "DELETE" });
      toast.success("Horário removido");
      setDeleteSlot(null);
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover o horário");
    } finally {
      setActionLoading(false);
    }
  }

  function moveWeek(direction: -1 | 1) {
    setWeekStart(dateKey(addDays(new Date(`${weekStart}T00:00:00`), direction * 7)));
  }

  return (
    <div>
      <PageHeader
        title="Agenda"
        description="Aulas concretas, horários recorrentes e registro de presença em um só lugar."
        actions={
          <>
            <Button variant="outline" onClick={() => setGenerateOpen(true)}>
              <Wand2 className="h-4 w-4" />
              Gerar por recorrência
            </Button>
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" />
              Nova aula
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
          <Button
            size="sm"
            variant={view === "week" ? "default" : "ghost"}
            onClick={() => setView("week")}
          >
            Semana
          </Button>
          <Button
            size="sm"
            variant={view === "day" ? "default" : "ghost"}
            onClick={() => setView("day")}
          >
            Dia
          </Button>
        </div>

        {view === "week" ? (
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" onClick={() => moveWeek(-1)} aria-label="Semana anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[190px] text-center text-sm font-medium">
              {formatDate(days[0], "dd/MM")} — {formatDate(days[6], "dd/MM/yyyy")}
            </span>
            <Button size="icon" variant="outline" onClick={() => moveWeek(1)} aria-label="Próxima semana">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setWeekStart(dateKey(startOfWeek(new Date())))}>
              Hoje
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="w-auto"
              aria-label="Selecionar dia"
            />
            <Button size="sm" variant="ghost" onClick={() => setSelectedDate(dateKey(new Date()))}>
              Hoje
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid gap-2 md:grid-cols-7">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="h-48 w-full" />
          ))}
        </div>
      ) : view === "week" ? (
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[900px] grid-cols-7 gap-2">
            {days.map((day) => {
              const key = dateKey(day);
              const dayLessons = grouped[key] ?? [];
              const isToday = key === dateKey(new Date());
              return (
                <div
                  key={key}
                  className={`min-h-[260px] rounded-xl border bg-card ${isToday ? "border-primary/50 ring-1 ring-primary/20" : ""}`}
                >
                  <div className={`border-b p-2 text-center ${isToday ? "bg-primary/5" : ""}`}>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {WEEKDAY_SHORT[day.getDay()]}
                    </p>
                    <p className="text-sm font-semibold">{formatDate(day, "dd/MM")}</p>
                  </div>
                  <div className="space-y-1.5 p-1.5">
                    {dayLessons.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDate(key);
                          setNewOpen(true);
                        }}
                        className="flex h-20 w-full items-center justify-center rounded-lg border border-dashed text-[11px] text-muted-foreground hover:bg-muted/50"
                      >
                        + agendar
                      </button>
                    ) : (
                      dayLessons.map((lesson) => (
                        <button
                          key={lesson.id}
                          type="button"
                          onClick={() => {
                            setLessonId(lesson.id);
                            setLessonOpen(true);
                          }}
                          className={`w-full rounded-lg border p-2 text-left text-xs transition-colors hover:border-primary/40 ${
                            lesson.status === "completed"
                              ? "bg-emerald-50/70"
                              : lesson.status === "scheduled"
                                ? "bg-sky-50/60"
                                : "bg-muted/50"
                          }`}
                        >
                          <p className="font-semibold">
                            {formatTime(lesson.starts_at)}–{formatTime(lesson.ends_at)}
                          </p>
                          <p className="truncate font-medium">{lesson.student_name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {lesson.plan_day_title ?? "Sem tema"}
                          </p>
                          <div className="mt-1 flex items-center justify-between gap-1">
                            <LessonStatusBadge status={lesson.status} />
                            {lesson.video_count > 0 ? (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                <VideoIcon className="h-3 w-3" />
                                {lesson.video_count}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{formatDate(selectedDate, "EEEE, dd 'de' MMMM 'de' yyyy")}</CardTitle>
          </CardHeader>
          <CardContent>
            {lessons.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma aula neste dia.</p>
            ) : (
              <ul className="divide-y">
                {lessons.map((lesson) => (
                  <li key={lesson.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      className="text-left"
                      onClick={() => {
                        setLessonId(lesson.id);
                        setLessonOpen(true);
                      }}
                    >
                      <p className="text-sm font-medium">
                        {formatTime(lesson.starts_at)}–{formatTime(lesson.ends_at)} ·{" "}
                        {lesson.student_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {lesson.plan_day_title ?? "Sem tema definido"}
                      </p>
                    </button>
                    <div className="flex items-center gap-2">
                      <LessonStatusBadge status={lesson.status} />
                      <Button size="sm" variant="outline" onClick={() => { setLessonId(lesson.id); setLessonOpen(true); }}>
                        Abrir
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <div className="mt-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Repeat className="h-4 w-4" />
                Horários recorrentes
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Regras semanais usadas para gerar sugestões de aulas. Não são aulas concretas.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setSlotDialog({ open: true })}>
              <Plus className="h-3.5 w-3.5" />
              Novo horário
            </Button>
          </CardHeader>
          <CardContent>
            {weeklySlots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum horário recorrente cadastrado.
              </p>
            ) : (
              <ul className="divide-y">
                {weeklySlots.map((slot) => (
                  <li key={slot.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                        {WEEKDAY_SHORT[slot.weekday]}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {slot.student_name} · {WEEKDAY_LABELS[slot.weekday]}
                        </p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant={slot.status === "active" ? "success" : "muted"}>
                        {slot.status === "active" ? "Ativo" : "Pausado"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSlotDialog({ open: true, slot })}
                      >
                        Editar
                      </Button>
                      {slot.status === "active" ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => void slotStatus(slot, "pause")}
                          aria-label="Pausar horário"
                        >
                          <Pause className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => void slotStatus(slot, "activate")}
                          aria-label="Reativar horário"
                        >
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteSlot(slot)}
                        aria-label="Excluir horário"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={newOpen}
        onOpenChange={setNewOpen}
        title="Agendar aula"
        description="A aula é uma ocorrência concreta e aparecerá na sua agenda e no portal do aluno."
        size="lg"
      >
        <LessonForm
          enrollments={enrollments}
          planDays={planDays}
          defaultEnrollmentId={initialStudent}
          defaultDate={selectedDate}
          onCancel={() => setNewOpen(false)}
          onSaved={(lesson: LessonDetail) => {
            setNewOpen(false);
            setLessonId(lesson.id);
            setLessonOpen(true);
            void reload();
          }}
        />
      </Dialog>

      <LessonDetailDialog
        lessonId={lessonId}
        open={lessonOpen}
        onOpenChange={setLessonOpen}
        planDays={planDays}
        videos={videos}
        onChanged={() => void reload()}
      />

      <SlotDialog
        state={slotDialog}
        enrollments={enrollments}
        onOpenChange={(open) => setSlotDialog({ open, slot: open ? slotDialog.slot : undefined })}
        onSaved={() => {
          setSlotDialog({ open: false });
          window.location.reload();
        }}
      />

      <GenerateDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onGenerated={() => {
          setGenerateOpen(false);
          void reload();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteSlot)}
        onOpenChange={(open) => !open && setDeleteSlot(null)}
        title="Excluir horário recorrente?"
        description="Só é possível excluir horários que ainda não geraram aulas. Caso contrário, pause o horário."
        confirmLabel="Excluir"
        destructive
        loading={actionLoading}
        onConfirm={removeSlot}
      />
    </div>
  );
}

function SlotDialog({
  state,
  enrollments,
  onOpenChange,
  onSaved,
}: {
  state: { open: boolean; slot?: WeeklySlotWithStudent };
  enrollments: EnrollmentListItem[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [enrollmentId, setEnrollmentId] = React.useState(state.slot?.enrollment_id ?? "");
  const [weekday, setWeekday] = React.useState(state.slot?.weekday ?? 1);
  const [startTime, setStartTime] = React.useState(state.slot?.start_time.slice(0, 5) ?? "18:00");
  const [endTime, setEndTime] = React.useState(state.slot?.end_time.slice(0, 5) ?? "19:00");
  const [validFrom, setValidFrom] = React.useState(state.slot?.valid_from ?? dateKey(new Date()));
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    setEnrollmentId(state.slot?.enrollment_id ?? "");
    setWeekday(state.slot?.weekday ?? 1);
    setStartTime(state.slot?.start_time.slice(0, 5) ?? "18:00");
    setEndTime(state.slot?.end_time.slice(0, 5) ?? "19:00");
    setValidFrom(state.slot?.valid_from ?? dateKey(new Date()));
    setError(null);
  }, [state.open, state.slot]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      if (state.slot) {
        await apiFetch(`/api/weekly-slots/${state.slot.id}`, {
          method: "PATCH",
          ...jsonBody({
            weekday,
            start_time: `${startTime}:00`,
            end_time: `${endTime}:00`,
            valid_from: validFrom,
          }),
        });
      } else {
        await apiFetch("/api/weekly-slots", {
          ...jsonBody({
            enrollment_id: enrollmentId,
            weekday,
            start_time: `${startTime}:00`,
            end_time: `${endTime}:00`,
            valid_from: validFrom,
          }),
        });
      }
      toast.success(state.slot ? "Horário atualizado" : "Horário recorrente criado");
      onSaved();
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
      title={state.slot ? "Editar horário recorrente" : "Novo horário recorrente"}
      size="md"
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        {!state.slot ? (
          <Field label="Aluno" htmlFor="slot-enrollment" error={fieldErrors.enrollment_id} required>
            <Select
              id="slot-enrollment"
              value={enrollmentId}
              onChange={(event) => setEnrollmentId(event.target.value)}
              required
            >
              <option value="">Selecione o aluno…</option>
              {enrollments
                .filter((item) => item.status === "active" || item.status === "paused")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.student_name}
                  </option>
                ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Dia da semana" htmlFor="slot-weekday" required>
          <Select
            id="slot-weekday"
            value={weekday}
            onChange={(event) => setWeekday(Number(event.target.value))}
          >
            {WEEKDAY_LABELS.map((label, index) => (
              <option key={label} value={index}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Início" htmlFor="slot-start" error={fieldErrors.start_time} required>
            <Input
              id="slot-start"
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              required
            />
          </Field>
          <Field label="Fim" htmlFor="slot-end" error={fieldErrors.end_time} required>
            <Input
              id="slot-end"
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              required
            />
          </Field>
        </div>
        <Field label="Válido a partir de" htmlFor="slot-from" error={fieldErrors.valid_from}>
          <Input
            id="slot-from"
            type="date"
            value={validFrom}
            onChange={(event) => setValidFrom(event.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" loading={loading} disabled={!state.slot && !enrollmentId}>
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function GenerateDialog({
  open,
  onOpenChange,
  onGenerated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: () => void;
}) {
  const [dateFrom, setDateFrom] = React.useState(dateKey(new Date()));
  const [dateTo, setDateTo] = React.useState(dateKey(addDays(new Date(), 30)));
  const [suggestions, setSuggestions] = React.useState<GeneratedLessonSuggestion[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setSuggestions(null);
      setError(null);
    }
  }, [open]);

  async function preview(confirm: boolean) {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<{
        suggestions: GeneratedLessonSuggestion[];
        created: LessonListItem[];
      }>("/api/lessons/generate-from-slots", {
        ...jsonBody({
          date_from: dateFrom,
          date_to: dateTo,
          confirm,
        }),
      });
      setSuggestions(result.suggestions);
      if (confirm) {
        toast.success(`${result.created.length} aula(s) criada(s)`);
        onGenerated();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível gerar as aulas");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Gerar aulas por recorrência"
      description="As aulas são sugeridas a partir dos horários ativos. Você revisa antes de confirmar."
      size="lg"
    >
      <div className="space-y-4">
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="De" htmlFor="gen-from" required>
            <Input
              id="gen-from"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </Field>
          <Field label="Até" htmlFor="gen-to" required>
            <Input
              id="gen-to"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void preview(false)} loading={loading}>
            <RefreshCw className="h-4 w-4" />
            Gerar prévia
          </Button>
          {suggestions && suggestions.length > 0 ? (
            <Button onClick={() => void preview(true)} loading={loading}>
              Confirmar {suggestions.length} aula(s)
            </Button>
          ) : null}
        </div>

        {suggestions ? (
          suggestions.length === 0 ? (
            <Alert>Nenhuma aula nova encontrada para o período. Verifique os horários ativos.</Alert>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {suggestions.map((suggestion) => (
                <div
                  key={`${suggestion.weekly_slot_id}-${suggestion.starts_at}`}
                  className="rounded-lg border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{suggestion.student_name}</p>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(suggestion.starts_at)}
                    </span>
                  </div>
                  {suggestion.conflicts.length > 0 ? (
                    <Badge variant="warning" className="mt-2">
                      {suggestion.conflicts.length} conflito(s) de horário
                    </Badge>
                  ) : (
                    <Badge variant="success" className="mt-2">
                      Horário livre
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>
    </Dialog>
  );
}
