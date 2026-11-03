-- =============================================================================
-- Google Drive Video Storage
-- =============================================================================
-- Complementa as migrações:
--   20261029_000001_initial_schema.sql
--   20261103_000003_google_oauth.sql
-- O runtime local equivalente está em `lib/db/schema.ts`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tokens OAuth por usuário (instrutor ou aluno)
-- -----------------------------------------------------------------------------
create table if not exists public.providers_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  provider text not null default 'google_drive' check (provider = 'google_drive'),
  encrypted_access_token text not null default '',
  encrypted_refresh_token text not null default '',
  token_iv text not null default '',
  expires_at timestamptz not null,
  scope text not null default '',
  drive_id text not null default '',
  google_email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_providers_oauth_tokens_user
  on public.providers_oauth_tokens(user_id);

drop trigger if exists update_providers_oauth_tokens_updated_at on public.providers_oauth_tokens;
create trigger update_providers_oauth_tokens_updated_at
  before update on public.providers_oauth_tokens
  for each row execute function public.update_updated_at_column();

alter table public.providers_oauth_tokens enable row level security;

drop policy if exists "providers_oauth_tokens: own" on public.providers_oauth_tokens;
create policy "providers_oauth_tokens: own" on public.providers_oauth_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Tokens são criptografados; ainda assim, o cliente só precisa do status.
grant select, insert, update, delete on public.providers_oauth_tokens to authenticated;

-- -----------------------------------------------------------------------------
-- Configuração de pastas do Drive por usuário
-- -----------------------------------------------------------------------------
create table if not exists public.video_storage_config (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  provider text not null default 'google_drive' check (provider = 'google_drive'),
  root_folder_id text not null,
  library_folder_id text not null,
  archive_folder_id text not null,
  personal_folder_id text,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_video_storage_config_user
  on public.video_storage_config(user_id);

drop trigger if exists update_video_storage_config_updated_at on public.video_storage_config;
create trigger update_video_storage_config_updated_at
  before update on public.video_storage_config
  for each row execute function public.update_updated_at_column();

alter table public.video_storage_config enable row level security;

drop policy if exists "video_storage_config: own" on public.video_storage_config;
create policy "video_storage_config: own" on public.video_storage_config
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.video_storage_config to authenticated;

-- -----------------------------------------------------------------------------
-- Mapeamento de pastas do Drive
-- -----------------------------------------------------------------------------
create table if not exists public.drive_folder_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_type text not null
    check (folder_type in ('root', 'library', 'technique', 'module', 'archive', 'personal')),
  entity_id text,
  folder_name text not null,
  google_drive_folder_id text not null,
  parent_folder_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_drive_folder_mappings_entity
  on public.drive_folder_mappings(user_id, folder_type, entity_id);

create index if not exists idx_drive_folder_mappings_user
  on public.drive_folder_mappings(user_id);

alter table public.drive_folder_mappings enable row level security;

drop policy if exists "drive_folder_mappings: own" on public.drive_folder_mappings;
create policy "drive_folder_mappings: own" on public.drive_folder_mappings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.drive_folder_mappings to authenticated;

-- -----------------------------------------------------------------------------
-- Extensão da tabela videos (antes da auditoria, que referencia owner_id)
-- -----------------------------------------------------------------------------
alter table public.videos
  add column if not exists drive_file_url text,
  add column if not exists metadata_synced_at timestamptz,
  add column if not exists size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  add column if not exists archived_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists owner_id uuid references auth.users(id) on delete set null,
  add column if not exists owner_role text check (owner_role is null or owner_role in ('teacher', 'student')),
  add column if not exists visibility text not null default 'library'
    check (visibility in ('library', 'personal')),
  add column if not exists mux_id text;

-- Vídeos pessoais não pertencem a um módulo/técnica nem necessariamente a um professor.
alter table public.videos alter column module_id drop not null;
alter table public.videos alter column technique_id drop not null;
alter table public.videos alter column teacher_id drop not null;

update public.videos
set owner_id = teacher_id,
    owner_role = 'teacher',
    visibility = coalesce(visibility, 'library')
where owner_id is null;

create index if not exists idx_videos_owner on public.videos(owner_id);
create index if not exists idx_videos_visibility on public.videos(visibility);

drop policy if exists "videos: owner all" on public.videos;
create policy "videos: owner all" on public.videos
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Auditoria de acesso a vídeos
-- -----------------------------------------------------------------------------
create table if not exists public.video_access_audit (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  accessed_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  action text not null default 'playback'
    check (action in ('playback', 'share', 'upload', 'delete', 'migrate')),
  success boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_video_access_audit_video
  on public.video_access_audit(video_id, accessed_at desc);

create index if not exists idx_video_access_audit_user
  on public.video_access_audit(user_id, accessed_at desc);

alter table public.video_access_audit enable row level security;

drop policy if exists "video_access_audit: select own or owned video" on public.video_access_audit;
create policy "video_access_audit: select own or owned video" on public.video_access_audit
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.videos v
      where v.id = video_access_audit.video_id
        and (v.teacher_id = auth.uid() or v.owner_id = auth.uid())
    )
  );

grant select on public.video_access_audit to authenticated;

-- -----------------------------------------------------------------------------
-- Sessões de upload em chunks (metadados; chunks ficam em storage temporário)
-- -----------------------------------------------------------------------------
create table if not exists public.video_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  destination text not null check (destination in ('library', 'personal')),
  title text not null,
  description text,
  technique_id uuid,
  module_id uuid,
  file_name text not null,
  mime_type text not null,
  total_bytes bigint not null check (total_bytes >= 0),
  chunk_size integer not null check (chunk_size > 0),
  total_chunks integer not null check (total_chunks > 0),
  received_chunks integer[] not null default '{}',
  drive_session_url text,
  status text not null default 'initialized'
    check (status in ('initialized', 'uploading', 'completed', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_video_upload_sessions_user
  on public.video_upload_sessions(user_id, created_at desc);

alter table public.video_upload_sessions enable row level security;

drop policy if exists "video_upload_sessions: own" on public.video_upload_sessions;
create policy "video_upload_sessions: own" on public.video_upload_sessions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.video_upload_sessions to authenticated;

-- -----------------------------------------------------------------------------
-- Jobs de migração Mux → Google Drive
-- -----------------------------------------------------------------------------
create table if not exists public.video_migration_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  total_videos integer not null default 0,
  processed_videos integer not null default 0,
  failed_videos integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_video_migration_jobs_user
  on public.video_migration_jobs(user_id, created_at desc);

alter table public.video_migration_jobs enable row level security;

drop policy if exists "video_migration_jobs: own" on public.video_migration_jobs;
create policy "video_migration_jobs: own" on public.video_migration_jobs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.video_migration_jobs to authenticated;

-- Sem policies para anon, o RLS retorna zero linhas; os grants permitem que
-- consultas do cliente anônimo sejam avaliadas (e negadas) pelo RLS.
grant select on public.providers_oauth_tokens to anon;
grant select on public.video_storage_config to anon;
grant select on public.drive_folder_mappings to anon;
grant select on public.video_access_audit to anon;
grant select on public.video_upload_sessions to anon;
grant select on public.video_migration_jobs to anon;

-- -----------------------------------------------------------------------------
-- service_role
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on public.providers_oauth_tokens to service_role';
    execute 'grant all on public.video_storage_config to service_role';
    execute 'grant all on public.drive_folder_mappings to service_role';
    execute 'grant all on public.video_access_audit to service_role';
    execute 'grant all on public.video_upload_sessions to service_role';
    execute 'grant all on public.video_migration_jobs to service_role';
  end if;
end $$;
