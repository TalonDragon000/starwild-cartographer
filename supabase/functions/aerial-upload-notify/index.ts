import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Tell the aerial-shot reader that a new upload is waiting.
 *
 * The database trigger calls this function with the service role key.
 * This function then POSTs to the URL in the secret GROKBOT_WEBHOOK_URL.
 *
 * Outbound authentication uses the standard webhook sender key:
 *
 *   Authorization: Bearer <GROKBOT_WEBHOOK_KEY>
 *
 * WEBHOOK_AUTH_HEADER is the header name. Change that constant if the
 * receiver expects a different header. Keep the value a Bearer token.
 * The signed image URL is valid for SIGNED_URL_SECONDS (8 days, which is
 * at least 7 days).
 *
 * Keep these two constants in sync with js/aerial.js.
 */

const WEBHOOK_AUTH_HEADER = "Authorization";
const SIGNED_URL_SECONDS = 8 * 24 * 60 * 60;

type AerialRow = {
  id: string;
  created_at: string;
  uploader_email: string | null;
  planet: string;
  storage_path: string;
  facing: string | null;
  altitude: string | null;
  markers: string | null;
  notes: string | null;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authorization = request.headers.get("Authorization") ?? "";
  if (serviceKey === "" || authorization !== `Bearer ${serviceKey}`) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: { upload_id?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const uploadId = body.upload_id;
  if (typeof uploadId !== "string" || uploadId === "") {
    return json({ error: "missing upload_id" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const loaded = await supabase
    .from("aerial_uploads")
    .select("id, created_at, uploader_email, planet, storage_path, facing, altitude, markers, notes")
    .eq("id", uploadId)
    .maybeSingle();
  if (loaded.error) {
    return json({ error: "upload lookup failed" }, 500);
  }
  const row = loaded.data as AerialRow | null;
  if (!row || typeof row.storage_path !== "string") {
    return json({ error: "upload not found" }, 404);
  }

  const signed = await supabase.storage.from("aerial-uploads").createSignedUrl(row.storage_path, SIGNED_URL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    return json({ error: "could not sign image url" }, 500);
  }

  const webhookUrl = Deno.env.get("GROKBOT_WEBHOOK_URL") ?? "";
  const webhookKey = Deno.env.get("GROKBOT_WEBHOOK_KEY") ?? "";
  if (webhookUrl === "" || webhookKey === "") {
    return json({ notified: false, reason: "GROKBOT_WEBHOOK_URL or GROKBOT_WEBHOOK_KEY is not set" }, 500);
  }

  const payload = {
    upload_id: row.id,
    planet: row.planet,
    image_url: signed.data.signedUrl,
    uploader: row.uploader_email,
    facing: row.facing,
    altitude: row.altitude,
    markers: row.markers,
    notes: row.notes,
    created_at: row.created_at,
  };
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [WEBHOOK_AUTH_HEADER]: `Bearer ${webhookKey}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    return json({ notified: false, status: response.status }, 502);
  }
  return json({ notified: true, upload_id: row.id }, 200);
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
