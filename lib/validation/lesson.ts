import { z } from "zod";
import { isIsoDateTime, isUuid, isValidTime, isValidWeekday } from "@/lib/utils/validation";

const isoDateTime = z
  .string({ required_error: "Informe a data e hora" })
  .refine(isIsoDateTime, "Data/hora inválida");

export const createLessonSchema = z
  .object({
    enrollment_id: z.string().refine(isUuid, "Aluno inválido"),
    plan_day_id: z.string().refine(isUuid, "Dia do plano inválido").nullable().optional(),
    starts_at: isoDateTime,
    ends_at: isoDateTime,
    shared_notes: z.string().trim().max(5000, "As observações devem ter no máximo 5000 caracteres").nullable().optional(),
    private_notes: z.string().trim().max(5000, "As notas privadas devem ter no máximo 5000 caracteres").nullable().optional(),
    override_conflict: z.boolean().optional(),
  })
  .refine((value) => new Date(value.ends_at) > new Date(value.starts_at), {
    message: "O horário final deve ser posterior ao inicial",
    path: ["ends_at"],
  })
  .refine(
    (value) =>
      new Date(value.ends_at).getTime() - new Date(value.starts_at).getTime() <= 8 * 60 * 60 * 1000,
    { message: "A aula não pode durar mais de 8 horas", path: ["ends_at"] },
  );

export const updateLessonSchema = z
  .object({
    starts_at: isoDateTime.optional(),
    ends_at: isoDateTime.optional(),
    plan_day_id: z.string().refine(isUuid, "Dia do plano inválido").nullable().optional(),
    shared_notes: z.string().trim().max(5000).nullable().optional(),
    private_notes: z.string().trim().max(5000).nullable().optional(),
    override_conflict: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Informe ao menos um campo para atualizar",
  });

export const lessonStatusSchema = z.object({
  status: z.enum(["completed", "cancelled", "no_show"]),
  shared_notes: z.string().trim().max(5000).nullable().optional(),
  private_notes: z.string().trim().max(5000).nullable().optional(),
  override_window: z.boolean().optional(),
});

export const lessonListSchema = z.object({
  enrollment_id: z.string().refine(isUuid, "Aluno inválido").optional(),
  status: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (!value) return [];
      const values = Array.isArray(value) ? value : value.split(",");
      return values.filter((item) =>
        ["scheduled", "completed", "cancelled", "no_show"].includes(item.trim()),
      );
    }),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const createWeeklySlotSchema = z
  .object({
    enrollment_id: z.string().refine(isUuid, "Aluno inválido"),
    weekday: z.coerce.number().int().refine(isValidWeekday, "Dia da semana inválido"),
    start_time: z.string().refine(isValidTime, "Horário inicial inválido"),
    end_time: z.string().refine(isValidTime, "Horário final inválido"),
    valid_from: z.string().optional(),
    valid_until: z.string().nullable().optional(),
  })
  .refine((value) => value.end_time > value.start_time, {
    message: "O horário final deve ser posterior ao inicial",
    path: ["end_time"],
  })
  .refine(
    (value) => !value.valid_from || !value.valid_until || value.valid_until >= value.valid_from,
    { message: "A validade final deve ser posterior à inicial", path: ["valid_until"] },
  );

export const updateWeeklySlotSchema = z
  .object({
    weekday: z.coerce.number().int().refine(isValidWeekday, "Dia da semana inválido").optional(),
    start_time: z.string().refine(isValidTime, "Horário inicial inválido").optional(),
    end_time: z.string().refine(isValidTime, "Horário final inválido").optional(),
    valid_from: z.string().optional(),
    valid_until: z.string().nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Informe ao menos um campo para atualizar",
  });

export const generateLessonsSchema = z
  .object({
    date_from: z.string(),
    date_to: z.string(),
    confirm: z.boolean().optional().default(false),
    enrollment_ids: z.array(z.string().refine(isUuid, "Aluno inválido")).optional(),
  })
  .refine((value) => value.date_to >= value.date_from, {
    message: "A data final deve ser posterior à inicial",
    path: ["date_to"],
  })
  .refine(
    (value) =>
      new Date(`${value.date_to}T23:59:59`).getTime() -
        new Date(`${value.date_from}T00:00:00`).getTime() <=
      90 * 24 * 60 * 60 * 1000,
    { message: "O período máximo é de 90 dias", path: ["date_to"] },
  );

export const copyVideosSchema = z.object({
  plan_day_id: z.string().refine(isUuid, "Dia do plano inválido").optional(),
});

export const lessonVideoSchema = z.object({
  video_id: z.string().refine(isUuid, "Vídeo inválido"),
  sort_order: z.coerce.number().int().min(0).optional(),
});

export const agendaQuerySchema = z.object({
  week_start: z.string().optional(),
  date: z.string().optional(),
});

export type CreateLessonInput = z.infer<typeof createLessonSchema>;
export type LessonStatusInput = z.infer<typeof lessonStatusSchema>;
