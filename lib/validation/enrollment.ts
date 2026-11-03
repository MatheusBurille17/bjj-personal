import { z } from "zod";
import type { EnrollmentStatus } from "@/types/enrollment";
import { isValidPhoneNumber } from "@/lib/utils/validation";

const ENROLLMENT_STATUSES = ["pending", "active", "paused", "archived"] as const;

const name = z
  .string({ required_error: "Informe o nome do aluno" })
  .trim()
  .min(2, "O nome deve ter pelo menos 2 caracteres")
  .max(120, "O nome deve ter no máximo 120 caracteres");

const email = z
  .string({ required_error: "Informe o e-mail do aluno" })
  .trim()
  .min(1, "Informe o e-mail do aluno")
  .email("E-mail inválido")
  .transform((value) => value.toLowerCase());

const phone = z
  .string()
  .trim()
  .max(30, "Telefone muito longo")
  .refine(isValidPhoneNumber, "Telefone inválido")
  .nullable()
  .optional();

const notes = z
  .string()
  .trim()
  .max(5000, "As observações devem ter no máximo 5000 caracteres")
  .nullable()
  .optional();

export const createEnrollmentSchema = z.object({
  student_name: name,
  student_email: email,
  student_phone: phone,
  private_notes: notes,
  started_at: z.string().datetime({ offset: true }).optional(),
});

export const updateEnrollmentSchema = z
  .object({
    student_name: name.optional(),
    student_email: email.optional(),
    student_phone: phone,
    private_notes: notes,
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Informe ao menos um campo para atualizar",
  });

export const searchEnrollmentsSchema = z.object({
  search: z.string().trim().max(120).optional().default(""),
  status: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (!value) return [] as EnrollmentStatus[];
      const values = Array.isArray(value) ? value : value.split(",");
      return values
        .map((item) => item.trim())
        .filter((item): item is EnrollmentStatus =>
          (ENROLLMENT_STATUSES as readonly string[]).includes(item),
        );
    }),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

/** Transições válidas de status de vínculo (Requisito 17). */
const TRANSITIONS: Record<EnrollmentStatus, EnrollmentStatus[]> = {
  pending: ["active", "archived"],
  active: ["paused", "archived"],
  paused: ["active", "archived"],
  archived: [],
};

export function canTransitionStatus(
  from: EnrollmentStatus,
  to: EnrollmentStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function validateStatusTransition(
  from: EnrollmentStatus,
  to: EnrollmentStatus,
): { valid: true } | { valid: false; message: string } {
  if (!canTransitionStatus(from, to)) {
    return {
      valid: false,
      message: `Não é possível alterar o status de "${from}" para "${to}"`,
    };
  }
  return { valid: true };
}

export type CreateEnrollmentInput = z.infer<typeof createEnrollmentSchema>;
export type UpdateEnrollmentInput = z.infer<typeof updateEnrollmentSchema>;
export type SearchEnrollmentsInput = z.infer<typeof searchEnrollmentsSchema>;
