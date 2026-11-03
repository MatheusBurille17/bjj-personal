import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export function toDate(value: string | Date): Date {
  return typeof value === "string" ? parseISO(value) : value;
}

export function formatDate(value: string | Date, pattern = "dd/MM/yyyy"): string {
  return format(toDate(value), pattern, { locale: ptBR });
}

export function formatDateTime(value: string | Date): string {
  return format(toDate(value), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export function formatTime(value: string | Date): string {
  return format(toDate(value), "HH:mm", { locale: ptBR });
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/** Início do dia local em ISO (UTC). */
export function startOfDayIso(date: Date): string {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  return copy.toISOString();
}

/** Fim do dia local em ISO (UTC). */
export function endOfDayIso(date: Date): string {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  return copy.toISOString();
}

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function addDays(date: Date, amount: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

/** Segunda-feira da semana da data informada (semana começa na segunda). */
export function startOfWeek(date: Date): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(copy, diff);
}

export const WEEKDAY_LABELS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;

export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export function relativeExpiration(expiresAt: string | null): string {
  if (!expiresAt) return "—";
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expirado";
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days} dia${days > 1 ? "s" : ""} restante${days > 1 ? "s" : ""}`;
  const hours = Math.max(1, Math.floor(diff / (60 * 60 * 1000)));
  return `${hours} hora${hours > 1 ? "s" : ""} restante${hours > 1 ? "s" : ""}`;
}
