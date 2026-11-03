import { z } from "zod";

/**
 * Validação das variáveis de ambiente. Nenhum valor externo é obrigatório no
 * modo local: sem Supabase/Mux/Resend a aplicação usa o repositório JSON, a
 * caixa de saída de e-mail e a mídia de demonstração.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z
    .string()
    .min(32)
    .default("dev-only-secret-change-me-in-production-please-1234567890"),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().min(1).optional(),

  MUX_TOKEN_ID: z.string().min(1).optional(),
  MUX_TOKEN_SECRET: z.string().min(1).optional(),
  MUX_SIGNING_KEY_ID: z.string().min(1).optional(),
  MUX_SIGNING_PRIVATE_KEY: z.string().min(1).optional(),
  MUX_WEBHOOK_SECRET: z.string().min(1).optional(),

  // Google OAuth (opcional no modo local; obrigatório para login social real).
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_GOOGLE_REDIRECT_URI: z.string().url().optional(),
  GOOGLE_TOKEN_ENCRYPTION_KEY: z.string().min(32).optional(),
  GOOGLE_TOKEN_ENCRYPTION_SALT: z.string().min(8).optional(),
  GOOGLE_OAUTH_SCOPES: z.string().min(1).optional(),

  // Rate limiting do fluxo OAuth (por IP).
  OAUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().optional(),
  OAUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().optional(),

  // Google Drive video storage.
  GOOGLE_DRIVE_API_KEY: z.string().min(1).optional(),
  GOOGLE_DRIVE_FOLDER_ROOT: z.string().min(1).optional(),
  NEXT_PUBLIC_GOOGLE_DRIVE_REDIRECT_URI: z.string().url().optional(),
  GOOGLE_DRIVE_SCOPES: z.string().min(1).optional(),
  GOOGLE_DRIVE_MAX_FILE_BYTES: z.coerce.number().int().positive().optional(),
  GOOGLE_DRIVE_RETRY_BASE_MS: z.coerce.number().int().min(0).optional(),
  GOOGLE_DRIVE_MAX_RETRIES: z.coerce.number().int().min(0).max(10).optional(),
  GOOGLE_DRIVE_CIRCUIT_BREAKER_MS: z.coerce.number().int().positive().optional(),
  PLAYBACK_TOKEN_SECRET: z.string().min(32).optional(),

  BJJ_STORE: z.enum(["memory", "file"]).optional(),
  BJJ_DB_FILE: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Retorna as variáveis validadas, registrando avisos para serviços opcionais. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("[env] Variáveis inválidas:", parsed.error.flatten().fieldErrors);
    throw new Error("Configuração de ambiente inválida");
  }
  cached = parsed.data;

  if (!cached.NEXT_PUBLIC_SUPABASE_URL) {
    console.info("[env] Supabase não configurado — usando repositório local de demonstração.");
  }
  if (!cached.MUX_TOKEN_ID) {
    console.info("[env] Mux não configurada — uploads/reprodução usam mídia de demonstração.");
  }
  if (!cached.RESEND_API_KEY) {
    console.info("[env] Resend não configurado — e-mails ficam na caixa de saída local.");
  }
  if (!cached.NEXT_PUBLIC_GOOGLE_CLIENT_ID || !cached.GOOGLE_CLIENT_SECRET) {
    console.info(
      "[env] Google OAuth não configurado — login social fica indisponível até definir as credenciais.",
    );
  }
  if (!cached.GOOGLE_TOKEN_ENCRYPTION_KEY) {
    console.info(
      "[env] GOOGLE_TOKEN_ENCRYPTION_KEY ausente — usando AUTH_SECRET para criptografar tokens (apenas desenvolvimento).",
    );
  }
  return cached;
}

export function isSupabaseConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === "production";
}

export function isGoogleOAuthConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}
