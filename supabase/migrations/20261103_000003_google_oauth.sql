-- =============================================================================
-- Google Social Authentication — tokens OAuth, auditoria e uso único de codes
-- =============================================================================
-- Complementa `20261029_000001_initial_schema.sql`.
-- O runtime local equivalente está em `lib/db/schema.ts` e
-- `lib/services/google-auth.service.ts`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tokens Google por usuário
-- -----------------------------------------------------------------------------
create table if not exists public.user_google_oauth (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  google_id text not null,
  email text not null,
  name text not null,
  picture_url text,
  encrypted_access_token text not null default '',
  encrypted_refresh_token text not null default '',
  -- Formato: <iv-access-token>:<iv-refresh-token> (ambos Base64).
  -- IVs independentes evitam reutilização de nonce no AES-GCM.
  token_iv text not null default '',
  token_expiry_at timestamptz not null,
  is_connected boolean not null default false,
  scopes_granted text[] not null default '{}',
  consent_timestamp timestamptz not null default now(),
  last_token_refresh_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_user_google_oauth_user_id
  on public.user_google_oauth(user_id);

create index if not exists idx_user_google_oauth_google_id
  on public.user_google_oauth(google_id);

create index if not exists idx_user_google_oauth_connected
  on public.user_google_oauth(is_connected)
  where is_connected = true;

create index if not exists idx_user_google_oauth_email
  on public.user_google_oauth(lower(email));

drop trigger if exists update_user_google_oauth_updated_at on public.user_google_oauth;
create trigger update_user_google_oauth_updated_at
  before update on public.user_google_oauth
  for each row execute function public.update_updated_at_column();

alter table public.user_google_oauth enable row level security;

drop policy if exists "user_google_oauth: select own" on public.user_google_oauth;
create policy "user_google_oauth: select own" on public.user_google_oauth
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_google_oauth: insert own" on public.user_google_oauth;
create policy "user_google_oauth: insert own" on public.user_google_oauth
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user_google_oauth: update own" on public.user_google_oauth;
create policy "user_google_oauth: update own" on public.user_google_oauth
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "user_google_oauth: delete own" on public.user_google_oauth;
create policy "user_google_oauth: delete own" on public.user_google_oauth
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.user_google_oauth to authenticated;
grant select on public.user_google_oauth to anon;

-- -----------------------------------------------------------------------------
-- Auditoria do fluxo OAuth (sem tokens, códigos ou segredos)
-- -----------------------------------------------------------------------------
create table if not exists public.oauth_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event text not null,
  success boolean not null default true,
  ip text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_oauth_audit_logs_user
  on public.oauth_audit_logs(user_id, created_at desc);

create index if not exists idx_oauth_audit_logs_event
  on public.oauth_audit_logs(event, created_at desc);

alter table public.oauth_audit_logs enable row level security;

drop policy if exists "oauth_audit_logs: select own" on public.oauth_audit_logs;
create policy "oauth_audit_logs: select own" on public.oauth_audit_logs
  for select to authenticated
  using (user_id = auth.uid());

-- Somente o servidor (service_role) grava auditoria; usuários não inserem,
-- alteram nem excluem logs diretamente.
grant select on public.oauth_audit_logs to authenticated, anon;

-- -----------------------------------------------------------------------------
-- Uso único de authorization codes (defesa adicional ao enforcement do Google)
-- -----------------------------------------------------------------------------
create table if not exists public.oauth_used_authorization_codes (
  id uuid primary key default gen_random_uuid(),
  -- SHA-256 do código; o valor em claro nunca é persistido.
  code_hash text not null unique,
  user_id uuid references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_oauth_used_codes_expiry
  on public.oauth_used_authorization_codes(expires_at);

alter table public.oauth_used_authorization_codes enable row level security;
-- Nenhuma policy/grant para authenticated/anon: tabela exclusiva do servidor.

-- -----------------------------------------------------------------------------
-- Privilégios do service role (quando o papel existir, como no Supabase)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on public.user_google_oauth to service_role';
    execute 'grant all on public.oauth_audit_logs to service_role';
    execute 'grant all on public.oauth_used_authorization_codes to service_role';
    execute 'grant usage, select on all sequences in schema public to service_role';
  end if;
end $$;
