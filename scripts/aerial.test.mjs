import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  MAX_AERIAL_BYTES,
  SIGNED_URL_SECONDS,
  WEBHOOK_AUTH_HEADER,
  aerialExtension,
  aerialFileError,
  aerialStatusText,
  aerialWebhookBody,
  isAdmin,
  webhookAuthorization,
} from "../js/aerial.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fn = readFileSync(join(root, "supabase/functions/aerial-upload-notify/index.ts"), "utf8");

test("admin is read from app_metadata, not the user-editable claim", () => {
  assert.equal(isAdmin({ app_metadata: { role: "admin" } }), true);
  assert.equal(isAdmin({ app_metadata: { role: "member" } }), false);
  assert.equal(isAdmin({ user_metadata: { role: "admin" } }), false);
  assert.equal(isAdmin(null), false);
});

test("aerial images are png, jpg, or webp and stay under 10 MB", () => {
  assert.equal(aerialExtension({ type: "image/jpeg" }), "jpg");
  assert.equal(aerialExtension({ type: "image/png" }), "png");
  assert.equal(aerialExtension({ type: "image/webp" }), "webp");
  assert.equal(aerialExtension({ type: "image/gif" }), null);
  assert.equal(aerialFileError(null), "Choose an image.");
  assert.equal(aerialFileError({ type: "image/gif", size: 100 }), "Use a PNG, JPG, or WebP image.");
  assert.equal(aerialFileError({ type: "image/png", size: 0 }), "That image is empty.");
  assert.equal(aerialFileError({ type: "image/png", size: MAX_AERIAL_BYTES + 1 }), "That image is over 10 MB.");
  assert.equal(aerialFileError({ type: "image/webp", size: MAX_AERIAL_BYTES }), "");
});

test("the webhook uses Authorization Bearer and a signed URL of at least 7 days", () => {
  assert.equal(WEBHOOK_AUTH_HEADER, "Authorization");
  assert.equal(webhookAuthorization("secret-key"), "Bearer secret-key");
  assert.ok(SIGNED_URL_SECONDS >= 7 * 24 * 60 * 60);
  assert.match(fn, /const WEBHOOK_AUTH_HEADER = "Authorization"/);
  assert.match(fn, /\[WEBHOOK_AUTH_HEADER\]: `Bearer \$\{webhookKey\}`/);
  assert.match(fn, /const SIGNED_URL_SECONDS = 8 \* 24 \* 60 \* 60/);
  assert.doesNotMatch(fn, /GROKBOT_WEBHOOK_KEY\s*=\s*["'][^"']+["']/);
});

test("the webhook body carries the upload and not a storage secret", () => {
  const body = aerialWebhookBody(
    {
      id: "upload-1",
      planet: "eden",
      uploader_email: "admin@example.com",
      facing: "west",
      altitude: "about 40 m",
      markers: "Talon's Public Outpost",
      notes: "meadow",
      created_at: "2026-11-17T00:00:00.000Z",
    },
    "https://example.test/signed",
  );
  assert.deepEqual(Object.keys(body), [
    "upload_id",
    "planet",
    "image_url",
    "uploader",
    "facing",
    "altitude",
    "markers",
    "notes",
    "created_at",
  ]);
  assert.equal(body.upload_id, "upload-1");
  assert.equal(body.image_url, "https://example.test/signed");
  assert.equal(body.uploader, "admin@example.com");
  assert.equal(aerialStatusText({ status: "pending" }), "Pending. The shot is saved and waiting to be read.");
  assert.equal(
    aerialStatusText({ status: "processed", processed_summary: "Meadow west of the outpost." }),
    "Processed. Meadow west of the outpost.",
  );
});
