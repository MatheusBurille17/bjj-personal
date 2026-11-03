#!/usr/bin/env node
/**
 * Importa o conteúdo de `.data/db.json` para o Postgres do Supabase.
 *
 * Uso:
 *   $env:SUPABASE_DB_URL="postgresql://postgres:SENHA@db.REF.supabase.co:5432/postgres"
 *   node scripts/seed-supabase.mjs
 *
 * - Cria os usuários no auth.users com senha bcrypt (e-mail confirmado).
 * - Copia as tabelas de domínio em ordem de dependência.
 * - É idempotente (ON CONFLICT DO NOTHING).
 *
 * A senha padrão dos usuários importados é `senha12345`; troque depois.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const DEFAULT_PASSWORD = process.env.IMPORT_PASSWORD ?? "senha12345";
const DB_FILE = process.env.BJJ_DB_FILE ?? path.join(process.cwd(), ".data", "db.json");
const DB_URL =
  process.env.SUPABASE_DB_URL ??
  (process.env.SUPABASE_DB_PASSWORD
    ? `postgresql://postgres:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@db.tgagdkjopxlihgfvflrn.supabase.co:5432/postgres`
    : undefined);

if (!DB_URL) {
  console.error(
    "Defina SUPABASE_DB_URL ou SUPABASE_DB_PASSWORD (senha do banco do projeto).",
  );
  process.exit(1);
}

if (!fs.existsSync(DB_FILE)) {
  console.error(`Arquivo não encontrado: ${DB_FILE}`);
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

async function tableColumns(table) {
  const result = await client.query(
    `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`,
    [table],
  );
  return new Set(result.rows.map((row) => row.column_name));
}

async function insertRows(table, rows, { onConflict = "id" } = {}) {
  if (!rows || rows.length === 0) return 0;
  const columns = await tableColumns(table);
  let inserted = 0;

  for (const row of rows) {
    const keys = Object.keys(row).filter((key) => columns.has(key));
    if (keys.length === 0) continue;
    const values = keys.map((key) => row[key]);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const sql = `insert into public.${table} (${keys.map((key) => `"${key}"`).join(", ")})
      values (${placeholders})
      on conflict (${onConflict}) do nothing`;
    try {
      const result = await client.query(sql, values);
      inserted += result.rowCount ?? 0;
    } catch (error) {
      console.error(`✖ ${table}: ${error.message}`);
      throw error;
    }
  }
  return inserted;
}

async function insertAuthUsers(users) {
  let inserted = 0;
  for (const user of users) {
    const identityData = JSON.stringify({
      sub: user.id,
      email: user.email,
      email_verified: true,
      phone_verified: false,
    });

    const result = await client.query(
      `insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, email_change, email_change_token_new, recovery_token
       ) values (
         '00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
         $2, crypt($3, gen_salt('bf')), coalesce($4::timestamptz, now()),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
         coalesce($4::timestamptz, now()), coalesce($4::timestamptz, now()),
         '', '', '', ''
       ) on conflict (id) do nothing`,
      [user.id, user.email, DEFAULT_PASSWORD, user.created_at ?? null],
    );
    inserted += result.rowCount ?? 0;

    try {
      await client.query(
        `insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
         values ($1, $1, $2, $3::jsonb, 'email', now(), now(), now())
         on conflict do nothing`,
        [user.id, user.id, identityData],
      );
    } catch (error) {
      // O schema de auth.identities varia entre versões; o login por senha usa auth.users.
      console.warn(`  aviso: identidade de ${user.email} não criada (${error.message})`);
    }
  }
  return inserted;
}

async function main() {
  await client.connect();
  console.log(`Importando ${DB_FILE} para ${DB_URL.replace(/:[^:@]+@/, ":****@")}`);

  const users = (db.users ?? []).map((user) => ({
    id: user.id,
    email: user.email.toLowerCase(),
    created_at: user.created_at,
  }));
  console.log(`→ auth.users: ${await insertAuthUsers(users)} novo(s)`);

  const order = [
    ["profiles", db.profiles],
    ["teachers", db.teachers],
    ["enrollments", db.enrollments],
    ["techniques", db.techniques],
    ["modules", db.modules],
    ["videos", db.videos],
    ["monthly_plans", db.monthly_plans],
    ["plan_days", db.plan_days],
    ["plan_day_videos", db.plan_day_videos],
    ["plan_enrollments", db.plan_enrollments],
    ["weekly_slots", db.weekly_slots],
    ["lessons", db.lessons],
    ["lesson_videos", db.lesson_videos],
    ["student_technique_access", db.student_technique_access],
    ["user_google_oauth", db.user_google_oauth],
    ["oauth_audit_logs", db.oauth_audit_logs],
    ["oauth_used_authorization_codes", db.oauth_used_codes],
    ["providers_oauth_tokens", db.providers_oauth_tokens],
    ["video_storage_config", db.video_storage_config],
    ["drive_folder_mappings", db.drive_folder_mappings],
    ["video_access_audit", db.video_access_audit],
    ["video_upload_sessions", db.video_upload_sessions],
    ["video_migration_jobs", db.video_migration_jobs],
  ];

  for (const [table, rows] of order) {
    const count = await insertRows(table, rows);
    console.log(`→ ${table}: ${count} novo(s)`);
  }

  console.log("Importação concluída. Senha padrão:", DEFAULT_PASSWORD);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
