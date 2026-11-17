import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(join(root, "supabase/migrations/0002_aerial_uploads.sql"), "utf8");
const errors = [];

function fail(message) {
  errors.push(`supabase/migrations/0002_aerial_uploads.sql: ${message}`);
}

function has(pattern, message) {
  if (!pattern.test(sql)) fail(message);
}

if (/user_metadata|raw_user_meta_data/i.test(sql)) {
  fail("authorization must not read the user-editable metadata claim");
}
if (/eyJ[A-Za-z0-9_-]{20,}/.test(sql)) {
  fail("the migration must not contain a JWT");
}
if (/GROKBOT_WEBHOOK_KEY\s*=\s*['"][^'"]+['"]/.test(sql)) {
  fail("the migration must not store a webhook key");
}

has(/create table public\.aerial_uploads\b/i, "missing aerial_uploads table");
has(/uploader_id uuid not null/i, "missing uploader_id");
has(/uploader_email text/i, "missing uploader_email");
has(/planet text not null default 'eden'/i, "planet must default to eden");
has(/storage_path text not null/i, "missing storage_path");
has(/facing text/i, "missing facing");
has(/altitude text/i, "missing altitude");
has(/markers text/i, "missing markers");
has(/notes text/i, "missing notes");
has(/status text not null default 'pending'/i, "status must default to pending");
has(/processed_summary text/i, "missing processed_summary");
has(/processed_at timestamptz/i, "missing processed_at");
has(/enable row level security/i, "RLS must be enabled");
has(/app_metadata/i, "admin checks must use app_metadata");
has(/only an admin can upload an aerial shot/i, "inserts must be limited to admins");
has(/only status, processed_summary, and processed_at can be changed/i, "status updates must be column-limited");
has(/new\.status := 'pending'/i, "non-privileged inserts must force pending");
has(/service_role/i, "the service role must be able to manage rows");
has(/aerial-uploads/i, "missing the aerial-uploads bucket");
has(/public = false|false,\s*\n\s*10485760/i, "the bucket must be private");
has(/10485760/i, "the bucket must cap uploads around 10 MB");
has(/image\/png/i, "png must be allowed");
has(/image\/jpeg/i, "jpeg must be allowed");
has(/image\/webp/i, "webp must be allowed");
has(/Admins read their own aerial uploads/i, "admins must read their own rows");
has(/uploader_id = \(select auth\.uid\(\)\)/i, "reads must be limited to the uploader");
has(/aerial_function_bearer/i, "the notify trigger must read the vault bearer");
has(/functions\/v1\/aerial-upload-notify/i, "the trigger must call the edge function");
has(/Authorization/i, "the function call must send an Authorization header");
has(/create extension if not exists pg_net/i, "pg_net is required for the server-side notify");

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log("ok: aerial migration");
