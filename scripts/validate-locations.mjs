import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bearingOffset, displayPosition, isFiniteNumber } from "../js/place.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(readFileSync(join(root, "data/location-schema.json"), "utf8"));
const raw = readFileSync(join(root, "data/locations.geojson"), "utf8");

const worlds = new Set(schema.worlds);
const categories = new Set(schema.categories.map((category) => category.id));
const shapes = new Set(["diamond", "triangle", "circle", "hex", "square", "star", "crosshair", "ring"]);
const propertyKeys = [
  "id",
  "example",
  "approximate",
  "date_discovered",
  "world",
  "world_unconfirmed",
  "region",
  "origin",
  "anchor",
  "anchor_id",
  "bearing_deg",
  "distance_m",
  "x",
  "y",
  "z",
  "coordinates_raw",
  "category",
  "subtype",
  "quantity_notes",
  "nav_markers",
  "planet_sightings",
  "source",
];
const markerKeys = ["name", "distance_m", "distance_raw", "bearing_deg"];

const errors = [];

function fail(path, message) {
  errors.push(`${path}: ${message}`);
}

function isNullOrString(value) {
  return value === null || (typeof value === "string" && value.trim() !== "");
}

function isCoordinate(value) {
  return value === null || isFiniteNumber(value);
}

function isBearing(value) {
  return value === null || (isFiniteNumber(value) && value >= 0 && value < 360);
}

function isDistance(value) {
  return value === null || (isFiniteNumber(value) && value >= 0);
}

function isBoolean(value) {
  return typeof value === "boolean";
}

function sourceExists(source) {
  if (typeof source !== "string" || source.trim() === "") return false;
  if (source.startsWith("/") || source.includes("\\") || source.split("/").includes("..")) return false;
  const full = resolve(root, source);
  const rel = relative(root, full);
  if (rel.startsWith("..") || rel === "") return false;
  return existsSync(full);
}

if (!Array.isArray(schema.worlds) || schema.worlds.length === 0) {
  fail("data/location-schema.json", "worlds must be a non-empty array");
}
if (schema.world_compass === null || typeof schema.world_compass !== "object") {
  fail("data/location-schema.json", "world_compass must be an object");
} else {
  for (const world of schema.worlds ?? []) {
    const compass = schema.world_compass[world];
    if (!compass) {
      fail(`world_compass.${world}`, "missing compass entry");
      continue;
    }
    if (!isBoolean(compass.north_derived)) {
      fail(`world_compass.${world}.north_derived`, "must be true or false");
    }
    if (!isNullOrString(compass.north_note)) {
      fail(`world_compass.${world}.north_note`, "must be null or a non-empty string");
    }
  }
  for (const world of Object.keys(schema.world_compass ?? {})) {
    if (!worlds.has(world)) fail(`world_compass.${world}`, "unknown world");
  }
}

const categoryIds = new Set();
for (const [index, category] of (schema.categories ?? []).entries()) {
  const path = `categories[${index}]`;
  if (typeof category?.id !== "string" || categoryIds.has(category.id)) {
    fail(path, "category id must be unique");
  }
  categoryIds.add(category?.id);
  if (typeof category?.label !== "string" || category.label.trim() === "") {
    fail(path, "label must be a non-empty string");
  }
  if (!shapes.has(category?.shape)) fail(path, "shape is not supported");
  if (typeof category?.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(category.color)) {
    fail(path, "color must be a #rrggbb hex");
  }
}

let data;
try {
  data = JSON.parse(raw);
} catch (error) {
  console.error(`data/locations.geojson is not valid JSON: ${error.message}`);
  process.exit(1);
}

if (data?.type !== "FeatureCollection" || !Array.isArray(data.features)) {
  fail("data/locations.geojson", "expected a FeatureCollection with a features array");
}

const ids = new Set();
const features = data.features ?? [];

for (const [index, feature] of features.entries()) {
  const path = `features[${index}]`;
  if (feature?.type !== "Feature") {
    fail(path, "type must be Feature");
    continue;
  }

  const properties = feature.properties;
  if (properties === null || typeof properties !== "object" || Array.isArray(properties)) {
    fail(path, "properties must be an object");
    continue;
  }

  const keys = Object.keys(properties);
  for (const key of propertyKeys) {
    if (!keys.includes(key)) fail(`${path}.properties`, `missing ${key}`);
  }
  for (const key of keys) {
    if (!propertyKeys.includes(key)) fail(`${path}.properties`, `unknown property ${key}`);
  }

  const id = properties.id;
  if (typeof id !== "string" || id.trim() === "" || /\s/.test(id)) {
    fail(`${path}.properties.id`, "must be a non-empty string without whitespace");
  } else if (ids.has(id)) {
    fail(`${path}.properties.id`, `duplicate id ${id}`);
  } else {
    ids.add(id);
  }
  if (feature.id !== id) fail(`${path}.id`, "feature id must match properties.id");

  if (!isBoolean(properties.example)) fail(`${path}.properties.example`, "must be true or false");
  if (!isBoolean(properties.approximate)) fail(`${path}.properties.approximate`, "must be true or false");
  if (!isBoolean(properties.origin)) fail(`${path}.properties.origin`, "must be true or false");
  if (!isBoolean(properties.anchor)) fail(`${path}.properties.anchor`, "must be true or false");
  if (!isBoolean(properties.world_unconfirmed)) {
    fail(`${path}.properties.world_unconfirmed`, "must be true or false");
  }

  if (properties.example === true) {
    if (typeof id !== "string" || !id.startsWith("example-")) {
      fail(`${path}.properties.id`, "example points must use an id that starts with example-");
    }
    if (properties.origin === true) fail(`${path}.properties.origin`, "example points cannot be a world origin");
    if (typeof properties.quantity_notes !== "string" || !properties.quantity_notes.includes("EXAMPLE")) {
      fail(`${path}.properties.quantity_notes`, "example points must include the word EXAMPLE");
    }
  } else if (typeof id === "string" && id.startsWith("example-")) {
    fail(`${path}.properties.id`, "ids that start with example- are reserved for example points");
  }

  if (properties.date_discovered !== null) {
    if (
      typeof properties.date_discovered !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(properties.date_discovered)
    ) {
      fail(`${path}.properties.date_discovered`, "must be null or YYYY-MM-DD");
    } else {
      const [year, month, day] = properties.date_discovered.split("-").map(Number);
      const parsed = new Date(Date.UTC(year, month - 1, day));
      if (
        parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() !== month - 1 ||
        parsed.getUTCDate() !== day
      ) {
        fail(`${path}.properties.date_discovered`, "must be a real calendar date");
      }
    }
  }

  if (!worlds.has(properties.world)) {
    fail(`${path}.properties.world`, `must be one of ${[...worlds].join(", ")}`);
  }
  if (!isNullOrString(properties.region)) fail(`${path}.properties.region`, "must be null or a non-empty string");
  if (properties.anchor_id !== null && (typeof properties.anchor_id !== "string" || properties.anchor_id.trim() === "")) {
    fail(`${path}.properties.anchor_id`, "must be null or an id");
  }
  if (!isBearing(properties.bearing_deg)) {
    fail(`${path}.properties.bearing_deg`, "must be null or degrees from 0 up to, but not including, 360");
  }
  if (!isDistance(properties.distance_m)) fail(`${path}.properties.distance_m`, "must be null or meters >= 0");
  if (!isCoordinate(properties.x)) fail(`${path}.properties.x`, "must be null or a finite number");
  if (!isCoordinate(properties.y)) fail(`${path}.properties.y`, "must be null or a finite number");
  if (!isCoordinate(properties.z)) fail(`${path}.properties.z`, "must be null or a finite number");
  if (!isNullOrString(properties.coordinates_raw)) {
    fail(`${path}.properties.coordinates_raw`, "must be null or a non-empty string");
  }
  if (!categories.has(properties.category)) {
    fail(`${path}.properties.category`, `must be one of ${[...categories].join(", ")}`);
  }
  if (!isNullOrString(properties.subtype)) fail(`${path}.properties.subtype`, "must be null or a non-empty string");
  if (!isNullOrString(properties.quantity_notes)) {
    fail(`${path}.properties.quantity_notes`, "must be null or a non-empty string");
  }
  if (!isNullOrString(properties.planet_sightings)) {
    fail(`${path}.properties.planet_sightings`, "must be null or a non-empty string");
  }
  if (!sourceExists(properties.source)) {
    fail(`${path}.properties.source`, "must be a log path that exists in this repository");
  }

  if (properties.nav_markers !== null) {
    if (!Array.isArray(properties.nav_markers)) {
      fail(`${path}.properties.nav_markers`, "must be null or an array");
    } else {
      properties.nav_markers.forEach((marker, markerIndex) => {
        const markerPath = `${path}.properties.nav_markers[${markerIndex}]`;
        if (marker === null || typeof marker !== "object" || Array.isArray(marker)) {
          fail(markerPath, "must be an object");
          return;
        }
        for (const key of markerKeys) {
          if (!Object.hasOwn(marker, key)) fail(markerPath, `missing ${key}`);
        }
        for (const key of Object.keys(marker)) {
          if (!markerKeys.includes(key)) fail(markerPath, `unknown property ${key}`);
        }
        if (typeof marker.name !== "string" || marker.name.trim() === "") {
          fail(markerPath, "name must be a non-empty string");
        }
        if (!isDistance(marker.distance_m)) fail(markerPath, "distance_m must be null or meters >= 0");
        if (!isNullOrString(marker.distance_raw)) fail(markerPath, "distance_raw must be null or text");
        if (!isBearing(marker.bearing_deg)) fail(markerPath, "bearing_deg must be null or degrees");
        if (marker.distance_m === null && marker.distance_raw === null && marker.bearing_deg === null) {
          fail(markerPath, "record a distance or a bearing");
        }
      });
    }
  }

  if (properties.origin === true) {
    if (properties.anchor !== true) fail(`${path}.properties.anchor`, "an origin is an anchor");
    if (properties.anchor_id !== null) fail(`${path}.properties.anchor_id`, "an origin has no anchor");
    if (properties.bearing_deg !== null || properties.distance_m !== null) {
      fail(path, "an origin is stored at (0, 0), not by bearing");
    }
    if (properties.x !== 0 || properties.y !== 0) fail(path, "an origin must use x 0 and y 0");
  }

  const explicit = isFiniteNumber(properties.x) && isFiniteNumber(properties.y);
  if ((properties.x === null) !== (properties.y === null)) {
    fail(path, "set both x and y, or leave both null");
  }
  if (!explicit) {
    if (feature.geometry !== null) fail(`${path}.geometry`, "must be null when x or y is null");
  } else {
    const geometry = feature.geometry;
    if (geometry?.type !== "Point" || !Array.isArray(geometry.coordinates)) {
      fail(`${path}.geometry`, "must be a Point when x and y are numbers");
    } else {
      const expectedLength = isFiniteNumber(properties.z) ? 3 : 2;
      if (geometry.coordinates.length !== expectedLength) {
        fail(`${path}.geometry.coordinates`, `expected ${expectedLength} numbers`);
      }
      if (geometry.coordinates[0] !== properties.x || geometry.coordinates[1] !== properties.y) {
        fail(`${path}.geometry.coordinates`, "must match x and y, in that order");
      }
      if (isFiniteNumber(properties.z) && geometry.coordinates[2] !== properties.z) {
        fail(`${path}.geometry.coordinates`, "the third position must match z");
      }
      if (geometry.coordinates.some((value) => !isFiniteNumber(value))) {
        fail(`${path}.geometry.coordinates`, "values must be finite numbers");
      }
    }
  }
}

const byId = new Map(features.filter((feature) => feature?.properties?.id).map((feature) => [feature.properties.id, feature]));
const origins = new Map();

for (const feature of features) {
  const properties = feature?.properties;
  if (!properties) continue;
  const path = properties.id ?? "(missing id)";
  if (properties.origin === true && properties.example === false && worlds.has(properties.world)) {
    if (origins.has(properties.world)) {
      fail(path, `more than one origin on ${properties.world}`);
    }
    origins.set(properties.world, properties.id);
  }

  if (properties.anchor_id === null || properties.anchor_id === undefined) continue;
  const anchor = byId.get(properties.anchor_id);
  if (!anchor) {
    fail(path, `anchor_id ${properties.anchor_id} does not exist`);
    continue;
  }
  if (anchor.properties.anchor !== true) fail(path, "anchor_id must name a feature with anchor true");
  if (anchor.properties.world !== properties.world) fail(path, "anchor_id must be on the same world");
  if (properties.example === false && anchor.properties.example === true) {
    fail(path, "a real place cannot use an example as its anchor");
  }

  const seen = new Set([properties.id]);
  let cursor = anchor;
  while (cursor?.properties?.anchor_id) {
    if (seen.has(cursor.properties.id)) {
      fail(path, "anchor chain is a cycle");
      break;
    }
    seen.add(cursor.properties.id);
    cursor = byId.get(cursor.properties.anchor_id);
    if (!cursor) break;
  }

  if (
    properties.approximate === false &&
    isFiniteNumber(properties.x) &&
    isFiniteNumber(properties.y) &&
    isFiniteNumber(properties.bearing_deg) &&
    isFiniteNumber(properties.distance_m) &&
    properties.origin !== true
  ) {
    const base = displayPosition(anchor, byId);
    if (base) {
      const offset = bearingOffset(properties.distance_m, properties.bearing_deg);
      const dx = properties.x - (base.x + offset.x);
      const dy = properties.y - (base.y + offset.y);
      if (Math.hypot(dx, dy) > 0.05) {
        fail(path, "stored x/y disagree with bearing and distance by more than 0.05 m");
      }
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log(`ok: ${features.length} location${features.length === 1 ? "" : "s"}`);
