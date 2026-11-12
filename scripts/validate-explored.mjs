import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const locationSchema = JSON.parse(readFileSync(join(root, "data/location-schema.json"), "utf8"));
const explored = JSON.parse(readFileSync(join(root, "data/explored.geojson"), "utf8"));

const worlds = new Set(locationSchema.worlds);
const collectionKeys = ["type", "features", "description", "default_radius_m", "updated"];
const propertyKeys = ["id", "example", "world", "radius_m", "date", "source", "notes"];
const geometryTypes = new Set([
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
]);
const MAX_RADIUS_M = 5000;

const errors = [];

function fail(path, message) {
  errors.push(`${path}: ${message}`);
}

function sameKeys(path, value, allowed) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "must be an object");
    return false;
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) fail(path, `missing ${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(path, `unknown property ${key}`);
  }
  return true;
}

function checkPosition(position, path) {
  if (!Array.isArray(position) || (position.length !== 2 && position.length !== 3)) {
    fail(path, "must be [east, north] or [east, north, z]");
    return false;
  }
  if (!position.every((value) => typeof value === "number" && Number.isFinite(value))) {
    fail(path, "coordinates must be finite numbers");
    return false;
  }
  return true;
}

function checkRing(ring, path) {
  if (!Array.isArray(ring) || ring.length < 4) {
    fail(path, "a ring needs at least four positions");
    return;
  }
  ring.forEach((position, index) => checkPosition(position, `${path}[${index}]`));
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (
    !Array.isArray(first) ||
    !Array.isArray(last) ||
    first.length < 2 ||
    last.length < 2 ||
    first[0] !== last[0] ||
    first[1] !== last[1]
  ) {
    fail(path, "a ring must be closed");
  }
}

function checkLine(line, path) {
  if (!Array.isArray(line) || line.length < 2) {
    fail(path, "a line needs at least two positions");
    return;
  }
  line.forEach((position, index) => checkPosition(position, `${path}[${index}]`));
}

function checkGeometry(geometry, path) {
  if (geometry === null || typeof geometry !== "object") {
    fail(path, "must be a geometry object");
    return;
  }
  const type = geometry.type;
  const coordinates = geometry.coordinates;
  if (!geometryTypes.has(type)) {
    fail(`${path}.type`, "must be Point, MultiPoint, LineString, MultiLineString, Polygon, or MultiPolygon");
    return;
  }
  if (type === "Point") {
    checkPosition(coordinates, `${path}.coordinates`);
    return;
  }
  if (type === "MultiPoint") {
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      fail(`${path}.coordinates`, "must be an array of positions");
      return;
    }
    coordinates.forEach((position, index) => checkPosition(position, `${path}.coordinates[${index}]`));
    return;
  }
  if (type === "LineString") {
    checkLine(coordinates, `${path}.coordinates`);
    return;
  }
  if (type === "MultiLineString") {
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      fail(`${path}.coordinates`, "must be an array of lines");
      return;
    }
    coordinates.forEach((line, index) => checkLine(line, `${path}.coordinates[${index}]`));
    return;
  }
  if (type === "Polygon") {
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      fail(`${path}.coordinates`, "must be an array of rings");
      return;
    }
    coordinates.forEach((ring, index) => checkRing(ring, `${path}.coordinates[${index}]`));
    return;
  }
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    fail(`${path}.coordinates`, "must be an array of polygons");
    return;
  }
  coordinates.forEach((polygon, polygonIndex) => {
    if (!Array.isArray(polygon) || polygon.length === 0) {
      fail(`${path}.coordinates[${polygonIndex}]`, "must be an array of rings");
      return;
    }
    polygon.forEach((ring, ringIndex) => checkRing(ring, `${path}.coordinates[${polygonIndex}][${ringIndex}]`));
  });
}

function isDate(value) {
  return value === null || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isUpdated(value) {
  return value === null || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(T[0-9:.+-]+Z?)?$/.test(value));
}

function isSource(value) {
  if (value === null) return false;
  if (typeof value !== "string" || value.trim() === "") return false;
  if (value.startsWith("/") || value.includes("..") || value.includes("\\")) return false;
  return /^[a-zA-Z0-9._/-]+$/.test(value);
}

if (!sameKeys("data/explored.geojson", explored, collectionKeys)) {
  // recorded
} else {
  if (explored.type !== "FeatureCollection") {
    fail("data/explored.geojson.type", "must be FeatureCollection");
  }
  if (typeof explored.description !== "string" || explored.description.trim() === "") {
    fail("data/explored.geojson.description", "must be a non-empty string");
  }
  if (typeof explored.default_radius_m !== "number" || !(explored.default_radius_m > 0) || explored.default_radius_m > MAX_RADIUS_M) {
    fail("data/explored.geojson.default_radius_m", `must be a positive number of meters up to ${MAX_RADIUS_M}`);
  }
  if (!isUpdated(explored.updated)) {
    fail("data/explored.geojson.updated", "must be null, YYYY-MM-DD, or an ISO timestamp");
  }
  if (!Array.isArray(explored.features)) {
    fail("data/explored.geojson.features", "must be an array");
  } else {
    const ids = new Set();
    explored.features.forEach((feature, index) => {
      const path = `features[${index}]`;
      if (feature === null || typeof feature !== "object" || Array.isArray(feature)) {
        fail(path, "must be an object");
        return;
      }
      if (feature.type !== "Feature") fail(`${path}.type`, "must be Feature");
      checkGeometry(feature.geometry, `${path}.geometry`);
      if (!sameKeys(`${path}.properties`, feature.properties, propertyKeys)) return;
      const properties = feature.properties;
      if (typeof properties.id !== "string" || properties.id.trim() === "" || /\s/.test(properties.id)) {
        fail(`${path}.properties.id`, "must be a non-empty string without whitespace");
      } else if (ids.has(properties.id)) {
        fail(`${path}.properties.id`, `duplicate id ${properties.id}`);
      } else {
        ids.add(properties.id);
      }
      if (feature.id !== properties.id) fail(`${path}.id`, "feature id must match properties.id");
      if (typeof properties.example !== "boolean") fail(`${path}.properties.example`, "must be true or false");
      if (!worlds.has(properties.world)) {
        fail(`${path}.properties.world`, `must be one of ${[...worlds].join(", ")}`);
      }
      if (properties.radius_m !== null && (typeof properties.radius_m !== "number" || !(properties.radius_m > 0) || properties.radius_m > MAX_RADIUS_M)) {
        fail(`${path}.properties.radius_m`, `must be null or a positive number of meters up to ${MAX_RADIUS_M}`);
      }
      if (!isDate(properties.date)) fail(`${path}.properties.date`, "must be null or YYYY-MM-DD");
      if (properties.notes !== null && (typeof properties.notes !== "string" || properties.notes.trim() === "")) {
        fail(`${path}.properties.notes`, "must be null or a non-empty string");
      }
      const marked = `${properties.notes ?? ""}`;
      if (properties.example === true) {
        if (typeof properties.id !== "string" || !properties.id.startsWith("example-")) {
          fail(`${path}.properties.id`, "example features must use an id that starts with example-");
        }
        if (!marked.includes("EXAMPLE")) {
          fail(`${path}.properties.notes`, "example features must include the word EXAMPLE");
        }
        if (properties.source !== null) {
          fail(`${path}.properties.source`, "example features keep source null");
        }
      } else if (typeof properties.id === "string" && properties.id.startsWith("example-")) {
        fail(`${path}.properties.id`, "ids that start with example- are reserved for examples");
      } else if (!isSource(properties.source)) {
        fail(`${path}.properties.source`, "a traveled feature needs a log path");
      } else if (!existsSync(join(root, properties.source))) {
        fail(`${path}.properties.source`, "log file does not exist");
      }
    });
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

const count = explored.features.length;
console.log(`ok: ${count} explored feature${count === 1 ? "" : "s"}`);
