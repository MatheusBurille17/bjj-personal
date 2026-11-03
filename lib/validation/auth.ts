import { z } from "zod";
import { isValidTimezone } from "@/lib/utils/validation";

const email = z
  .string({ required_error: "Informe o e-mail" })
  .trim()
  .min(1, "Informe o e-mail")
  .email("E-mail inválido")
  .transform((value) => value.toLowerCase());

const password = z
  .string({ required_error: "Informe a senha" })
  .min(8, "A senha deve ter pelo menos 8 caracteres")
  .max(128, "A senha deve ter no máximo 128 caracteres");

export const signupSchema = z.object({
  email,
  password,
  fullName: z
    .string({ required_error: "Informe o nome completo" })
    .trim()
    .min(2, "O nome deve ter pelo menos 2 caracteres")
    .max(120, "O nome deve ter no máximo 120 caracteres"),
  displayName: z
    .string({ required_error: "Informe o nome de exibição" })
    .trim()
    .min(2, "O nome de exibição deve ter pelo menos 2 caracteres")
    .max(80, "O nome de exibição deve ter no máximo 80 caracteres"),
  timezone: z
    .string()
    .trim()
    .refine(isValidTimezone, "Fuso horário inválido")
    .default("America/Sao_Paulo"),
});

export const loginSchema = z.object({
  email,
  password: z.string({ required_error: "Informe a senha" }).min(1, "Informe a senha"),
});

export const recoverSchema = z.object({
  email,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(16, "Token inválido"),
  password,
});

export const inviteSignupSchema = z.object({
  password,
  fullName: z
    .string({ required_error: "Informe o nome completo" })
    .trim()
    .min(2, "O nome deve ter pelo menos 2 caracteres")
    .max(120, "O nome deve ter no máximo 120 caracteres"),
});

export const profileUpdateSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(2, "O nome deve ter pelo menos 2 caracteres")
      .max(120, "O nome deve ter no máximo 120 caracteres")
      .optional(),
    avatar_url: z
      .string()
      .trim()
      .max(2_000_000, "Imagem muito grande")
      .nullable()
      .optional(),
    display_name: z
      .string()
      .trim()
      .min(2, "O nome de exibição deve ter pelo menos 2 caracteres")
      .max(80, "O nome de exibição deve ter no máximo 80 caracteres")
      .optional(),
    timezone: z.string().trim().refine(isValidTimezone, "Fuso horário inválido").optional(),
    bio: z.string().trim().max(1000, "A bio deve ter no máximo 1000 caracteres").nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Informe ao menos um campo para atualizar",
  });

export const switchRoleSchema = z.object({
  role: z.enum(["teacher", "student"]),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
