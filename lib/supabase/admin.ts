import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente administrativo (service role). Deve ser usado somente no servidor e
 * nunca exposto ao navegador. Operações administrativas devem validar o
 * professor/usuário antes de executar.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada");
  }
  return createSupabaseClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
