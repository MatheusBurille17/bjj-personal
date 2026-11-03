import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Verificação real das políticas RLS em PostgreSQL (WASM via PGlite).
 * O schema de produção é aplicado com stubs de `auth.users` e `auth.uid()`,
 * simulando os papéis `authenticated` e `anon` do Supabase.
 */
const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const S1 = "33333333-3333-4333-8333-333333333333";
const S2 = "44444444-4444-4444-8444-444444444444";

const E1 = "aaaaaaa1-1111-4111-8111-111111111111";
const E2 = "aaaaaaa2-2222-4222-8222-222222222222";
const E3 = "aaaaaaa3-3333-4333-8333-333333333333";
const E4 = "aaaaaaa4-4444-4444-8444-444444444444";

const TECH1 = "bbbbbbb1-1111-4111-8111-111111111111";
const TECH2 = "bbbbbbb2-2222-4222-8222-222222222222";
const MOD1 = "ccccccc1-1111-4111-8111-111111111111";
const VIDEO1 = "ddddddd1-1111-4111-8111-111111111111";
const VIDEO2 = "ddddddd2-2222-4222-8222-222222222222";
const PLAN1 = "eeeeeee1-1111-4111-8111-111111111111";
const PLAN2 = "eeeeeee2-2222-4222-8222-222222222222";
const PLAN3 = "eeeeeee3-3333-4333-8333-333333333333";
const DAY1 = "fffffff1-1111-4111-8111-111111111111";
const DAY2 = "fffffff2-2222-4222-8222-222222222222";
const LESSON1 = "88888881-1111-4111-8111-111111111111";
const LESSON2 = "88888882-2222-4222-8222-222222222222";
const LESSON3 = "88888883-3333-4333-8333-333333333333";
const LESSON4 = "88888884-4444-4444-8444-444444444444";
const LESSON5 = "88888885-5555-4555-8555-555555555555";
const ACCESS1 = "99999991-1111-4111-8111-111111111111";
const ACCESS2 = "99999992-2222-4222-8222-222222222222";
const GOOGLE_T1 = "abababa1-1111-4111-8111-111111111111";
const GOOGLE_T2 = "abababa2-2222-4222-8222-222222222222";
const AUDIT_T1 = "acacaca1-1111-4111-8111-111111111111";
const AUDIT_T2 = "acacaca2-2222-4222-8222-222222222222";
const PERSONAL_VIDEO = "dadada01-1111-4111-8111-111111111111";
const STORAGE_T1 = "dedede01-1111-4111-8111-111111111111";
const STORAGE_T2 = "dedede02-2222-4222-8222-222222222222";
const DRIVE_TOKEN_T1 = "dfdfdf01-1111-4111-8111-111111111111";
const DRIVE_TOKEN_T2 = "dfdfdf02-2222-4222-8222-222222222222";
const FOLDER_T1 = "f1f1f101-1111-4111-8111-111111111111";
const FOLDER_T2 = "f1f1f102-2222-4222-8222-222222222222";
const VIDEO_AUDIT_T1 = "a1a1a101-1111-4111-8111-111111111111";
const VIDEO_AUDIT_T2 = "a1a1a102-2222-4222-8222-222222222222";
const UPLOAD_T1 = "b1b1b101-1111-4111-8111-111111111111";
const UPLOAD_T2 = "b1b1b102-2222-4222-8222-222222222222";
const MIGRATION_T1 = "c1c1c101-1111-4111-8111-111111111111";
const MIGRATION_T2 = "c1c1c102-2222-4222-8222-222222222222";

let db: PGlite;

async function asUser(userId: string | null, role: "authenticated" | "anon" = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  await db.exec(`set role ${role}`);
}

async function asPostgres() {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
}

async function rows<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const result = await db.query<T>(sql);
  return result.rows;
}

async function count(sql: string): Promise<number> {
  const result = await db.query<{ count: number }>(sql);
  return Number(result.rows[0]?.count ?? 0);
}

beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;

  const migration = readFileSync(
    path.join(process.cwd(), "supabase", "migrations", "20261029_000001_initial_schema.sql"),
    "utf8",
  ).replace(/create extension if not exists pgcrypto;/i, "");

  await db.exec(`
    create schema if not exists auth;
    create table if not exists auth.users (
      id uuid primary key,
      email text not null unique
    );
    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
      end if;
    end $$;

    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
    end $$;

    grant usage on schema auth to authenticated, anon;
  `);

  await db.exec(migration);

  const googleMigration = readFileSync(
    path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "20261103_000003_google_oauth.sql",
    ),
    "utf8",
  );
  await db.exec(googleMigration);

  const driveMigration = readFileSync(
    path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "20261103_000004_google_drive_video_storage.sql",
    ),
    "utf8",
  );
  await db.exec(driveMigration);

  await db.exec(`
    insert into auth.users (id, email) values
      ('${T1}', 't1@example.com'),
      ('${T2}', 't2@example.com'),
      ('${S1}', 's1@example.com'),
      ('${S2}', 's2@example.com');

    insert into public.profiles (id, full_name, email) values
      ('${T1}', 'Professor Um', 't1@example.com'),
      ('${T2}', 'Professor Dois', 't2@example.com'),
      ('${S1}', 'Aluno Um', 's1@example.com'),
      ('${S2}', 'Aluno Dois', 's2@example.com');

    insert into public.teachers (id, display_name) values
      ('${T1}', 'Prof. Um'),
      ('${T2}', 'Prof. Dois');

    insert into public.enrollments
      (id, teacher_id, student_profile_id, student_name, student_email, status, private_notes, invite_token, invite_expires_at)
    values
      ('${E1}', '${T1}', '${S1}', 'Aluno Um', 's1@example.com', 'active', 'segredo-t1-s1', null, null),
      ('${E2}', '${T2}', '${S2}', 'Aluno Dois', 's2@example.com', 'active', 'segredo-t2-s2', null, null),
      ('${E3}', '${T1}', '${S2}', 'Aluno Dois', 's2@example.com', 'active', 'segredo-t1-s2', null, null),
      ('${E4}', '${T2}', '${S1}', 'Aluno Um', 's1@example.com', 'active', 'segredo-t2-s1', 'invite-token-rls', now() + interval '7 days');

    insert into public.techniques (id, teacher_id, name, status) values
      ('${TECH1}', '${T1}', 'Técnica do Professor Um', 'active'),
      ('${TECH2}', '${T2}', 'Técnica do Professor Dois', 'active');

    insert into public.modules (id, technique_id, teacher_id, name, status) values
      ('${MOD1}', '${TECH1}', '${T1}', 'Módulo Um', 'active');

    insert into public.videos
      (id, teacher_id, module_id, technique_id, title, provider, provider_video_id, status)
    values
      ('${VIDEO1}', '${T1}', '${MOD1}', '${TECH1}', 'Vídeo Um', 'mux', 'mux-1', 'ready'),
      ('${VIDEO2}', '${T2}', '${MOD1}', '${TECH2}', 'Vídeo Dois', 'mux', 'mux-2', 'ready');

    insert into public.monthly_plans
      (id, teacher_id, title, period_start, period_end, status, published_at)
    values
      ('${PLAN1}', '${T1}', 'Plano Publicado', '2026-10-01', '2026-10-31', 'published', now()),
      ('${PLAN2}', '${T1}', 'Plano Rascunho', '2026-11-01', '2026-11-30', 'draft', null),
      ('${PLAN3}', '${T2}', 'Plano de Outro', '2026-10-01', '2026-10-31', 'published', now());

    insert into public.plan_days (id, monthly_plan_id, teacher_id, weekday, title) values
      ('${DAY1}', '${PLAN1}', '${T1}', 2, 'Dia do plano publicado'),
      ('${DAY2}', '${PLAN2}', '${T1}', 3, 'Dia do rascunho');

    insert into public.plan_day_videos (plan_day_id, video_id) values ('${DAY1}', '${VIDEO1}');

    insert into public.plan_enrollments (monthly_plan_id, enrollment_id) values ('${PLAN1}', '${E1}');

    insert into public.lessons
      (id, teacher_id, enrollment_id, starts_at, ends_at, status, completed_at, private_notes)
    values
      ('${LESSON1}', '${T1}', '${E1}', now() + interval '1 day', now() + interval '1 day 1 hour', 'scheduled', null, 'nota-privada-1'),
      ('${LESSON2}', '${T1}', '${E1}', now() - interval '2 day', now() - interval '2 day' + interval '1 hour', 'completed', now() - interval '2 day', 'nota-privada-2'),
      ('${LESSON3}', '${T1}', '${E1}', now() - interval '3 day', now() - interval '3 day' + interval '1 hour', 'cancelled', null, 'nota-privada-3'),
      ('${LESSON4}', '${T2}', '${E2}', now() + interval '2 day', now() + interval '2 day 1 hour', 'scheduled', null, 'nota-privada-4'),
      ('${LESSON5}', '${T1}', '${E3}', now() + interval '3 day', now() + interval '3 day 1 hour', 'scheduled', null, 'nota-privada-5');

    insert into public.lesson_videos (lesson_id, video_id, source) values
      ('${LESSON1}', '${VIDEO1}', 'manual'),
      ('${LESSON2}', '${VIDEO1}', 'manual');

    insert into public.student_technique_access
      (id, teacher_id, enrollment_id, technique_id)
    values
      ('${ACCESS1}', '${T1}', '${E1}', '${TECH1}'),
      ('${ACCESS2}', '${T2}', '${E2}', '${TECH2}');

    insert into public.user_google_oauth
      (id, user_id, google_id, email, name, encrypted_access_token,
       encrypted_refresh_token, token_iv, token_expiry_at, is_connected,
       scopes_granted, consent_timestamp)
    values
      ('${GOOGLE_T1}', '${T1}', 'google-t1', 't1@example.com', 'Professor Um',
       'cipher-access-t1', 'cipher-refresh-t1', 'iv-access:iv-refresh',
       now() + interval '1 hour', true,
       array['openid', 'email'], now()),
      ('${GOOGLE_T2}', '${T2}', 'google-t2', 't2@example.com', 'Professor Dois',
       'cipher-access-t2', 'cipher-refresh-t2', 'iv-access-2:iv-refresh-2',
       now() + interval '1 hour', true,
       array['openid', 'email'], now());

    insert into public.oauth_audit_logs (id, user_id, event, success, metadata)
    values
      ('${AUDIT_T1}', '${T1}', 'google_connected', true, '{"scopes_count":2}'),
      ('${AUDIT_T2}', '${T2}', 'google_connected', true, '{"scopes_count":2}');

    insert into public.providers_oauth_tokens
      (id, user_id, encrypted_access_token, encrypted_refresh_token, token_iv,
       expires_at, scope, drive_id, google_email)
    values
      ('${DRIVE_TOKEN_T1}', '${T1}', 'cipher-a1', 'cipher-r1', 'iv:iv',
       now() + interval '1 hour', 'drive.file', 'drive-t1', 't1@example.com'),
      ('${DRIVE_TOKEN_T2}', '${T2}', 'cipher-a2', 'cipher-r2', 'iv:iv',
       now() + interval '1 hour', 'drive.file', 'drive-t2', 't2@example.com');

    insert into public.video_storage_config
      (id, user_id, root_folder_id, library_folder_id, archive_folder_id,
       personal_folder_id, last_sync_at)
    values
      ('${STORAGE_T1}', '${T1}', 'root-t1', 'library-t1', 'archive-t1',
       'personal-t1', now()),
      ('${STORAGE_T2}', '${T2}', 'root-t2', 'library-t2', 'archive-t2',
       'personal-t2', now());

    insert into public.drive_folder_mappings
      (id, user_id, folder_type, entity_id, folder_name, google_drive_folder_id,
       parent_folder_id)
    values
      ('${FOLDER_T1}', '${T1}', 'library', null, 'Biblioteca', 'library-t1', 'root-t1'),
      ('${FOLDER_T2}', '${T2}', 'library', null, 'Biblioteca', 'library-t2', 'root-t2');

    insert into public.videos
      (id, teacher_id, module_id, technique_id, title, provider,
       provider_video_id, status, owner_id, owner_role, visibility)
    values
      ('${PERSONAL_VIDEO}', null, null, null, 'Vídeo pessoal', 'google_drive',
       'personal-drive-file', 'ready', '${S1}', 'student', 'personal');

    insert into public.video_access_audit
      (id, video_id, user_id, action, success, ip_address, user_agent)
    values
      ('${VIDEO_AUDIT_T1}', '${VIDEO1}', '${S1}', 'playback', true,
       '127.0.0.1', 'vitest'),
      ('${VIDEO_AUDIT_T2}', '${VIDEO2}', '${S2}', 'playback', true,
       '127.0.0.2', 'vitest');

    insert into public.video_upload_sessions
      (id, user_id, destination, title, file_name, mime_type, total_bytes,
       chunk_size, total_chunks, expires_at)
    values
      ('${UPLOAD_T1}', '${T1}', 'library', 'Upload T1', 'v.mp4', 'video/mp4',
       10, 5, 2, now() + interval '1 hour'),
      ('${UPLOAD_T2}', '${T2}', 'library', 'Upload T2', 'v.mp4', 'video/mp4',
       10, 5, 2, now() + interval '1 hour');

    insert into public.video_migration_jobs
      (id, user_id, status, total_videos)
    values
      ('${MIGRATION_T1}', '${T1}', 'completed', 2),
      ('${MIGRATION_T2}', '${T2}', 'completed', 3);
  `);
});

afterAll(async () => {
  await db.close();
});

describe("RLS — perfis e professores", () => {
  it("aluno lê apenas o próprio perfil", async () => {
    await asUser(S1);
    expect(await count("select count(*) from public.profiles")).toBe(1);
    const rowsResult = await rows<{ id: string }>("select id from public.profiles");
    expect(rowsResult[0].id).toBe(S1);
  });

  it("professor lê o próprio perfil e dos alunos vinculados, mas não de outro professor", async () => {
    await asUser(T1);
    const ids = (await rows<{ id: string }>("select id from public.profiles order by id")).map(
      (row) => row.id,
    );
    expect(ids).toContain(T1);
    expect(ids).toContain(S1);
    expect(ids).toContain(S2);
    expect(ids).not.toContain(T2);
  });

  it("aluno vê professores com vínculo ativo", async () => {
    await asUser(S2);
    const ids = (await rows<{ id: string }>("select id from public.teachers order by id")).map(
      (row) => row.id,
    );
    expect(ids).toEqual([T1, T2]);
  });

  it("professor não acessa configuração de outro professor", async () => {
    await asUser(T1);
    expect(await count(`select count(*) from public.teachers where id = '${T2}'`)).toBe(0);
  });

  it("anon não vê perfis nem professores", async () => {
    await asUser(null, "anon");
    expect(await count("select count(*) from public.profiles")).toBe(0);
    expect(await count("select count(*) from public.teachers")).toBe(0);
  });
});

describe("RLS — vínculos e notas privadas", () => {
  it("aluno vê apenas os próprios vínculos, sem a coluna private_notes", async () => {
    await asUser(S1);
    const own = await rows<{ id: string }>("select id from public.student_enrollments order by id");
    expect(own.map((row) => row.id)).toEqual([E1, E4]);

    await expect(db.query("select private_notes from public.enrollments")).rejects.toThrow(
      /permission denied/i,
    );
    await expect(db.query("select * from public.enrollments")).rejects.toThrow(/permission denied/i);
  });

  it("professor lê notas privadas apenas dos próprios vínculos", async () => {
    await asUser(T1);
    const own = await rows<{ id: string; private_notes: string }>(
      "select id, private_notes from public.teacher_enrollments order by id",
    );
    expect(own.map((row) => row.id)).toEqual([E1, E3]);
    expect(own.every((row) => row.private_notes.startsWith("segredo-t1"))).toBe(true);

    await expect(db.query("select private_notes from public.enrollments")).rejects.toThrow(
      /permission denied/i,
    );
  });

  it("aluno não obtém notas privadas pela visão de professor", async () => {
    await asUser(S1);
    expect(await count("select count(*) from public.teacher_enrollments")).toBe(0);
  });

  it("aluno não atualiza nem exclui vínculos", async () => {
    await asUser(S1);
    const update = await db.query(
      `update public.enrollments set status = 'archived' where id = '${E1}'`,
    );
    expect(update.affectedRows).toBe(0);
    const remove = await db.query(`delete from public.enrollments where id = '${E1}'`);
    expect(remove.affectedRows).toBe(0);
    await asPostgres();
    expect(await count(`select count(*) from public.enrollments where id = '${E1}'`)).toBe(1);
  });

  it("professor não altera vínculo de outro professor", async () => {
    await asUser(T1);
    const result = await db.query(
      `update public.enrollments set status = 'paused' where id = '${E2}'`,
    );
    expect(result.affectedRows).toBe(0);
  });

  it("anon não vê vínculos", async () => {
    await asUser(null, "anon");
    expect(await count("select count(*) from public.student_enrollments")).toBe(0);
  });
});

describe("RLS — planos e dias", () => {
  it("aluno vê somente plano publicado liberado ao seu vínculo", async () => {
    await asUser(S1);
    const ids = (await rows<{ id: string }>("select id from public.monthly_plans order by id")).map(
      (row) => row.id,
    );
    expect(ids).toEqual([PLAN1]);
  });

  it("aluno não vê plano em rascunho nem de outro professor", async () => {
    await asUser(S2);
    expect(await count("select count(*) from public.monthly_plans")).toBe(0);
    await asUser(S1);
    expect(await count(`select count(*) from public.monthly_plans where id = '${PLAN2}'`)).toBe(0);
    expect(await count(`select count(*) from public.monthly_plans where id = '${PLAN3}'`)).toBe(0);
  });

  it("aluno vê apenas dias e vídeos do plano publicado", async () => {
    await asUser(S1);
    const days = await rows<{ id: string }>("select id from public.plan_days");
    expect(days.map((row) => row.id)).toEqual([DAY1]);
    expect(await count("select count(*) from public.plan_day_videos")).toBe(1);
  });

  it("professor vê e edita apenas os próprios planos e dias", async () => {
    await asUser(T1);
    expect(await count("select count(*) from public.monthly_plans")).toBe(2);
    expect(await count("select count(*) from public.plan_days")).toBe(2);
    const update = await db.query(
      `update public.monthly_plans set title = 'Alterado' where id = '${PLAN3}'`,
    );
    expect(update.affectedRows).toBe(0);
  });

  it("aluno não cria, edita nem exclui planos", async () => {
    await asUser(S1);
    const update = await db.query(
      `update public.monthly_plans set title = 'Hack' where id = '${PLAN1}'`,
    );
    expect(update.affectedRows).toBe(0);
    await expect(
      db.query(
        `insert into public.monthly_plans (teacher_id, title, period_start, period_end) values ('${T1}', 'Plano do aluno', '2026-10-01', '2026-10-31')`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("anon não vê planos nem dias", async () => {
    await asUser(null, "anon");
    expect(await count("select count(*) from public.monthly_plans")).toBe(0);
    expect(await count("select count(*) from public.plan_days")).toBe(0);
  });
});

describe("RLS — biblioteca", () => {
  it("aluno vê apenas técnica liberada", async () => {
    await asUser(S1);
    const ids = (await rows<{ id: string }>("select id from public.techniques")).map(
      (row) => row.id,
    );
    expect(ids).toEqual([TECH1]);
  });

  it("aluno vê módulos e vídeos da técnica liberada", async () => {
    await asUser(S1);
    expect(await count("select count(*) from public.modules")).toBe(1);
    const videos = (
      await rows<{ id: string }>(
        "select id from public.videos where visibility = 'library'",
      )
    ).map((row) => row.id);
    expect(videos).toEqual([VIDEO1]);
  });

  it("aluno não vê biblioteca de outro professor", async () => {
    await asUser(S2);
    expect(await count("select count(*) from public.techniques")).toBe(1);
    const ids = (await rows<{ id: string }>("select id from public.techniques")).map(
      (row) => row.id,
    );
    expect(ids).toEqual([TECH2]);
    expect(await count(`select count(*) from public.videos where id = '${VIDEO1}'`)).toBe(0);
  });

  it("professor vê e edita somente a própria biblioteca", async () => {
    await asUser(T1);
    expect(await count("select count(*) from public.techniques")).toBe(1);
    expect(await count("select count(*) from public.modules")).toBe(1);
    expect(await count("select count(*) from public.videos")).toBe(1);

    const update = await db.query(
      `update public.techniques set name = 'Hack' where id = '${TECH2}'`,
    );
    expect(update.affectedRows).toBe(0);
    const remove = await db.query(`delete from public.videos where id = '${VIDEO2}'`);
    expect(remove.affectedRows).toBe(0);
  });

  it("aluno não cria, altera nem exclui conteúdo da biblioteca", async () => {
    await asUser(S1);
    const update = await db.query(
      `update public.videos set title = 'Hack' where id = '${VIDEO1}'`,
    );
    expect(update.affectedRows).toBe(0);
    await expect(
      db.query(
        `insert into public.techniques (teacher_id, name) values ('${T1}', 'Técnica do aluno')`,
      ),
    ).rejects.toThrow(/row-level security/i);
    const remove = await db.query(`delete from public.techniques where id = '${TECH1}'`);
    expect(remove.affectedRows).toBe(0);
  });
});

describe("RLS — aulas", () => {
  it("aluno vê apenas aulas agendadas/concluídas dos próprios vínculos", async () => {
    await asUser(S1);
    const ids = (await rows<{ id: string }>("select id from public.lessons order by id")).map(
      (row) => row.id,
    );
    expect(ids).toEqual([LESSON1, LESSON2]);
  });

  it("aluno não vê aulas canceladas nem de outro aluno", async () => {
    await asUser(S2);
    const ids = (await rows<{ id: string }>("select id from public.lessons order by id")).map(
      (row) => row.id,
    );
    expect(ids).toEqual([LESSON4, LESSON5]);
    expect(await count(`select count(*) from public.lessons where id = '${LESSON3}'`)).toBe(0);
    expect(await count(`select count(*) from public.lessons where id = '${LESSON1}'`)).toBe(0);
  });

  it("professor vê todas as próprias aulas, inclusive canceladas", async () => {
    await asUser(T1);
    expect(await count("select count(*) from public.lessons")).toBe(4);
    expect(await count(`select count(*) from public.lessons where status = 'cancelled'`)).toBe(1);
  });

  it("aluno não altera status nem cria aulas", async () => {
    await asUser(S1);
    const update = await db.query(
      `update public.lessons set status = 'completed' where id = '${LESSON1}'`,
    );
    expect(update.affectedRows).toBe(0);
    await expect(
      db.query(
        `insert into public.lessons (teacher_id, enrollment_id, starts_at, ends_at) values ('${T1}', '${E1}', now(), now() + interval '1 hour')`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("professor não altera aula de outro professor", async () => {
    await asUser(T1);
    const update = await db.query(
      `update public.lessons set status = 'cancelled' where id = '${LESSON4}'`,
    );
    expect(update.affectedRows).toBe(0);
  });

  it("aluno vê apenas vídeos de aulas acessíveis e o professor vê os próprios", async () => {
    await asUser(S1);
    expect(await count("select count(*) from public.lesson_videos")).toBe(2);
    await asUser(T2);
    expect(await count("select count(*) from public.lesson_videos")).toBe(0);
  });

  it("anon não vê aulas nem vídeos de aula", async () => {
    await asUser(null, "anon");
    expect(await count("select count(*) from public.lessons")).toBe(0);
    expect(await count("select count(*) from public.lesson_videos")).toBe(0);
  });
});

describe("RLS — Google OAuth", () => {
  it("usuário lê apenas o próprio registro de tokens Google", async () => {
    await asUser(T1);
    const records = await rows<{ user_id: string }>(
      "select user_id from public.user_google_oauth",
    );
    expect(records.map((row) => row.user_id)).toEqual([T1]);
    expect(await count(`select count(*) from public.user_google_oauth where user_id = '${T2}'`)).toBe(0);
    expect(
      await count(
        `select count(*) from public.user_google_oauth where encrypted_access_token = 'cipher-access-t2'`,
      ),
    ).toBe(0);
  });

  it("usuário atualiza o próprio registro, mas não o de outro", async () => {
    await asUser(T1);
    const own = await db.query(
      `update public.user_google_oauth set last_token_refresh_at = now() where user_id = '${T1}'`,
    );
    expect(own.affectedRows).toBe(1);

    const other = await db.query(
      `update public.user_google_oauth set is_connected = false where user_id = '${T2}'`,
    );
    expect(other.affectedRows).toBe(0);

    await asPostgres();
    expect(
      await count(`select count(*) from public.user_google_oauth where user_id = '${T2}' and is_connected = true`),
    ).toBe(1);
  });

  it("usuário não insere registro Google para outro usuário", async () => {
    await asUser(T1);
    await expect(
      db.query(
        `insert into public.user_google_oauth
          (user_id, google_id, email, name, token_expiry_at)
         values ('${T2}', 'google-hack', 'hack@example.com', 'Hack', now() + interval '1 hour')`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("anon não vê registros Google", async () => {
    await asUser(null, "anon");
    expect(await count("select count(*) from public.user_google_oauth")).toBe(0);
    expect(await count("select count(*) from public.oauth_audit_logs")).toBe(0);
  });

  it("auditoria é visível apenas ao próprio usuário e não pode ser inserida pelo cliente", async () => {
    await asUser(T1);
    const logs = await rows<{ user_id: string; event: string }>(
      "select user_id, event from public.oauth_audit_logs",
    );
    expect(logs).toEqual([{ user_id: T1, event: "google_connected" }]);

    await expect(
      db.query(
        `insert into public.oauth_audit_logs (user_id, event, success)
         values ('${T1}', 'google_login', true)`,
      ),
    ).rejects.toThrow();
  });

  it("tabela de authorization codes usados não é acessível ao cliente", async () => {
    await asUser(T1);
    await expect(
      db.query("select * from public.oauth_used_authorization_codes"),
    ).rejects.toThrow();
  });
});

describe("RLS — Google Drive Video Storage", () => {
  it("cada usuário vê apenas seus próprios tokens do Drive", async () => {
    await asUser(T1);
    const tokens = await rows<{ user_id: string }>(
      "select user_id from public.providers_oauth_tokens",
    );
    expect(tokens.map((row) => row.user_id)).toEqual([T1]);
    expect(
      await count(`select count(*) from public.providers_oauth_tokens where user_id = '${T2}'`),
    ).toBe(0);
  });

  it("configuração de pastas é isolada por usuário e não permite escrita para outro", async () => {
    await asUser(T1);
    const configs = await rows<{ user_id: string; root_folder_id: string }>(
      "select user_id, root_folder_id from public.video_storage_config",
    );
    expect(configs).toEqual([{ user_id: T1, root_folder_id: "root-t1" }]);

    const own = await db.query(
      `update public.video_storage_config set last_sync_at = now() where user_id = '${T1}'`,
    );
    expect(own.affectedRows).toBe(1);
    const other = await db.query(
      `update public.video_storage_config set root_folder_id = 'hack' where user_id = '${T2}'`,
    );
    expect(other.affectedRows).toBe(0);

    await expect(
      db.query(
        `insert into public.video_storage_config
          (user_id, root_folder_id, library_folder_id, archive_folder_id)
         values ('${T2}', 'r', 'l', 'a')`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("mapeamentos de pastas e sessões de upload são isolados", async () => {
    await asUser(T1);
    const folders = await rows<{ user_id: string }>(
      "select user_id from public.drive_folder_mappings",
    );
    expect(folders.map((row) => row.user_id)).toEqual([T1]);
    const uploads = await rows<{ user_id: string }>(
      "select user_id from public.video_upload_sessions",
    );
    expect(uploads.map((row) => row.user_id)).toEqual([T1]);
    const jobs = await rows<{ user_id: string }>(
      "select user_id from public.video_migration_jobs",
    );
    expect(jobs.map((row) => row.user_id)).toEqual([T1]);
  });

  it("instrutor vê auditoria dos próprios vídeos; aluno vê apenas os próprios acessos", async () => {
    await asUser(T1);
    const teacherLogs = await rows<{ video_id: string; user_id: string }>(
      "select video_id, user_id from public.video_access_audit order by id",
    );
    expect(teacherLogs).toEqual([{ video_id: VIDEO1, user_id: S1 }]);

    await asUser(S1);
    const studentLogs = await rows<{ video_id: string; user_id: string }>(
      "select video_id, user_id from public.video_access_audit order by id",
    );
    expect(studentLogs).toEqual([{ video_id: VIDEO1, user_id: S1 }]);

    await asUser(T2);
    const otherTeacher = await rows<{ video_id: string }>(
      "select video_id from public.video_access_audit",
    );
    expect(otherTeacher).toEqual([{ video_id: VIDEO2 }]);
  });

  it("cliente não insere auditoria diretamente", async () => {
    await asUser(T1);
    await expect(
      db.query(
        `insert into public.video_access_audit (video_id, user_id, action)
         values ('${VIDEO1}', '${T1}', 'playback')`,
      ),
    ).rejects.toThrow();
  });

  it("dono de vídeo pessoal vê o próprio vídeo; outro usuário não", async () => {
    await asUser(S1);
    const own = await rows<{ id: string }>(
      `select id from public.videos where id = '${PERSONAL_VIDEO}'`,
    );
    expect(own).toEqual([{ id: PERSONAL_VIDEO }]);

    await asUser(T2);
    expect(
      await count(`select count(*) from public.videos where id = '${PERSONAL_VIDEO}'`),
    ).toBe(0);
  });

  it("anon não vê tokens, configs, auditoria ou sessões do Drive", async () => {
    await asUser(null, "anon");
    expect(await count("select count(*) from public.providers_oauth_tokens")).toBe(0);
    expect(await count("select count(*) from public.video_storage_config")).toBe(0);
    expect(await count("select count(*) from public.video_access_audit")).toBe(0);
    expect(await count("select count(*) from public.video_upload_sessions")).toBe(0);
    expect(await count("select count(*) from public.video_migration_jobs")).toBe(0);
  });
});
