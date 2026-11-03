import { randomUUID } from "node:crypto";
import type { OAuthAuditEventType } from "@/types/google-oauth";
import { createAdminClient, isAdminClientAvailable } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { redactSensitive, safeErrorMessage } from "@/lib/utils/redaction";

export interface OAuthAuditInput {
  event: OAuthAuditEventType;
  userId?: string | null;
  success?: boolean;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Auditoria do fluxo Google OAuth no Supabase.
 *
 * `oauth_audit_logs` só permite SELECT para `authenticated`; a escrita é feita
 * com a service role (ou fica apenas no console quando ela não está
 * configurada). Falhas de auditoria nunca interrompem o fluxo principal.
 */
export async function logOAuthAuditSupabase(
  input: OAuthAuditInput,
): Promise<void> {
  const metadata = redactSensitive(input.metadata ?? {});
  const record = {
    id: randomUUID(),
    user_id: input.userId ?? null,
    event: input.event,
    success: input.success !== false,
    ip: input.ip ?? null,
    user_agent: input.userAgent ?? null,
    metadata,
    created_at: new Date().toISOString(),
  };

  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const client = isAdminClientAvailable()
        ? createAdminClient()
        : await createClient();
      const { error } = await client.from("oauth_audit_logs").insert(record);
      if (error) throw error;
    }
  } catch (error) {
    console.error("[oauth-audit] falha ao persistir evento no Supabase", {
      event: input.event,
      message: safeErrorMessage(error),
    });
  }

  try {
    console.info(`[oauth-audit] ${record.event}`, {
      user_id: record.user_id,
      success: record.success,
      ...metadata,
    });
  } catch {
    // Logging nunca deve quebrar a operação.
  }
}
