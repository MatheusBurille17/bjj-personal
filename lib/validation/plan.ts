import { z } from "zod";
import { isIsoDate, isUuid, isValidWeekday } from "@/lib/utils/validation";

const isoDate = z
  .string({ required_error: "Informe a data" })
  .refine(isIsoDate, "Data inválida (use AAAA-MM-DD)");

export const createPlanSchema = z
  .object({
    title: z
      .string({ required_error: "Informe o título do plano" })
      .trim()
      .min(3, "O título deve ter pelo menos 3 caracteres")
      .max(200, "O título deve ter no máximo 200 caracteres"),
    description: z.string().trim().max(2000, "A descrição deve ter no máximo 2000 caracteres").nullable().optional(),
    objective: z.string().trim().max(1000, "O objetivo deve ter no máximo 1000 caracteres").nullable().optional(),
    period_start: isoDate,
    period_end: isoDate,
  })
  .refine((value) => value.period_end >= value.period_start, {
    message: "A data final deve ser igual ou posterior à inicial",
    path: ["period_end"],
  });

export const updatePlanSchema = z
  .object({
    title: z.string().trim().min(3, "O título deve ter pelo menos 3 caracteres").max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    objective: z.string().trim().max(1000).nullable().optional(),
    period_start: isoDate.optional(),
    period_end: isoDate.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Informe ao menos um campo para atualizar",
  })
  .refine(
    (value) =>
      !value.period_start || !value.period_end || value.period_end >= value.period_start,
    { message: "A data final deve ser igual ou posterior à inicial", path: ["period_end"] },
  );

export const planListSchema = z.object({
  search: z.string().trim().max(200).optional().default(""),
  status: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (!value) return [];
      const values = Array.isArray(value) ? value : value.split(",");
      return values.filter((item) =>
        ["draft", "published", "archived"].includes(item.trim()),
      );
    }),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const planDayBase = {
  weekday: z
    .coerce.number()
    .int()
    .refine(isValidWeekday, "Dia da semana deve estar entre 0 e 6")
    .nullable()
    .optional(),
  planned_date: isoDate.nullable().optional(),
  title: z
    .string({ required_error: "Informe o título do dia" })
    .trim()
    .min(2, "O título deve ter pelo menos 2 caracteres")
    .max(200, "O título deve ter no máximo 200 caracteres"),
  objective: z.string().trim().max(1000, "O objetivo deve ter no máximo 1000 caracteres").nullable().optional(),
  notes: z.string().trim().max(2000, "As observações devem ter no máximo 2000 caracteres").nullable().optional(),
  sort_order: z.coerce.number().int().min(0).optional(),
};

export const createPlanDaySchema = z
  .object(planDayBase)
  .refine((value) => value.weekday !== undefined && value.weekday !== null ? true : Boolean(value.planned_date), {
    message: "Informe o dia da semana ou uma data específica",
    path: ["weekday"],
  });

export const updatePlanDaySchema = z
  .object({
    weekday: planDayBase.weekday,
    planned_date: planDayBase.planned_date,
    title: planDayBase.title.optional(),
    objective: planDayBase.objective,
    notes: planDayBase.notes,
    sort_order: planDayBase.sort_order,
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Informe ao menos um campo para atualizar",
  });

export const reorderPlanDaysSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().refine(isUuid, "Identificador inválido"),
        sort_order: z.coerce.number().int().min(0),
      }),
    )
    .min(1),
});

export const planVideoSchema = z.object({
  video_id: z.string().refine(isUuid, "Vídeo inválido"),
  sort_order: z.coerce.number().int().min(0).optional(),
});

export const grantPlanAccessSchema = z.object({
  enrollment_id: z.string().refine(isUuid, "Vínculo inválido"),
});

export const dateRangeSchema = z.object({
  from_date: z.string().refine(isIsoDate, "Data inicial inválida").optional(),
  to_date: z.string().refine(isIsoDate, "Data final inválida").optional(),
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type CreatePlanDayInput = z.infer<typeof createPlanDaySchema>;
