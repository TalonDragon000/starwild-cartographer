-- Community points for Starwild Cartographer.
-- Apply in the Supabase SQL editor, or with the Supabase CLI, against the project
-- whose URL and public key are in js/config.js. Do not put the service role key
-- in the site.
--
-- Read: anon and authenticated.
-- Insert: a signed-in user, and only as themselves. status is forced to unverified
-- and the verified columns are cleared, unless the request is the service role,
-- postgres, or a signed-in user whose app_metadata.role is admin.
-- Update: the owner may change their own descriptive fields. status, verified_x,
-- verified_y, and verified_at change only for an admin or the service role.
-- Authorization reads app_metadata. Do not read the user-editable metadata claim.
--
-- Set an admin (then that user must sign out and back in, or refresh the session):
--   update auth.users
--   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
--   where email = 'you@example.com';

create schema if not exists private;

comment on schema private is
  'Not exposed by the Data API. Trigger guards for community points.';

revoke all on schema private from public;
grant usage on schema private to postgres, service_role, authenticated;

create table public.points (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id) on delete cascade,
  tag text not null,
  name text not null,
  note text,
  x double precision not null,
  y double precision not null,
  planet text not null default 'eden',
  status text not null default 'unverified',
  verified_x double precision,
  verified_y double precision,
  verified_at timestamptz,
  constraint points_tag_check check (
    tag in (
      'poi',
      'resource',
      'base',
      'crash_site',
      'creature',
      'plant',
      'structure',
      'landmark',
      'other'
    )
  ),
  constraint points_name_check check (char_length(btrim(name)) between 1 and 120),
  constraint points_note_check check (note is null or char_length(note) <= 2000),
  constraint points_planet_check check (planet ~ '^[a-z][a-z0-9_-]*$'),
  constraint points_xy_check check (
    x = x and y = y and x > '-Infinity'::float8 and x < 'Infinity'::float8
    and y > '-Infinity'::float8 and y < 'Infinity'::float8
  ),
  constraint points_status_check check (status in ('unverified', 'verified', 'adjusted', 'not_found')),
  constraint points_verified_xy_check check (
    (
      verified_x is null
      and verified_y is null
    )
    or (
      verified_x is not null
      and verified_y is not null
      and verified_x = verified_x
      and verified_y = verified_y
      and verified_x > '-Infinity'::float8
      and verified_x < 'Infinity'::float8
      and verified_y > '-Infinity'::float8
      and verified_y < 'Infinity'::float8
    )
  ),
  constraint points_verification_check check (
    (
      status in ('unverified', 'not_found')
      and verified_x is null
      and verified_y is null
      and verified_at is null
    )
    or (
      status in ('verified', 'adjusted')
      and verified_x is not null
      and verified_y is not null
      and verified_at is not null
    )
  )
);

comment on table public.points is
  'Community map points, in meters from the world origin. Public read. Verification columns are admin-only.';

comment on column public.points.x is 'East, meters from the 0,0 anchor.';
comment on column public.points.y is 'North, meters from the 0,0 anchor.';
comment on column public.points.planet is 'World id, lowercase. Eden is eden.';
comment on column public.points.status is 'unverified, verified, adjusted, or not_found. New rows are unverified.';
comment on column public.points.verified_x is 'East after an admin check. Null until then.';
comment on column public.points.verified_y is 'North after an admin check. Null until then.';

create index points_planet_idx on public.points (planet);
create index points_created_by_idx on public.points (created_by);

create table public.landmark_sightings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id) on delete cascade,
  observer_x double precision not null,
  observer_y double precision not null,
  landmark_point_id uuid not null references public.points (id) on delete cascade,
  bearing_deg double precision,
  distance_m double precision,
  slope_note text,
  ground_type text,
  constraint landmark_sightings_observer_check check (
    observer_x = observer_x
    and observer_y = observer_y
    and observer_x > '-Infinity'::float8
    and observer_x < 'Infinity'::float8
    and observer_y > '-Infinity'::float8
    and observer_y < 'Infinity'::float8
  ),
  constraint landmark_sightings_bearing_check check (
    bearing_deg is null or (bearing_deg >= 0 and bearing_deg < 360)
  ),
  constraint landmark_sightings_distance_check check (
    distance_m is null or (distance_m >= 0 and distance_m < 'Infinity'::float8)
  ),
  constraint landmark_sightings_slope_check check (
    slope_note is null or char_length(slope_note) <= 500
  ),
  constraint landmark_sightings_ground_check check (
    ground_type is null or (char_length(btrim(ground_type)) between 1 and 80)
  )
);

comment on table public.landmark_sightings is
  'Observer fixes for a later triangulation. Bearings and distances stay null until measured.';

comment on column public.landmark_sightings.observer_x is 'Observer east, meters from the 0,0 anchor.';
comment on column public.landmark_sightings.observer_y is 'Observer north, meters from the 0,0 anchor.';
comment on column public.landmark_sightings.bearing_deg is 'Degrees clockwise from derived north. Null if not measured.';
comment on column public.landmark_sightings.distance_m is 'Meters from the observer to the landmark. Null if not measured.';

create index landmark_sightings_point_idx on public.landmark_sightings (landmark_point_id);
create index landmark_sightings_created_by_idx on public.landmark_sightings (created_by);

create or replace function private.guard_point()
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
      new.created_by := auth.uid();
      new.status := 'unverified';
      new.verified_x := null;
      new.verified_y := null;
      new.verified_at := null;
    end if;
    return new;
  end if;

  if privileged then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception 'id, created_at, and created_by cannot be changed';
  end if;

  if not is_admin and (
    new.status is distinct from old.status
    or new.verified_x is distinct from old.verified_x
    or new.verified_y is distinct from old.verified_y
    or new.verified_at is distinct from old.verified_at
  ) then
    raise exception 'only an admin can change status or verified fields';
  end if;

  return new;
end;
$$;

create or replace function private.guard_sighting()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  privileged boolean := current_user in ('service_role', 'postgres', 'supabase_admin');
begin
  if tg_op = 'INSERT' then
    if not privileged then
      new.created_by := auth.uid();
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if privileged then
      return old;
    end if;
    raise exception 'sightings are append-only';
  end if;

  if privileged then
    return new;
  end if;

  raise exception 'sightings are append-only';
end;
$$;

revoke all on function private.guard_point() from public;
revoke all on function private.guard_sighting() from public;
grant execute on function private.guard_point() to authenticated, service_role, postgres;
grant execute on function private.guard_sighting() to authenticated, service_role, postgres;

create trigger points_guard
  before insert or update on public.points
  for each row
  execute function private.guard_point();

create trigger landmark_sightings_guard
  before insert or update or delete on public.landmark_sightings
  for each row
  execute function private.guard_sighting();

alter table public.points enable row level security;
alter table public.landmark_sightings enable row level security;

revoke all on table public.points from public, anon, authenticated;
revoke all on table public.landmark_sightings from public, anon, authenticated;

grant select on table public.points to anon, authenticated;
grant insert, update on table public.points to authenticated;
grant select, insert, update, delete on table public.points to service_role;

grant select on table public.landmark_sightings to anon, authenticated;
grant insert on table public.landmark_sightings to authenticated;
grant select, insert, update, delete on table public.landmark_sightings to service_role;

create policy "Anyone can read points"
  on public.points
  for select
  to anon, authenticated
  using (true);

create policy "Signed-in users insert their own unverified points"
  on public.points
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and status = 'unverified'
    and verified_x is null
    and verified_y is null
    and verified_at is null
  );

create policy "Owners and admins update points"
  on public.points
  for update
  to authenticated
  using (
    created_by = (select auth.uid())
    or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  with check (
    created_by = (select auth.uid())
    or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create policy "Anyone can read landmark sightings"
  on public.landmark_sightings
  for select
  to anon, authenticated
  using (true);

create policy "Signed-in users insert their own sightings"
  on public.landmark_sightings
  for insert
  to authenticated
  with check (created_by = (select auth.uid()));
