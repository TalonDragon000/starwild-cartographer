/** Community points.

The map plots a verified or adjusted point at verified_x and verified_y.
An unverified point uses the submitted x and y, faded and without a name label.
not_found is omitted. Status is never a badge on the public map.
*/

import { mountAerial } from "./aerial.js";
import { formatEastNorth, isFiniteNumber } from "./place.js";

export const POINT_TAGS = [
  { id: "poi", label: "Point of interest", category: "other" },
  { id: "resource", label: "Resource", category: "ores" },
  { id: "base", label: "Base", category: "outposts" },
  { id: "crash_site", label: "Crash site", category: "crash-sites" },
  { id: "creature", label: "Creature", category: "creatures" },
  { id: "plant", label: "Plant", category: "plants" },
  { id: "structure", label: "Structure", category: "structures" },
  { id: "landmark", label: "Landmark", category: "structures" },
  { id: "other", label: "Other", category: "other" },
];

const TAGS = new Map(POINT_TAGS.map((tag) => [tag.id, tag]));

export function tagById(id) {
  return TAGS.get(id) ?? null;
}

export function planetKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function planetMatches(planet, world) {
  const left = planetKey(planet);
  const right = planetKey(world);
  return left !== "" && left === right;
}

export function pointPlot(row) {
  if (!row || typeof row !== "object") return null;
  if (row.status === "not_found") return null;
  if (row.status === "verified" || row.status === "adjusted") {
    if (!isFiniteNumber(row.verified_x) || !isFiniteNumber(row.verified_y)) return null;
    return { x: row.verified_x, y: row.verified_y, faded: false, labeled: true };
  }
  if (row.status === "unverified") {
    if (!isFiniteNumber(row.x) || !isFiniteNumber(row.y)) return null;
    return { x: row.x, y: row.y, faded: true, labeled: false };
  }
  return null;
}

export function matchesPointQuery(point, tag, query) {
  const tokens = String(query ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = [point?.name, point?.note, point?.tag, tag?.label, tag?.category]
    .filter((part) => part !== null && part !== undefined)
    .join(" ")
    .toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export function communityVisible(points, { world, query, categories }) {
  const planned = [];
  for (const point of points ?? []) {
    const plot = pointPlot(point);
    if (!plot) continue;
    if (!planetMatches(point.planet, world)) continue;
    const tag = tagById(point.tag);
    if (!tag || !categories?.has(tag.category)) continue;
    if (!matchesPointQuery(point, tag, query)) continue;
    planned.push({ point, plot, tag });
  }
  return planned;
}

export function pointPopupRows(point, tag, plot) {
  const where = plot ? formatEastNorth(plot.x, plot.y) : null;
  return [
    ["Tag", tag?.label ?? "—"],
    ["Note", point?.note ? String(point.note) : "—"],
    ["Place", where ?? "—"],
  ];
}

const SUPABASE_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm";

export async function mountCommunity({ map, onChange } = {}) {
  const root = document.querySelector("#contrib");
  if (!root) return null;
  const { contribConfigured, magicLinkRedirect, supabaseAnonKey, supabaseUrl } = await import("./config.js");
  if (!contribConfigured(supabaseUrl, supabaseAnonKey)) {
    root.hidden = true;
    return null;
  }

  root.hidden = false;
  const signedOut = document.querySelector("#contrib-signed-out");
  const signedIn = document.querySelector("#contrib-signed-in");
  const authStatus = document.querySelector("#contrib-auth-status");
  const formStatus = document.querySelector("#contrib-form-status");
  const emailInput = document.querySelector("#contrib-email");
  const signInButton = document.querySelector("#contrib-sign-in");
  const signOutButton = document.querySelector("#contrib-sign-out");
  const userLine = document.querySelector("#contrib-user");
  const addButton = document.querySelector("#contrib-add");
  const form = document.querySelector("#contrib-form");
  const placeLine = document.querySelector("#contrib-place");
  const tagSelect = document.querySelector("#contrib-tag");
  const nameInput = document.querySelector("#contrib-name");
  const noteInput = document.querySelector("#contrib-note");
  const submitButton = document.querySelector("#contrib-submit");
  const cancelButton = document.querySelector("#contrib-cancel");
  const mapFrame = document.querySelector(".map-frame");

  let client = null;
  let user = null;
  const points = [];
  let loaded = false;
  let adding = false;
  let draft = null;
  let submitting = false;

  fillTags(tagSelect);

  try {
    const { createClient } = await import(SUPABASE_URL);
    client = createClient(supabaseUrl.trim(), supabaseAnonKey.trim(), {
      auth: {
        flowType: "implicit",
        detectSessionInUrl: true,
        persistSession: true,
      },
    });
  } catch (error) {
    console.error(error);
    setStatus(authStatus, "Community sign-in did not load. The survey map is unchanged.");
    return api();
  }

  client.auth.onAuthStateChange((_event, session) => {
    user = session?.user ?? null;
    syncAuth();
  });

  signInButton?.addEventListener("click", sendLink);
  emailInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    sendLink();
  });
  signOutButton?.addEventListener("click", () => {
    clearDraft();
    client.auth.signOut();
  });
  addButton?.addEventListener("click", () => {
    if (!user) return;
    adding = !adding;
    if (!adding) clearDraft();
    syncAdd();
  });
  cancelButton?.addEventListener("click", () => {
    clearDraft();
    adding = false;
    syncAdd();
    addButton?.focus();
  });
  submitButton?.addEventListener("click", submitPoint);
  form?.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    clearDraft();
    adding = false;
    syncAdd();
    addButton?.focus();
  });

  if (map) {
    map.on("click", (event) => {
      if (!adding || !user) return;
      const x = event.latlng?.lng;
      const y = event.latlng?.lat;
      if (!isFiniteNumber(x) || !isFiniteNumber(y)) return;
      draft = { x, y };
      if (form) form.hidden = false;
      if (placeLine) placeLine.textContent = `Selected ${formatEastNorth(x, y)}.`;
      setStatus(formStatus, "");
      form?.scrollIntoView({ block: "nearest" });
      nameInput?.focus();
    });
  }

  const sessionResult = await client.auth.getSession();
  user = sessionResult.data.session?.user ?? null;
  syncAuth();
  await refresh();
  return api();

  function api() {
    return {
      configured: true,
      get loaded() {
        return loaded;
      },
      getPoints() {
        return points;
      },
    };
  }

  function syncAuth() {
    const signed = Boolean(user);
    if (signedOut) signedOut.hidden = signed;
    if (signedIn) signedIn.hidden = !signed;
    if (userLine) userLine.textContent = signed ? `Signed in as ${user.email || "this account"}.` : "";
    if (!signed) {
      adding = false;
      clearDraft();
    }
    syncAdd();
    mountAerial({ client, user, worldSelect: document.querySelector("#world") });
  }

  function syncAdd() {
    if (addButton) addButton.setAttribute("aria-pressed", adding ? "true" : "false");
    mapFrame?.classList.toggle("is-adding", adding);
    if (!adding && form) form.hidden = true;
    if (adding && !draft) setStatus(formStatus, "Click the map to place the point.");
  }

  function clearDraft() {
    draft = null;
    if (form) form.hidden = true;
    if (nameInput) nameInput.value = "";
    if (noteInput) noteInput.value = "";
    if (placeLine) placeLine.textContent = "";
  }

  async function sendLink() {
    if (!client) return;
    const email = emailInput?.value.trim() ?? "";
    if (!email || !email.includes("@")) {
      setStatus(authStatus, "Enter an email address.");
      return;
    }
    signInButton.disabled = true;
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: magicLinkRedirect },
    });
    signInButton.disabled = false;
    if (error) {
      setStatus(authStatus, "The sign-in link could not be sent. Try again in a minute.");
      console.error(error);
      return;
    }
    setStatus(authStatus, "Check that inbox for the sign-in link.");
  }

  async function refresh() {
    const { data, error } = await client.from("points").select("*");
    if (error) {
      console.error(error);
      setStatus(authStatus, "Community points could not be loaded. The survey map is unchanged.");
      return;
    }
    points.splice(0, points.length, ...(data ?? []));
    loaded = true;
    onChange?.();
  }

  async function submitPoint() {
    if (!client || !user || submitting) return;
    if (!draft) {
      setStatus(formStatus, "Click the map to place the point.");
      return;
    }
    const tag = tagSelect?.value ?? "";
    const name = nameInput?.value.trim() ?? "";
    const note = noteInput?.value.trim() ?? "";
    if (!tagById(tag)) {
      setStatus(formStatus, "Choose a tag.");
      return;
    }
    if (name === "") {
      setStatus(formStatus, "Enter a name.");
      nameInput?.focus();
      return;
    }
    const world = document.querySelector("#world")?.value ?? "Eden";
    submitting = true;
    if (submitButton) submitButton.disabled = true;
    const { data, error } = await client
      .from("points")
      .insert({
        created_by: user.id,
        tag,
        name,
        note: note === "" ? null : note,
        x: draft.x,
        y: draft.y,
        planet: planetKey(world),
        status: "unverified",
      })
      .select("*")
      .single();
    submitting = false;
    if (submitButton) submitButton.disabled = false;
    if (error) {
      setStatus(formStatus, "The point was not saved.");
      console.error(error);
      return;
    }
    const saved = data ?? {
      tag,
      name,
      note: note === "" ? null : note,
      x: draft.x,
      y: draft.y,
      planet: planetKey(world),
      status: "unverified",
      verified_x: null,
      verified_y: null,
      verified_at: null,
    };
    points.push(saved);
    clearDraft();
    adding = false;
    syncAdd();
    setStatus(formStatus, "Point added.");
    onChange?.();
  }
}

function fillTags(select) {
  if (!select || select.options.length > 0) return;
  for (const tag of POINT_TAGS) {
    const option = document.createElement("option");
    option.value = tag.id;
    option.textContent = tag.label;
    select.append(option);
  }
}

function setStatus(node, message) {
  if (node) node.textContent = message;
}
