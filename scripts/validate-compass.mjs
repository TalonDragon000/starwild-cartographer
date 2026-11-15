import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "data/compass.json");
const keys = ["calibrated", "north_offset_deg", "note"];
const errors = [];

function fail(message) {
  errors.push(`data/compass.json: ${message}`);
}

let data;
try {
  data = JSON.parse(readFileSync(path, "utf8"));
} catch (error) {
  console.error(`data/compass.json is not valid JSON: ${error.message}`);
  process.exit(1);
}

if (data === null || typeof data !== "object" || Array.isArray(data)) {
  fail("expected an object");
} else {
  for (const key of keys) {
    if (!Object.hasOwn(data, key)) fail(`missing ${key}`);
  }
  for (const key of Object.keys(data)) {
    if (!keys.includes(key)) fail(`unknown property ${key}`);
  }
  if (typeof data.calibrated !== "boolean") fail("calibrated must be true or false");
  if (typeof data.note !== "string" || data.note.trim() === "") fail("note must be a non-empty string");
  if (data.calibrated === true) {
    if (typeof data.north_offset_deg !== "number" || !Number.isFinite(data.north_offset_deg)) {
      fail("a calibrated rose needs a finite north_offset_deg");
    }
  } else if (data.north_offset_deg !== null) {
    fail("north_offset_deg must stay null until it is measured");
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log("ok: compass");
