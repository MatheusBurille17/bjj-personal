import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** Chave secreta do servidor (sb_secret_... ou service_role legado). */
export function getSupabaseSecretKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * Cliente administrativo (secret/service role). Deve ser usado somente no
 * servidor e nunca exposto ao navegador. Operações administrativas devem
 * validar o professor/usuário antes de executar.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = getSupabaseSecretKey();
  if (!url || !secretKey) {
    throw new Error("SUPABASE_SECRET_KEY não configurada");
  }
  return createSupabaseClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
