import { Resend } from "resend";
import { getDb, mutate, newId, nowIso } from "@/lib/db/store";
import type { EmailOutboxRecord } from "@/lib/db/schema";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  kind: EmailOutboxRecord["kind"];
  payload?: Record<string, unknown>;
}

let client: Resend | null = null;

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Resend(apiKey);
  return client;
}

/**
 * Envia e-mail transacional via Resend. Sem chave configurada, grava em uma
 * caixa de saída local para que o fluxo de convite/recuperação continue
 * testável no ambiente de demonstração.
 */
export async function sendEmail(input: SendEmailInput): Promise<{ delivered: boolean }> {
  const record: EmailOutboxRecord = {
    id: newId(),
    to: input.to,
    subject: input.subject,
    html: input.html,
    kind: input.kind,
    payload: input.payload ?? {},
    created_at: nowIso(),
  };

  mutate((db) => {
    db.email_outbox.unshift(record);
    db.email_outbox = db.email_outbox.slice(0, 100);
  });

  const resend = getResendClient();
  if (!resend) {
    console.info(`[email:demo] ${input.subject} -> ${input.to}`);
    return { delivered: false };
  }

  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "Jiu-Jitsu App <nao-responda@bjj.app>",
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    return { delivered: true };
  } catch (error) {
    // Falhas de e-mail não devem bloquear o fluxo principal.
    console.error("[email] falha ao enviar", error);
    return { delivered: false };
  }
}

export function getOutbox(): EmailOutboxRecord[] {
  return getDb().email_outbox;
}
