import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(join(root, "supabase/migrations/0001_points.sql"), "utf8");
const errors = [];

function fail(message) {
  errors.push(`supabase/migrations/0001_points.sql: ${message}`);
}

function has(pattern, message) {
  if (!pattern.test(sql)) fail(message);
}

if (/user_metadata|raw_user_meta_data/i.test(sql)) {
  fail("authorization must not read user_metadata");
}

has(/create table public\.points\b/i, "missing points table");
has(/create table public\.landmark_sightings\b/i, "missing landmark_sightings table");
has(/app_metadata/i, "admin checks must use app_metadata");
has(/enable row level security/i, "RLS must be enabled");
has(/revoke all on table public\.points from public, anon, authenticated/i, "points grants must be revoked before they are reissued");
has(/revoke all on table public\.landmark_sightings from public, anon, authenticated/i, "sighting grants must be revoked before they are reissued");
has(/grant select on table public\.points to anon, authenticated/i, "anyone signed out must be able to read points");
has(/status = 'unverified'/i, "inserts must require unverified status");
has(/new\.status := 'unverified'/i, "non-admin inserts must force unverified status");
has(/only an admin can change status or verified fields/i, "status and verified fields need an admin guard");
has(/service_role/i, "the service role must be able to manage rows");

for (const tag of ["poi", "resource", "base", "crash_site", "creature", "plant", "structure", "landmark", "other"]) {
  has(new RegExp(`'${tag}'`), `missing tag ${tag}`);
}
for (const status of ["unverified", "verified", "adjusted", "not_found"]) {
  has(new RegExp(`'${status}'`), `missing status ${status}`);
}

has(/planet text not null default 'eden'/i, "planet must default to eden");
has(/status text not null default 'unverified'/i, "status must default to unverified");
has(/observer_x double precision not null/i, "sightings need observer_x");
has(/observer_y double precision not null/i, "sightings need observer_y");
has(/landmark_point_id uuid not null references public\.points/i, "sightings need a landmark point id");
has(/bearing_deg double precision/i, "sightings need bearing_deg");
has(/distance_m double precision/i, "sightings need distance_m");
has(/slope_note text/i, "sightings need slope_note");
has(/ground_type text/i, "sightings need ground_type");
has(/verified_x double precision/i, "points need verified_x");
has(/verified_y double precision/i, "points need verified_y");
has(/verified_at timestamptz/i, "points need verified_at");

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log("ok: points migration");
