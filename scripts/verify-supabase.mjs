#!/usr/bin/env node
/**
 * Verifica a conexão com o Supabase e se as migrações foram aplicadas.
 *
 * Uso:
 *   node scripts/verify-supabase.mjs
 *
 * Lê NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (ou
 * NEXT_PUBLIC_SUPABASE_ANON_KEY) de .env.local / variáveis de ambiente.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("✖ NEXT_PUBLIC_SUPABASE_URL e a chave pública não estão definidas.");
  process.exit(1);
}

const tables = [
  "profiles",
  "teachers",
  "enrollments",
  "techniques",
  "modules",
  "videos",
  "monthly_plans",
  "plan_days",
  "plan_day_videos",
  "plan_enrollments",
  "weekly_slots",
  "lessons",
  "lesson_videos",
  "student_technique_access",
  "user_google_oauth",
  "oauth_audit_logs",
  "providers_oauth_tokens",
  "video_storage_config",
  "drive_folder_mappings",
  "video_access_audit",
  "video_upload_sessions",
  "video_migration_jobs",
];

async function checkTable(table) {
  // `select=*` falha em enrollments porque `private_notes` é revogada para anon;
  // consultar apenas `id` verifica a existência da tabela sem esbarrar em RLS.
  const response = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (response.status === 404) return "ausente";
  if (response.status === 200 || response.status === 206) return "ok";
  if (response.status === 401 || response.status === 403) return "sem permissão";
  return `erro ${response.status}`;
}

console.log(`Projeto: ${url}\n`);

const auth = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
console.log(`Auth: ${auth.ok ? "ok" : `erro ${auth.status}`}`);

const results = await Promise.all(
  tables.map(async (table) => [table, await checkTable(table)]),
);

const missing = results.filter(([, status]) => status !== "ok");
for (const [table, status] of results) {
  console.log(`${status === "ok" ? "✔" : "✖"} ${table}: ${status}`);
}

if (missing.length > 0) {
  console.log(
    `\n${missing.length} tabela(s) pendente(s). Aplique supabase/setup.sql no SQL Editor ou rode:\n` +
      `  npx supabase db push --db-url "postgresql://postgres:SENHA@db.<ref>.supabase.co:5432/postgres"`,
  );
  process.exitCode = 1;
} else {
  console.log("\nTudo pronto: schema aplicado.");
}
