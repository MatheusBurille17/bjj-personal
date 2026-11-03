import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";

/** Chave secreta do servidor (sb_secret_... ou service_role legado). */
export function getSupabaseSecretKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * Cliente administrativo (secret/service role). Ignora RLS: use somente em
 * operações de servidor já autorizadas pela aplicação (webhooks, importação,
 * criação de usuários por convite, auditoria).
 */
export function createAdminClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = getSupabaseSecretKey();
  if (!url || !secretKey) {
    throw new Error("SUPABASE_SECRET_KEY não configurada");
  }
  return createSupabaseClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function isAdminClientAvailable(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && getSupabaseSecretKey());
}
