import { z } from "zod";
import { isUuid } from "@/lib/utils/validation";

const sortOrder = z.coerce.number().int().min(0, "A ordem deve ser positiva").optional();

export const createTechniqueSchema = z.object({
  name: z
    .string({ required_error: "Informe o nome da técnica" })
    .trim()
    .min(2, "O nome deve ter pelo menos 2 caracteres")
    .max(120, "O nome deve ter no máximo 120 caracteres"),
  description: z.string().trim().max(2000, "A descrição deve ter no máximo 2000 caracteres").nullable().optional(),
  category: z.string().trim().max(100).nullable().optional(),
  sort_order: sortOrder,
});

export const updateTechniqueSchema = z
  .object({
    name: z.string().trim().min(2, "O nome deve ter pelo menos 2 caracteres").max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    category: z.string().trim().max(100).nullable().optional(),
    sort_order: z.coerce.number().int().min(0).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Informe ao menos um campo para atualizar",
  });

export const reorderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().refine(isUuid, "Identificador inválido"),
        sort_order: z.coerce.number().int().min(0, "A ordem deve ser positiva"),
      }),
    )
    .min(1, "Informe ao menos um item"),
});

export const createModuleSchema = z.object({
  technique_id: z.string().refine(isUuid, "Técnica inválida"),
  name: z
    .string({ required_error: "Informe o nome do módulo" })
    .trim()
    .min(2, "O nome deve ter pelo menos 2 caracteres")
    .max(120, "O nome deve ter no máximo 120 caracteres"),
  description: z.string().trim().max(2000).nullable().optional(),
  sort_order: sortOrder,
});

export const updateModuleSchema = z
  .object({
    name: z.string().trim().min(2, "O nome deve ter pelo menos 2 caracteres").max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    sort_order: z.coerce.number().int().min(0).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Informe ao menos um campo para atualizar",
  });

export const moveModuleSchema = z.object({
  technique_id: z.string().refine(isUuid, "Técnica inválida"),
});

export const createVideoSchema = z.object({
  module_id: z.string().refine(isUuid, "Módulo inválido"),
  title: z
    .string({ required_error: "Informe o título do vídeo" })
    .trim()
    .min(2, "O título deve ter pelo menos 2 caracteres")
    .max(200, "O título deve ter no máximo 200 caracteres"),
  description: z.string().trim().max(2000, "A descrição deve ter no máximo 2000 caracteres").nullable().optional(),
  provider_video_id: z.string().trim().max(200).optional(),
  thumbnail_url: z.string().trim().max(2000).nullable().optional(),
  duration_seconds: z.coerce.number().int().min(0).nullable().optional(),
  status: z.enum(["uploading", "processing", "ready", "error", "archived"]).optional(),
  playback_url: z.string().trim().max(2000).nullable().optional(),
});

export const updateVideoSchema = z
  .object({
    title: z.string().trim().min(2, "O título deve ter pelo menos 2 caracteres").max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    thumbnail_url: z.string().trim().max(2000).nullable().optional(),
    duration_seconds: z.coerce.number().int().min(0).nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Informe ao menos um campo para atualizar",
  });

export const videoStatusSchema = z.object({
  status: z.enum(["uploading", "processing", "ready", "error"]),
});

export const videoSearchSchema = z.object({
  search: z.string().trim().max(200).optional().default(""),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  includeArchived: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === "true"),
});

export type CreateTechniqueInput = z.infer<typeof createTechniqueSchema>;
export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type CreateVideoInput = z.infer<typeof createVideoSchema>;
export type UpdateTechniqueInput = z.infer<typeof updateTechniqueSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
export type UpdateVideoInput = z.infer<typeof updateVideoSchema>;
