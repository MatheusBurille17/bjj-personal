-- =============================================================================
-- Funções públicas para o fluxo de convite
-- =============================================================================
-- O convite é aberto por alguém que ainda não está autenticado, então a leitura
-- do convite e a ativação do vínculo precisam de funções `security definer`
-- restritas ao token. Sem elas, o RLS impediria o aluno de ver o professor e de
-- ativar o próprio vínculo.
-- =============================================================================

create or replace function public.get_invite(p_token text)
returns table (
  enrollment_id uuid,
  teacher_id uuid,
  teacher_name text,
  student_email text,
  student_name text,
  invite_expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.teacher_id,
    t.display_name,
    e.student_email,
    e.student_name,
    e.invite_expires_at
  from public.enrollments e
  join public.teachers t on t.id = e.teacher_id
  where e.invite_token = p_token
    and e.status = 'pending';
$$;

revoke all on function public.get_invite(text) from public;
grant execute on function public.get_invite(text) to anon, authenticated;

create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED';
  end if;

  update public.enrollments
     set status = 'active',
         student_profile_id = auth.uid(),
         invite_token = null,
         invite_expires_at = null
   where invite_token = p_token
     and status = 'pending'
     and invite_expires_at > now()
  returning id into v_enrollment_id;

  if v_enrollment_id is null then
    raise exception 'INVITE_INVALID';
  end if;

  return v_enrollment_id;
end;
$$;

revoke all on function public.accept_invite(text) from public;
grant execute on function public.accept_invite(text) to authenticated;
