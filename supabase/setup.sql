-- =============================================================================
-- Jiu-Jitsu App - schema completo (gerado a partir de supabase/migrations)
--
-- Opcao 1: cole este arquivo no SQL Editor do Supabase e execute.
-- Opcao 2: npx supabase db push --db-url "postgresql://postgres:SENHA@db.SEU_REF.supabase.co:5432/postgres"
-- =============================================================================

begin;

-- >>> 20261029000001_initial_schema.sql

-- =============================================================================
-- Jiu-Jitsu App — schema inicial
-- =============================================================================
-- Este arquivo representa o modelo de produção no Supabase/PostgreSQL.
-- O ambiente de demonstração local usa o repositório JSON em `lib/db` com o
-- mesmo modelo de domínio, para permitir execução sem credenciais externas.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Funções utilitárias
-- -----------------------------------------------------------------------------
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Perfis e professores
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) >= 2),
  email text not null unique,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_email on public.profiles(email);

create table if not exists public.teachers (
  id uuid primary key references public.profiles(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) >= 2),
  timezone text not null default 'America/Sao_Paulo',
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists update_profiles_updated_at on public.profiles;
create trigger update_profiles_updated_at before update on public.profiles
for each row execute function public.update_updated_at_column();

drop trigger if exists update_teachers_updated_at on public.teachers;
create trigger update_teachers_updated_at before update on public.teachers
for each row execute function public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- Vínculos (enrollments) — fronteira central de isolamento
-- -----------------------------------------------------------------------------
create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  student_profile_id uuid references public.profiles(id) on delete set null,
  student_name text not null check (char_length(trim(student_name)) >= 2),
  student_email text not null,
  student_phone text,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'paused', 'archived')),
  started_at timestamptz not null default now(),
  archived_at timestamptz,
  private_notes text check (private_notes is null or char_length(private_notes) <= 5000),
  invite_token text,
  invite_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_enrollments_teacher_email_active
  on public.enrollments(teacher_id, lower(student_email))
  where status in ('active', 'pending');

create index if not exists idx_enrollments_teacher on public.enrollments(teacher_id);
create index if not exists idx_enrollments_student on public.enrollments(student_profile_id);
create index if not exists idx_enrollments_status on public.enrollments(status);
create index if not exists idx_enrollments_email on public.enrollments(lower(student_email));
create index if not exists idx_enrollments_invite on public.enrollments(invite_token);

drop trigger if exists update_enrollments_updated_at on public.enrollments;
create trigger update_enrollments_updated_at before update on public.enrollments
for each row execute function public.update_updated_at_column();

-- Visão segura para o aluno: nunca inclui private_notes.
create or replace view public.student_enrollments
with (security_invoker = true) as
select
  id, teacher_id, student_profile_id, student_name, student_email, student_phone,
  status, started_at, archived_at, created_at, updated_at
from public.enrollments
where student_profile_id = auth.uid();

-- Visão do professor com as observações privadas. É "security definer" para
-- contornar a revogação da coluna private_notes, mas o WHERE garante que cada
-- professor só enxerga os próprios vínculos.
create or replace view public.teacher_enrollments
with (security_invoker = false) as
select * from public.enrollments where teacher_id = auth.uid();

alter view public.teacher_enrollments owner to postgres;

-- -----------------------------------------------------------------------------
-- Biblioteca: técnicas → módulos → vídeos
-- -----------------------------------------------------------------------------
create table if not exists public.techniques (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  name text not null check (char_length(trim(name)) >= 2),
  description text,
  category text,
  sort_order integer not null default 0 check (sort_order >= 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_techniques_teacher on public.techniques(teacher_id);
create index if not exists idx_techniques_order on public.techniques(teacher_id, sort_order);

create table if not exists public.modules (
  id uuid primary key default gen_random_uuid(),
  technique_id uuid not null references public.techniques(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  name text not null check (char_length(trim(name)) >= 2),
  description text,
  sort_order integer not null default 0 check (sort_order >= 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_modules_technique on public.modules(technique_id);
create index if not exists idx_modules_teacher on public.modules(teacher_id);

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete restrict,
  technique_id uuid not null references public.techniques(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 200),
  description text check (description is null or char_length(description) <= 2000),
  provider text not null default 'mux',
  provider_video_id text not null,
  thumbnail_url text,
  playback_url text,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  status text not null default 'uploading'
    check (status in ('uploading', 'processing', 'ready', 'error', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_videos_module on public.videos(module_id);
create index if not exists idx_videos_teacher on public.videos(teacher_id);
create index if not exists idx_videos_provider on public.videos(provider_video_id);
create index if not exists idx_videos_status on public.videos(status);

-- -----------------------------------------------------------------------------
-- Planos mensais
-- -----------------------------------------------------------------------------
create table if not exists public.monthly_plans (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 200),
  description text check (description is null or char_length(description) <= 2000),
  objective text check (objective is null or char_length(objective) <= 1000),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_plans_period_check check (period_end >= period_start)
);

create index if not exists idx_monthly_plans_teacher on public.monthly_plans(teacher_id);
create index if not exists idx_monthly_plans_period on public.monthly_plans(period_start desc);
create index if not exists idx_monthly_plans_status on public.monthly_plans(status);

create table if not exists public.plan_days (
  id uuid primary key default gen_random_uuid(),
  monthly_plan_id uuid not null references public.monthly_plans(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  weekday smallint check (weekday is null or weekday between 0 and 6),
  planned_date date,
  title text not null check (char_length(trim(title)) between 2 and 200),
  objective text check (objective is null or char_length(objective) <= 1000),
  notes text check (notes is null or char_length(notes) <= 2000),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_days_weekday_or_date_check check (weekday is not null or planned_date is not null)
);

create index if not exists idx_plan_days_plan on public.plan_days(monthly_plan_id, sort_order);
create index if not exists idx_plan_days_teacher on public.plan_days(teacher_id);

create table if not exists public.plan_day_videos (
  id uuid primary key default gen_random_uuid(),
  plan_day_id uuid not null references public.plan_days(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete restrict,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (plan_day_id, video_id)
);

create table if not exists public.plan_enrollments (
  id uuid primary key default gen_random_uuid(),
  monthly_plan_id uuid not null references public.monthly_plans(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  published_at timestamptz not null default now(),
  unique (monthly_plan_id, enrollment_id)
);

create index if not exists idx_plan_enrollments_plan on public.plan_enrollments(monthly_plan_id);
create index if not exists idx_plan_enrollments_enrollment on public.plan_enrollments(enrollment_id);

-- -----------------------------------------------------------------------------
-- Agenda: horários recorrentes e aulas concretas
-- -----------------------------------------------------------------------------
create table if not exists public.weekly_slots (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  valid_from date not null default current_date,
  valid_until date,
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_slots_time_check check (end_time > start_time),
  constraint weekly_slots_validity_check check (valid_until is null or valid_until >= valid_from)
);

create index if not exists idx_weekly_slots_teacher on public.weekly_slots(teacher_id);
create index if not exists idx_weekly_slots_enrollment on public.weekly_slots(enrollment_id);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  plan_day_id uuid references public.plan_days(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  completed_at timestamptz,
  shared_notes text check (shared_notes is null or char_length(shared_notes) <= 5000),
  private_notes text check (private_notes is null or char_length(private_notes) <= 5000),
  title_snapshot text,
  objective_snapshot text,
  rescheduled_from_id uuid references public.lessons(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lessons_time_check check (ends_at > starts_at)
);

create index if not exists idx_lessons_teacher on public.lessons(teacher_id);
create index if not exists idx_lessons_enrollment on public.lessons(enrollment_id);
create index if not exists idx_lessons_starts on public.lessons(starts_at);
create index if not exists idx_lessons_status on public.lessons(status);
create index if not exists idx_lessons_plan_day on public.lessons(plan_day_id);

create table if not exists public.lesson_videos (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete restrict,
  video_id uuid not null references public.videos(id) on delete restrict,
  source text not null default 'manual' check (source in ('plan', 'manual')),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (lesson_id, video_id)
);

create index if not exists idx_lesson_videos_lesson on public.lesson_videos(lesson_id);

-- -----------------------------------------------------------------------------
-- Permissões explícitas de biblioteca
-- -----------------------------------------------------------------------------
create table if not exists public.student_technique_access (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  technique_id uuid references public.techniques(id) on delete cascade,
  module_id uuid references public.modules(id) on delete cascade,
  video_id uuid references public.videos(id) on delete cascade,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint student_technique_access_scope_check check (
    (technique_id is not null)::int + (module_id is not null)::int + (video_id is not null)::int = 1
  )
);

create index if not exists idx_access_enrollment on public.student_technique_access(enrollment_id);
create index if not exists idx_access_teacher on public.student_technique_access(teacher_id);

-- -----------------------------------------------------------------------------
-- Triggers de updated_at nas tabelas restantes
-- -----------------------------------------------------------------------------
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'modules', 'videos', 'monthly_plans', 'plan_days', 'weekly_slots', 'lessons'
  ]
  loop
    execute format('drop trigger if exists update_%s_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger update_%s_updated_at before update on public.%I for each row execute function public.update_updated_at_column()',
      table_name,
      table_name
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Função auxiliar para evitar recursão entre políticas de planos e vínculos
-- -----------------------------------------------------------------------------
create or replace function public.student_has_plan(plan_id uuid, user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.monthly_plans mp
    join public.plan_enrollments pe on pe.monthly_plan_id = mp.id
    join public.enrollments e on e.id = pe.enrollment_id
    where mp.id = plan_id
      and mp.status = 'published'
      and e.student_profile_id = user_id
      and e.status = 'active'
  );
$$;

revoke all on function public.student_has_plan(uuid, uuid) from public;
grant execute on function public.student_has_plan(uuid, uuid) to authenticated, anon;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.teachers enable row level security;
alter table public.enrollments enable row level security;
alter table public.techniques enable row level security;
alter table public.modules enable row level security;
alter table public.videos enable row level security;
alter table public.monthly_plans enable row level security;
alter table public.plan_days enable row level security;
alter table public.plan_day_videos enable row level security;
alter table public.plan_enrollments enable row level security;
alter table public.weekly_slots enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_videos enable row level security;
alter table public.student_technique_access enable row level security;

-- Perfis -------------------------------------------------------------------
drop policy if exists "profiles: own select" on public.profiles;
create policy "profiles: own select" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles: teacher can view enrolled students" on public.profiles;
create policy "profiles: teacher can view enrolled students" on public.profiles
  for select using (
    exists (
      select 1 from public.enrollments e
      where e.student_profile_id = profiles.id
        and e.teacher_id = auth.uid()
    )
  );

drop policy if exists "profiles: own update" on public.profiles;
create policy "profiles: own update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles: own insert" on public.profiles;
create policy "profiles: own insert" on public.profiles
  for insert with check (auth.uid() = id);

-- Professores --------------------------------------------------------------
drop policy if exists "teachers: own select" on public.teachers;
create policy "teachers: own select" on public.teachers
  for select using (auth.uid() = id);

drop policy if exists "teachers: students see enrolled teacher" on public.teachers;
create policy "teachers: students see enrolled teacher" on public.teachers
  for select using (
    exists (
      select 1 from public.enrollments e
      where e.teacher_id = teachers.id
        and e.student_profile_id = auth.uid()
        and e.status = 'active'
    )
  );

drop policy if exists "teachers: own update" on public.teachers;
create policy "teachers: own update" on public.teachers
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "teachers: own insert" on public.teachers;
create policy "teachers: own insert" on public.teachers
  for insert with check (auth.uid() = id);

-- Vínculos ---------------------------------------------------------------
drop policy if exists "enrollments: teacher all" on public.enrollments;
create policy "enrollments: teacher all" on public.enrollments
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists "enrollments: student select own" on public.enrollments;
create policy "enrollments: student select own" on public.enrollments
  for select using (student_profile_id = auth.uid());

-- Técnicas ---------------------------------------------------------------
drop policy if exists "techniques: teacher all" on public.techniques;
create policy "techniques: teacher all" on public.techniques
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists "techniques: student select authorized" on public.techniques;
create policy "techniques: student select authorized" on public.techniques
  for select using (
    status = 'active'
    and exists (
      select 1
      from public.student_technique_access a
      join public.enrollments e on e.id = a.enrollment_id
      where a.technique_id = techniques.id
        and a.revoked_at is null
        and e.student_profile_id = auth.uid()
        and e.status = 'active'
    )
  );

-- Módulos ----------------------------------------------------------------
drop policy if exists "modules: teacher all" on public.modules;
create policy "modules: teacher all" on public.modules
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists "modules: student select authorized" on public.modules;
create policy "modules: student select authorized" on public.modules
  for select using (
    status = 'active'
    and exists (
      select 1
      from public.student_technique_access a
      join public.enrollments e on e.id = a.enrollment_id
      where a.technique_id = modules.technique_id
        and a.revoked_at is null
        and e.student_profile_id = auth.uid()
        and e.status = 'active'
    )
  );

-- Vídeos -----------------------------------------------------------------
drop policy if exists "videos: teacher all" on public.videos;
create policy "videos: teacher all" on public.videos
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists "videos: student select authorized" on public.videos;
create policy "videos: student select authorized" on public.videos
  for select using (
    status <> 'archived'
    and (
      exists (
        select 1
        from public.student_technique_access a
        join public.enrollments e on e.id = a.enrollment_id
        where a.technique_id = videos.technique_id
          and a.revoked_at is null
          and e.student_profile_id = auth.uid()
          and e.status = 'active'
      )
      or exists (
        select 1
        from public.lesson_videos lv
        join public.lessons l on l.id = lv.lesson_id
        join public.enrollments e on e.id = l.enrollment_id
        where lv.video_id = videos.id
          and e.student_profile_id = auth.uid()
          and e.status = 'active'
          and l.status in ('scheduled', 'completed')
      )
      or exists (
        select 1
        from public.plan_day_videos pdv
        join public.plan_days pd on pd.id = pdv.plan_day_id
        join public.plan_enrollments pe on pe.monthly_plan_id = pd.monthly_plan_id
        join public.monthly_plans mp on mp.id = pd.monthly_plan_id
        join public.enrollments e on e.id = pe.enrollment_id
        where pdv.video_id = videos.id
          and mp.status = 'published'
          and e.student_profile_id = auth.uid()
          and e.status = 'active'
      )
    )
  );

-- Planos -----------------------------------------------------------------
drop policy if exists "monthly_plans: teacher all" on public.monthly_plans;
create policy "monthly_plans: teacher all" on public.monthly_plans
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists "monthly_plans: student select published" on public.monthly_plans;
create policy "monthly_plans: student select published" on public.monthly_plans
  for select using (
    status = 'published'
    and public.student_has_plan(id, auth.uid())
  );

drop policy if exists "plan_days: teacher all" on public.plan_days;
create policy "plan_days: teacher all" on public.plan_days
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists "plan_days: student select published" on public.plan_days;
create policy "plan_days: student select published" on public.plan_days
  for select using (
    public.student_has_plan(monthly_plan_id, auth.uid())
  );

drop policy if exists "plan_day_videos: teacher all" on public.plan_day_videos;
create policy "plan_day_videos: teacher all" on public.plan_day_videos
  for all using (
    exists (
      select 1 from public.plan_days pd
      where pd.id = plan_day_videos.plan_day_id and pd.teacher_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.plan_days pd
      where pd.id = plan_day_videos.plan_day_id and pd.teacher_id = auth.uid()
    )
  );

drop policy if exists "plan_day_videos: student select published" on public.plan_day_videos;
create policy "plan_day_videos: student select published" on public.plan_day_videos
  for select using (
    exists (
      select 1
      from public.plan_days pd
      where pd.id = plan_day_videos.plan_day_id
        and public.student_has_plan(pd.monthly_plan_id, auth.uid())
    )
  );

drop policy if exists "plan_enrollments: teacher all" on public.plan_enrollments;
create policy "plan_enrollments: teacher all" on public.plan_enrollments
  for all using (
    exists (
      select 1 from public.monthly_plans mp
      where mp.id = plan_enrollments.monthly_plan_id and mp.teacher_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.monthly_plans mp
      where mp.id = plan_enrollments.monthly_plan_id and mp.teacher_id = auth.uid()
    )
  );

drop policy if exists "plan_enrollments: student select own" on public.plan_enrollments;
create policy "plan_enrollments: student select own" on public.plan_enrollments
  for select using (
    exists (
      select 1 from public.enrollments e
      where e.id = plan_enrollments.enrollment_id
        and e.student_profile_id = auth.uid()
    )
  );

-- Horários e aulas --------------------------------------------------------
drop policy if exists "weekly_slots: teacher all" on public.weekly_slots;
create policy "weekly_slots: teacher all" on public.weekly_slots
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists "weekly_slots: student select own" on public.weekly_slots;
create policy "weekly_slots: student select own" on public.weekly_slots
  for select using (
    exists (
      select 1 from public.enrollments e
      where e.id = weekly_slots.enrollment_id
        and e.student_profile_id = auth.uid()
        and e.status = 'active'
    )
  );

drop policy if exists "lessons: teacher all" on public.lessons;
create policy "lessons: teacher all" on public.lessons
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists "lessons: student select own" on public.lessons;
create policy "lessons: student select own" on public.lessons
  for select using (
    status in ('scheduled', 'completed')
    and exists (
      select 1 from public.enrollments e
      where e.id = lessons.enrollment_id
        and e.student_profile_id = auth.uid()
        and e.status = 'active'
    )
  );

drop policy if exists "lesson_videos: teacher all" on public.lesson_videos;
create policy "lesson_videos: teacher all" on public.lesson_videos
  for all using (
    exists (
      select 1 from public.lessons l
      where l.id = lesson_videos.lesson_id and l.teacher_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.lessons l
      where l.id = lesson_videos.lesson_id and l.teacher_id = auth.uid()
    )
  );

drop policy if exists "lesson_videos: student select own" on public.lesson_videos;
create policy "lesson_videos: student select own" on public.lesson_videos
  for select using (
    exists (
      select 1
      from public.lessons l
      join public.enrollments e on e.id = l.enrollment_id
      where l.id = lesson_videos.lesson_id
        and l.status in ('scheduled', 'completed')
        and e.student_profile_id = auth.uid()
        and e.status = 'active'
    )
  );

drop policy if exists "student_technique_access: teacher all" on public.student_technique_access;
create policy "student_technique_access: teacher all" on public.student_technique_access
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists "student_technique_access: student select own" on public.student_technique_access;
create policy "student_technique_access: student select own" on public.student_technique_access
  for select using (
    exists (
      select 1 from public.enrollments e
      where e.id = student_technique_access.enrollment_id
        and e.student_profile_id = auth.uid()
        and e.status = 'active'
    )
  );

-- -----------------------------------------------------------------------------
-- Proteção da coluna private_notes
-- -----------------------------------------------------------------------------
-- RLS filtra linhas, não colunas. Para impedir que o aluno leia private_notes
-- por uma consulta direta, a coluna é revogada do papel authenticated/anon.
-- Consultas de aluno usam student_enrollments; professores usam
-- teacher_enrollments (security definer) ou o cliente service role no servidor.
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;

revoke select on public.enrollments from authenticated, anon;

grant select (
  id, teacher_id, student_profile_id, student_name, student_email, student_phone,
  status, started_at, archived_at, invite_token, invite_expires_at, created_at, updated_at
) on public.enrollments to authenticated, anon;

grant select on public.student_enrollments to authenticated;
grant select on public.teacher_enrollments to authenticated;

-- >>> 20261029000002_storage_avatars.sql

-- Bucket de avatares e políticas de acesso ao Storage.
-- O arquivo original é privado; a aplicação gera URLs assinadas ou data URLs
-- apenas para o próprio usuário.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars: user can upload own" on storage.objects;
create policy "avatars: user can upload own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars: user can update own" on storage.objects;
create policy "avatars: user can update own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars: user can delete own" on storage.objects;
create policy "avatars: user can delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars: authenticated can read" on storage.objects;
create policy "avatars: authenticated can read" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');

-- >>> 20261103000003_google_oauth.sql

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

-- >>> 20261103000004_google_drive_video_storage.sql

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

commit;
