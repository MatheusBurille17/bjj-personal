"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Cliente Supabase para componentes do navegador. */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Projetos novos expõem uma publishable key; mantemos a anon key como fallback.
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publicKey) {
    throw new Error("Supabase não configurado no ambiente do navegador");
  }
  return createBrowserClient(url, publicKey);
}
