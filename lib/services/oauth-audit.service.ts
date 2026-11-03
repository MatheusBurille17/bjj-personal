import { randomUUID } from "node:crypto";
import type {
  OAuthAuditEventType,
  OAuthAuditLogRecord,
} from "@/types/google-oauth";
import { getDb, mutate, nowIso } from "@/lib/db/store";
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
 * Registra um evento de auditoria do fluxo Google OAuth.
 *
 * Garantias:
 * - nunca grava tokens, códigos de autorização, IVs ou segredos;
 * - falhas de auditoria nunca interrompem o fluxo principal;
 * - o log do console usa a mesma versão redigida dos metadados.
 */
export function logOAuthAudit(input: OAuthAuditInput): OAuthAuditLogRecord {
  const metadata = redactSensitive(input.metadata ?? {});
  const record: OAuthAuditLogRecord = {
    id: randomUUID(),
    user_id: input.userId ?? null,
    event: input.event,
    success: input.success !== false,
    ip: input.ip ?? null,
    user_agent: input.userAgent ?? null,
    metadata,
    created_at: nowIso(),
  };

  try {
    mutate((db) => {
      db.oauth_audit_logs.push(record);
    });
  } catch (error) {
    console.error("[oauth-audit] falha ao persistir evento", {
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

  return record;
}

export function getOAuthAuditLogs(userId?: string): OAuthAuditLogRecord[] {
  const logs = getDb().oauth_audit_logs;
  return userId ? logs.filter((log) => log.user_id === userId) : [...logs];
}

export function resetOAuthAuditLogs(): void {
  mutate((db) => {
    db.oauth_audit_logs = [];
  });
}
