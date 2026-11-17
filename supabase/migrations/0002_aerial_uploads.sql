-- Aerial shots for Starwild Cartographer.
-- Apply after 0001_points.sql, in the Supabase SQL editor or with the CLI,
-- against the Bolt project in js/config.js. Do not put the service role key
-- or the webhook secrets in the site.
--
-- Storage: private bucket aerial-uploads. An admin may insert an object only
-- under their own user-id folder. There is no select policy for anon or
-- authenticated. Reads are signed URLs created by the service role, or the
-- service role itself.
--
-- aerial_uploads: an admin inserts a row as themselves, with status pending.
-- An admin can read their own rows. Status, processed_summary, and
-- processed_at change only for an admin (their own row) or the service role.
-- Authorization reads app_metadata. Do not read the user-editable metadata claim.
--
-- After insert, private.notify_aerial_upload posts the new id to the edge
-- function aerial-upload-notify. That call is authenticated with the service
-- role key stored in Vault as aerial_function_bearer. The webhook URL and
-- webhook key are edge-function secrets, not Vault values and not in this
-- file. If the Vault secret is missing, the row is still saved.
--
--   select vault.create_secret(
--     '<service role key>',
--     'aerial_function_bearer',
--     'Bearer for aerial-upload-notify. Not the webhook key.'
--   );
--
-- The edge function then POSTs to GROKBOT_WEBHOOK_URL with
-- Authorization: Bearer <GROKBOT_WEBHOOK_KEY>. See
-- supabase/functions/aerial-upload-notify/index.ts to change that header.

create schema if not exists private;

create extension if not exists pg_net;

create table public.aerial_uploads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  uploader_id uuid not null references auth.users (id) on delete cascade,
  uploader_email text,
  planet text not null default 'eden',
  storage_path text not null,
  facing text,
  altitude text,
  markers text,
  notes text,
  status text not null default 'pending',
  processed_summary text,
  processed_at timestamptz,
  constraint aerial_uploads_planet_check check (planet ~ '^[a-z][a-z0-9_-]*$'),
  constraint aerial_uploads_path_check check (
    storage_path ~ '^[A-Za-z0-9_-]+/[A-Za-z0-9_-]+\.(png|jpg|webp)$'
  ),
  constraint aerial_uploads_facing_check check (facing is null or char_length(facing) <= 160),
  constraint aerial_uploads_altitude_check check (altitude is null or char_length(altitude) <= 80),
  constraint aerial_uploads_markers_check check (markers is null or char_length(markers) <= 500),
  constraint aerial_uploads_notes_check check (notes is null or char_length(notes) <= 2000),
  constraint aerial_uploads_summary_check check (
    processed_summary is null or char_length(processed_summary) <= 4000
  ),
  constraint aerial_uploads_status_check check (status in ('pending', 'processed')),
  constraint aerial_uploads_email_check check (
    uploader_email is null or char_length(uploader_email) <= 320
  )
);

comment on table public.aerial_uploads is
  'Admin aerial shots. Private image in bucket aerial-uploads. Status starts pending.';

comment on column public.aerial_uploads.uploader_id is 'auth.users id of the admin who uploaded the shot.';
comment on column public.aerial_uploads.uploader_email is 'Email from the session at insert time.';
comment on column public.aerial_uploads.planet is 'World id, lowercase. Eden is eden.';
comment on column public.aerial_uploads.storage_path is 'Object path inside the aerial-uploads bucket.';
comment on column public.aerial_uploads.facing is 'Compass direction or free text.';
comment on column public.aerial_uploads.altitude is 'Approximate altitude, free text.';
comment on column public.aerial_uploads.markers is 'Markers visible in the shot. Not other players'' bases.';
comment on column public.aerial_uploads.status is 'pending or processed.';
comment on column public.aerial_uploads.processed_summary is 'Filled when the shot has been read.';

create index aerial_uploads_uploader_idx on public.aerial_uploads (uploader_id, created_at desc);

create or replace function private.guard_aerial_upload()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  is_admin boolean := coalesce((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
  privileged boolean := current_user in ('service_role', 'postgres', 'supabase_admin');
begin
  if tg_op = 'INSERT' then
    if privileged then
      return new;
    end if;
    if not is_admin then
      raise exception 'only an admin can upload an aerial shot';
    end if;
    new.uploader_id := auth.uid();
    new.uploader_email := nullif(auth.jwt() ->> 'email', '');
    new.status := 'pending';
    new.processed_summary := null;
    new.processed_at := null;
    return new;
  end if;

  if privileged then
    return new;
  end if;

  if not is_admin then
    raise exception 'only an admin can update an aerial upload';
  end if;

  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.uploader_id is distinct from old.uploader_id
     or new.uploader_email is distinct from old.uploader_email
     or new.planet is distinct from old.planet
     or new.storage_path is distinct from old.storage_path
     or new.facing is distinct from old.facing
     or new.altitude is distinct from old.altitude
     or new.markers is distinct from old.markers
     or new.notes is distinct from old.notes then
    raise exception 'only status, processed_summary, and processed_at can be changed';
  end if;

  if new.status = 'processed' and new.processed_at is null then
    new.processed_at := now();
  end if;
  if new.status = 'pending' then
    new.processed_summary := null;
    new.processed_at := null;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_aerial_upload() from public;
grant execute on function private.guard_aerial_upload() to authenticated, service_role, postgres;

create trigger aerial_uploads_guard
  before insert or update on public.aerial_uploads
  for each row
  execute function private.guard_aerial_upload();

alter table public.aerial_uploads enable row level security;

revoke all on table public.aerial_uploads from public, anon, authenticated;
grant select, insert, update on table public.aerial_uploads to authenticated;
grant select, insert, update, delete on table public.aerial_uploads to service_role;

create policy "Admins read their own aerial uploads"
  on public.aerial_uploads
  for select
  to authenticated
  using (
    uploader_id = (select auth.uid())
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create policy "Admins insert their own pending aerial uploads"
  on public.aerial_uploads
  for insert
  to authenticated
  with check (
    uploader_id = (select auth.uid())
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    and status = 'pending'
    and processed_summary is null
    and processed_at is null
    and storage_path like ((select auth.uid())::text || '/%')
  );

create policy "Admins update status on their own aerial uploads"
  on public.aerial_uploads
  for update
  to authenticated
  using (
    uploader_id = (select auth.uid())
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  with check (
    uploader_id = (select auth.uid())
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'aerial-uploads',
  'aerial-uploads',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Admins insert their own aerial objects"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'aerial-uploads'
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create or replace function private.notify_aerial_upload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  bearer text;
begin
  select decrypted_secret
    into bearer
  from vault.decrypted_secrets
  where name = 'aerial_function_bearer'
  limit 1;

  if bearer is null or btrim(bearer) = '' then
    raise warning 'aerial_function_bearer is unset; aerial upload % was saved and not sent onward', new.id;
    return new;
  end if;

  perform net.http_post(
    url := 'https://avwbewbeyklpysfndxub.supabase.co/functions/v1/aerial-upload-notify',
    body := jsonb_build_object('upload_id', new.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || bearer
    ),
    timeout_milliseconds := 10000
  );
  return new;
exception
  when others then
    raise warning 'aerial upload notify failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

revoke all on function private.notify_aerial_upload() from public;
grant execute on function private.notify_aerial_upload() to postgres, service_role;

create trigger aerial_uploads_notify
  after insert on public.aerial_uploads
  for each row
  execute function private.notify_aerial_upload();
