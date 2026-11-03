#!/usr/bin/env node
/**
 * Dispara e executa a migração em lote de vídeos Mux para o Google Drive.
 *
 * Uso:
 *   MIGRATION_SESSION_COOKIE="sb-...=..." npm run migrate:videos
 *
 * O cookie deve pertencer a um instrutor autenticado com Google Drive
 * conectado. Cada chamada POST /api/videos/migrate/:jobId processa um lote
 * pequeno (serverless-friendly); o script repete até concluir.
 */
const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const cookie = process.env.MIGRATION_SESSION_COOKIE;

if (!cookie) {
  console.error(
    "Defina MIGRATION_SESSION_COOKIE com o cookie de sessão de um instrutor autenticado.",
  );
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const headers = {
  "content-type": "application/json",
  cookie,
};

const startResponse = await fetch(`${baseUrl}/api/videos/migrate`, {
  method: "POST",
  headers,
  body: JSON.stringify({}),
});

const startPayload = await startResponse.json().catch(() => null);
if (!startResponse.ok) {
  console.error(
    "Falha ao iniciar a migração:",
    startPayload?.error ?? startResponse.statusText,
  );
  process.exit(1);
}

const data = startPayload?.data ?? {};
const jobId = data.migrationId;
if (!jobId) {
  console.error("A API não retornou migrationId.");
  process.exit(1);
}

console.log("Migração iniciada:", {
  jobId,
  status: data.status,
  totalVideos: data.totalVideos,
});

let job = {
  status: data.status ?? "pending",
  processed_videos: data.processedVideos ?? 0,
  failed_videos: 0,
  total_videos: data.totalVideos ?? 0,
  errors: [],
};

for (let attempt = 0; attempt < 200; attempt += 1) {
  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    break;
  }

  const runResponse = await fetch(`${baseUrl}/api/videos/migrate/${jobId}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ limit: 1 }),
  });
  const runPayload = await runResponse.json().catch(() => null);
  if (!runResponse.ok) {
    console.error(
      "Falha ao executar lote:",
      runPayload?.error ?? runResponse.statusText,
    );
    process.exit(1);
  }

  job = runPayload?.data ?? job;
  console.log(
    `[${job.status}] ${job.processed_videos}/${job.total_videos} migrados, ${job.failed_videos} falhas`,
  );

  if (job.status === "running" || job.status === "pending") {
    await sleep(1_500);
  }
}

console.log("Migração finalizada:", {
  jobId,
  status: job.status,
  processed: job.processed_videos,
  failed: job.failed_videos,
  errors: job.errors,
});
