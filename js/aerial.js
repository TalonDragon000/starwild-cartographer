/** Admin aerial-shot uploads.

The browser talks only to the public Supabase URL and anon key. It never
sees the webhook URL or the webhook key. After a row is inserted, the
database calls the edge function, and that function posts the payload.

Outbound webhook authentication, kept in sync with
supabase/functions/aerial-upload-notify/index.ts:

  Authorization: Bearer <GROKBOT_WEBHOOK_KEY>

Change the header name in the edge function if the receiver expects a
different one. The value stays a Bearer token.
*/

export const WEBHOOK_AUTH_HEADER = "Authorization";
export const MAX_AERIAL_BYTES = 10 * 1024 * 1024;
export const SIGNED_URL_SECONDS = 8 * 24 * 60 * 60;

const TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

export function isAdmin(user) {
  return user?.app_metadata?.role === "admin";
}

export function aerialExtension(file) {
  if (!file || typeof file.type !== "string") return null;
  return TYPES.get(file.type) ?? null;
}

export function aerialFileError(file) {
  if (!file) return "Choose an image.";
  if (!aerialExtension(file)) return "Use a PNG, JPG, or WebP image.";
  if (typeof file.size !== "number" || file.size <= 0) return "That image is empty.";
  if (file.size > MAX_AERIAL_BYTES) return "That image is over 10 MB.";
  return "";
}

export function webhookAuthorization(key) {
  return `Bearer ${key}`;
}

export function aerialWebhookBody(row, imageUrl) {
  return {
    upload_id: row.id,
    planet: row.planet,
    image_url: imageUrl,
    uploader: row.uploader_email ?? row.uploader ?? null,
    facing: row.facing ?? null,
    altitude: row.altitude ?? null,
    markers: row.markers ?? null,
    notes: row.notes ?? null,
    created_at: row.created_at,
  };
}

export function aerialStatusText(row) {
  if (!row) return "";
  if (row.status === "processed") {
    const summary = typeof row.processed_summary === "string" ? row.processed_summary.trim() : "";
    return summary === "" ? "Processed." : `Processed. ${summary}`;
  }
  return "Pending. The shot is saved and waiting to be read.";
}

const panelState = {
  wired: false,
  client: null,
  user: null,
  timer: 0,
};

export function mountAerial({ client, user, worldSelect } = {}) {
  const panel = document.querySelector("#aerial");
  if (!panel) return;
  panelState.client = client ?? null;
  panelState.user = user ?? null;
  if (!panelState.wired) {
    panelState.wired = true;
    wireAerial(panel, worldSelect);
  }
  const admin = Boolean(client && isAdmin(user));
  panel.hidden = !admin;
  if (!admin) {
    window.clearInterval(panelState.timer);
    panelState.timer = 0;
    return;
  }
  fillPlanets(worldSelect);
  refreshAerialList();
}

function wireAerial(panel, worldSelect) {
  const form = panel.querySelector("#aerial-form");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitAerial(worldSelect);
  });
  panel.querySelector("#aerial-refresh")?.addEventListener("click", () => {
    refreshAerialList();
  });
}

function fillPlanets(worldSelect) {
  const select = document.querySelector("#aerial-planet");
  if (!select || select.options.length > 0) return;
  const worlds = worldSelect ? [...worldSelect.options].map((option) => option.value).filter(Boolean) : ["Eden"];
  const names = worlds.length > 0 ? worlds : ["Eden"];
  for (const world of names) {
    const option = document.createElement("option");
    option.value = world;
    option.textContent = world;
    select.append(option);
  }
  const current = worldSelect?.value;
  select.value = names.includes(current) ? current : names.includes("Eden") ? "Eden" : names[0];
}

async function submitAerial(worldSelect) {
  const client = panelState.client;
  const user = panelState.user;
  const status = document.querySelector("#aerial-status");
  if (!client || !isAdmin(user)) return;
  const file = document.querySelector("#aerial-file")?.files?.[0] ?? null;
  const problem = aerialFileError(file);
  if (problem) {
    setStatus(status, problem);
    return;
  }
  const planetSelect = document.querySelector("#aerial-planet");
  const planetName = planetSelect?.value || worldSelect?.value || "Eden";
  const facing = fieldText("#aerial-facing");
  const altitude = fieldText("#aerial-altitude");
  const markers = fieldText("#aerial-markers");
  const notes = fieldText("#aerial-notes");
  const button = document.querySelector("#aerial-submit");
  if (button) button.disabled = true;
  setStatus(status, "Uploading…");
  const extension = aerialExtension(file);
  const id = crypto.randomUUID();
  const storagePath = `${user.id}/${id}.${extension}`;
  const uploaded = await client.storage.from("aerial-uploads").upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploaded.error) {
    if (button) button.disabled = false;
    setStatus(status, "The image was not saved.");
    console.error(uploaded.error);
    return;
  }
  const inserted = await client
    .from("aerial_uploads")
    .insert({
      id,
      uploader_id: user.id,
      uploader_email: user.email ?? null,
      planet: planetName.trim().toLowerCase(),
      storage_path: storagePath,
      facing: emptyToNull(facing),
      altitude: emptyToNull(altitude),
      markers: emptyToNull(markers),
      notes: emptyToNull(notes),
      status: "pending",
    })
    .select("id, status, processed_summary, processed_at, created_at, planet, facing")
    .single();
  if (button) button.disabled = false;
  if (inserted.error) {
    await client.storage.from("aerial-uploads").remove([storagePath]);
    setStatus(status, "The upload was not recorded.");
    console.error(inserted.error);
    return;
  }
  const form = document.querySelector("#aerial-form");
  form?.reset();
  fillPlanets(worldSelect);
  if (planetSelect && worldSelect?.value) planetSelect.value = worldSelect.value;
  setStatus(status, `Saved. ${aerialStatusText(inserted.data)}`);
  refreshAerialList();
}

async function refreshAerialList() {
  const client = panelState.client;
  const list = document.querySelector("#aerial-list");
  if (!client || !list || !isAdmin(panelState.user)) return;
  const { data, error } = await client
    .from("aerial_uploads")
    .select("id, created_at, planet, facing, status, processed_summary, processed_at")
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) {
    console.error(error);
    return;
  }
  list.replaceChildren();
  for (const row of data ?? []) {
    const item = document.createElement("li");
    const when = row.created_at ? new Date(row.created_at).toLocaleString() : "";
    const facing = row.facing ? ` · ${row.facing}` : "";
    item.textContent = `${when} · ${row.planet}${facing} · ${aerialStatusText(row)}`;
    list.append(item);
  }
  const waiting = (data ?? []).some((row) => row.status === "pending");
  window.clearInterval(panelState.timer);
  panelState.timer = waiting ? window.setInterval(refreshAerialList, 8000) : 0;
}

function fieldText(selector) {
  return document.querySelector(selector)?.value?.trim() ?? "";
}

function emptyToNull(value) {
  return value === "" ? null : value;
}

function setStatus(node, message) {
  if (node) node.textContent = message;
}
