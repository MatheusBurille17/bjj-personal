import { Resend } from "resend";

let instance: Resend | null = null;

/** Cliente Resend inicializado de forma preguiçosa. */
export function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!instance) instance = new Resend(apiKey);
  return instance;
}

export const RESEND_FROM =
  process.env.RESEND_FROM_EMAIL ?? "Jiu-Jitsu App <nao-responda@bjj.app>";
