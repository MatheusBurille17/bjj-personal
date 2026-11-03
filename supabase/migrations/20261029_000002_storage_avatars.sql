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
