#!/usr/bin/env node
/**
 * Dispara a migração em lote de vídeos Mux para o Google Drive.
 *
 * Uso:
 *   MIGRATION_SESSION_COOKIE="bjj_session=..." npm run migrate:videos
 *
 * O cookie de sessão deve pertencer a um instrutor autenticado com Google Drive
 * conectado. O job é assíncrono; acompanhe em GET /api/videos/migrate/:jobId.
 */
const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const cookie = process.env.MIGRATION_SESSION_COOKIE;

if (!cookie) {
  console.error(
    "Defina MIGRATION_SESSION_COOKIE com o cookie de sessão de um instrutor autenticado.",
  );
  process.exit(1);
}

const response = await fetch(`${baseUrl}/api/videos/migrate`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    cookie,
  },
  body: JSON.stringify({}),
});

const payload = await response.json().catch(() => null);
if (!response.ok) {
  console.error("Falha ao iniciar a migração:", payload?.error ?? response.statusText);
  process.exit(1);
}

const data = payload?.data ?? {};
console.log("Migração iniciada:", {
  jobId: data.migrationId,
  status: data.status,
  totalVideos: data.totalVideos,
});
console.log(`Acompanhe em ${baseUrl}/api/videos/migrate/${data.migrationId}`);
