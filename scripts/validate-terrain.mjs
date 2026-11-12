import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isTerrainKind } from "../js/terrain.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const locationSchema = JSON.parse(readFileSync(join(root, "data/location-schema.json"), "utf8"));
const palette = JSON.parse(readFileSync(join(root, "data/surface-palette.json"), "utf8"));
const terrain = JSON.parse(readFileSync(join(root, "data/terrain.geojson"), "utf8"));

const worlds = new Set(locationSchema.worlds);
const requiredSurfaces = ["grass", "forest", "dirt", "sand", "snow", "rock", "water"];
const paletteKeys = [
  "version",
  "description",
  "paper",
  "ink",
  "contour",
  "contourIndex",
  "grid",
  "gridMinor",
  "markerPlate",
  "markerRing",
  "fallback",
  "surfaces",
];
const swatchKeys = ["id", "label", "fill", "stroke"];
const propertyKeys = ["id", "example", "world", "kind", "surface", "name", "notes"];
const collectionKeys = ["type", "features", "description"];
const kindGeometry = {
  surface: new Set(["Polygon", "MultiPolygon"]),
  lake: new Set(["Polygon", "MultiPolygon"]),
  river: new Set(["LineString", "MultiLineString"]),
  ridge: new Set(["LineString", "MultiLineString"]),
  outcrop: new Set(["Point", "MultiPoint", "Polygon", "MultiPolygon"]),
};

const errors = [];

function fail(path, message) {
  errors.push(`${path}: ${message}`);
}

function isHex(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function isNullOrString(value) {
  return value === null || (typeof value === "string" && value.trim() !== "");
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

function checkGeometry(geometry, path) {
  if (geometry === null || typeof geometry !== "object") {
    fail(path, "must be a geometry object");
    return;
  }
  const type = geometry.type;
  const coordinates = geometry.coordinates;
  if (type === "Polygon") {
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      fail(`${path}.coordinates`, "must be an array of rings");
      return;
    }
    coordinates.forEach((ring, index) => checkRing(ring, `${path}.coordinates[${index}]`));
    return;
  }
  if (type === "MultiPolygon") {
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      fail(`${path}.coordinates`, "must be an array of polygons");
      return;
    }
    coordinates.forEach((polygon, polygonIndex) => {
      if (!Array.isArray(polygon) || polygon.length === 0) {
        fail(`${path}.coordinates[${polygonIndex}]`, "must be an array of rings");
        return;
      }
      polygon.forEach((ring, ringIndex) =>
        checkRing(ring, `${path}.coordinates[${polygonIndex}][${ringIndex}]`),
      );
    });
    return;
  }
  if (type === "LineString") {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      fail(`${path}.coordinates`, "a line needs at least two positions");
      return;
    }
    coordinates.forEach((position, index) => checkPosition(position, `${path}.coordinates[${index}]`));
    return;
  }
  if (type === "MultiLineString") {
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      fail(`${path}.coordinates`, "must be an array of lines");
      return;
    }
    coordinates.forEach((line, lineIndex) => {
      if (!Array.isArray(line) || line.length < 2) {
        fail(`${path}.coordinates[${lineIndex}]`, "a line needs at least two positions");
        return;
      }
      line.forEach((position, index) =>
        checkPosition(position, `${path}.coordinates[${lineIndex}][${index}]`),
      );
    });
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
  fail(`${path}.type`, "must be Point, MultiPoint, LineString, MultiLineString, Polygon, or MultiPolygon");
}

if (!sameKeys("data/surface-palette.json", palette, paletteKeys)) {
  // sameKeys already recorded the shape error
} else {
  if (palette.version !== 1) fail("data/surface-palette.json.version", "must be 1");
  if (typeof palette.description !== "string" || palette.description.trim() === "") {
    fail("data/surface-palette.json.description", "must be a non-empty string");
  }
  for (const key of ["paper", "ink", "contour", "contourIndex", "grid", "gridMinor", "markerPlate", "markerRing"]) {
    if (!isHex(palette[key])) fail(`data/surface-palette.json.${key}`, "must be a #rrggbb color");
  }
  if (!sameKeys("data/surface-palette.json.fallback", palette.fallback, swatchKeys)) {
    // recorded
  } else if (palette.fallback.id !== "other") {
    fail("data/surface-palette.json.fallback.id", "must be other");
  } else {
    if (typeof palette.fallback.label !== "string" || palette.fallback.label.trim() === "") {
      fail("data/surface-palette.json.fallback.label", "must be a non-empty string");
    }
    if (!isHex(palette.fallback.fill) || !isHex(palette.fallback.stroke)) {
      fail("data/surface-palette.json.fallback", "fill and stroke must be #rrggbb colors");
    }
  }
  if (!Array.isArray(palette.surfaces) || palette.surfaces.length === 0) {
    fail("data/surface-palette.json.surfaces", "must be a non-empty array");
  } else {
    const ids = new Set();
    for (const [index, surface] of palette.surfaces.entries()) {
      const path = `data/surface-palette.json.surfaces[${index}]`;
      if (!sameKeys(path, surface, swatchKeys)) continue;
      if (typeof surface.id !== "string" || !/^[a-z0-9-]+$/.test(surface.id)) {
        fail(`${path}.id`, "must be a lowercase id");
      } else if (ids.has(surface.id)) {
        fail(`${path}.id`, `duplicate id ${surface.id}`);
      } else {
        ids.add(surface.id);
      }
      if (typeof surface.label !== "string" || surface.label.trim() === "") {
        fail(`${path}.label`, "must be a non-empty string");
      }
      if (!isHex(surface.fill) || !isHex(surface.stroke)) {
        fail(path, "fill and stroke must be #rrggbb colors");
      }
    }
    for (const id of requiredSurfaces) {
      if (!ids.has(id)) fail("data/surface-palette.json.surfaces", `missing ${id}`);
    }
    if (ids.has(palette.fallback?.id)) {
      fail("data/surface-palette.json.fallback.id", "must not repeat a surface id");
    }
  }
}

const surfaceIds = new Set(
  Array.isArray(palette.surfaces) ? palette.surfaces.map((surface) => surface?.id) : [],
);

if (!sameKeys("data/terrain.geojson", terrain, collectionKeys)) {
  // recorded
} else {
  if (terrain.type !== "FeatureCollection") {
    fail("data/terrain.geojson.type", "must be FeatureCollection");
  }
  if (typeof terrain.description !== "string" || terrain.description.trim() === "") {
    fail("data/terrain.geojson.description", "must be a non-empty string");
  }
  if (!Array.isArray(terrain.features)) {
    fail("data/terrain.geojson.features", "must be an array");
  } else {
    const ids = new Set();
    terrain.features.forEach((feature, index) => {
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
      if (!isTerrainKind(properties.kind)) {
        fail(`${path}.properties.kind`, "must be surface, lake, river, ridge, or outcrop");
      } else if (feature.geometry && !kindGeometry[properties.kind].has(feature.geometry.type)) {
        fail(`${path}.geometry.type`, `${properties.kind} cannot use ${feature.geometry.type}`);
      }
      if (properties.surface !== null && (typeof properties.surface !== "string" || !surfaceIds.has(properties.surface))) {
        fail(`${path}.properties.surface`, "must be null or a surface id from data/surface-palette.json");
      }
      if (properties.kind === "surface" && !surfaceIds.has(properties.surface)) {
        fail(`${path}.properties.surface`, "a surface feature needs a palette id");
      }
      if ((properties.kind === "river" || properties.kind === "ridge") && properties.surface !== null) {
        fail(`${path}.properties.surface`, `${properties.kind} features keep surface null`);
      }
      if (!isNullOrString(properties.name)) fail(`${path}.properties.name`, "must be null or a non-empty string");
      if (!isNullOrString(properties.notes)) fail(`${path}.properties.notes`, "must be null or a non-empty string");
      const marked = `${properties.name ?? ""} ${properties.notes ?? ""}`;
      if (properties.example === true) {
        if (typeof properties.id !== "string" || !properties.id.startsWith("example-")) {
          fail(`${path}.properties.id`, "example features must use an id that starts with example-");
        }
        if (!marked.includes("EXAMPLE")) {
          fail(`${path}.properties`, "example features must include the word EXAMPLE in the name or notes");
        }
      } else if (typeof properties.id === "string" && properties.id.startsWith("example-")) {
        fail(`${path}.properties.id`, "ids that start with example- are reserved for examples");
      }
    });
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

const count = terrain.features.length;
console.log(`ok: ${count} terrain feature${count === 1 ? "" : "s"}, ${palette.surfaces.length} surfaces`);
