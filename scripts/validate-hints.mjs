import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(join(root, "data/hints.json"), "utf8");
const keys = ["id", "category", "tip", "details", "date_added", "source"];
const sources = new Set(["owner", "bot"]);
const errors = [];

function fail(path, message) {
  errors.push(`${path}: ${message}`);
}

let hints;
try {
  hints = JSON.parse(raw);
} catch (error) {
  console.error(`data/hints.json is not valid JSON: ${error.message}`);
  process.exit(1);
}

if (!Array.isArray(hints)) {
  fail("data/hints.json", "expected an array of hints");
}

const ids = new Set();
for (const [index, hint] of (hints ?? []).entries()) {
  const path = `hints[${index}]`;
  if (hint === null || typeof hint !== "object" || Array.isArray(hint)) {
    fail(path, "must be an object");
    continue;
  }
  const present = Object.keys(hint);
  for (const key of keys) {
    if (!present.includes(key)) fail(path, `missing ${key}`);
  }
  for (const key of present) {
    if (!keys.includes(key)) fail(path, `unknown property ${key}`);
  }

  if (typeof hint.id !== "string" || hint.id.trim() === "" || /\s/.test(hint.id)) {
    fail(`${path}.id`, "must be a non-empty string without whitespace");
  } else if (ids.has(hint.id)) {
    fail(`${path}.id`, `duplicate id ${hint.id}`);
  } else {
    ids.add(hint.id);
  }

  for (const key of ["category", "tip", "details"]) {
    if (typeof hint[key] !== "string" || hint[key].trim() === "") {
      fail(`${path}.${key}`, "must be a non-empty string");
    }
  }

  if (typeof hint.date_added !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(hint.date_added)) {
    fail(`${path}.date_added`, "must be YYYY-MM-DD");
  } else {
    const [year, month, day] = hint.date_added.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      fail(`${path}.date_added`, "must be a real calendar date");
    }
  }

  if (!sources.has(hint.source)) fail(`${path}.source`, "must be owner or bot");
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log(`ok: ${hints.length} hint${hints.length === 1 ? "" : "s"}`);
