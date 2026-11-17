import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pointInRing } from "../js/explored.js";
import { revealedFeatures } from "../js/coverage.js";
import { imageBounds } from "../js/relief.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function fail(path, message) {
  errors.push(`${path}: ${message}`);
}

const coverage = JSON.parse(readFileSync(join(root, "data/eden/coverage.geojson"), "utf8"));
const poi = JSON.parse(readFileSync(join(root, "data/eden/poi-estimate.json"), "utf8"));
const relief = JSON.parse(readFileSync(join(root, "data/eden-relief-estimate.json"), "utf8"));

if (coverage.type !== "FeatureCollection" || !Array.isArray(coverage.features)) {
  fail("data/eden/coverage.geojson", "expected a FeatureCollection");
}
if (coverage.world !== "Eden") fail("data/eden/coverage.geojson", "world must be Eden");

const ids = new Set();
for (const [index, feature] of (coverage.features ?? []).entries()) {
  const path = `features[${index}]`;
  if (feature?.type !== "Feature") fail(path, "type must be Feature");
  const properties = feature?.properties ?? {};
  if (feature?.id !== properties.id) fail(path, "id must match properties.id");
  if (typeof properties.id !== "string" || properties.id.trim() === "" || /\s/.test(properties.id)) {
    fail(path, "id must be a non-empty string without whitespace");
  } else if (ids.has(properties.id)) {
    fail(path, "duplicate id");
  } else {
    ids.add(properties.id);
  }
  if (properties.world !== "Eden") fail(path, "world must be Eden");
  if (properties.kind !== "revealed") fail(path, "kind must be revealed");
  if (typeof properties.notes !== "string" || properties.notes.trim() === "") fail(path, "notes are required");
  if (typeof properties.source !== "string" || !existsSync(join(root, properties.source))) {
    fail(path, "source must be a file in the repo");
  }
  const ring = feature?.geometry?.type === "Polygon" ? feature.geometry.coordinates?.[0] : null;
  if (!Array.isArray(ring) || ring.length < 4) {
    fail(path, "geometry must be a polygon");
    continue;
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) fail(path, "the outer ring must be closed");
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  if (!(area > 0)) fail(path, "the outer ring must run counter-clockwise");
}

const revealed = revealedFeatures(coverage, "Eden");
if (revealed.length !== 1) fail("coverage", "Eden needs one revealed feature");
const ring = revealed[0]?.polygons?.[0]?.[0];
const inside = [
  ["Talon's Public Outpost", 0, 0],
  ["Dragon's Lair", -2789.3, 244],
  ["Talon's Silica Site", -101.8, -108.8],
  ["Talon's Copper Site", 85, -536.3],
];
for (const [name, east, north] of inside) {
  if (!pointInRing(east, north, ring)) fail("coverage", `${name} must sit inside the revealed polygon`);
}
for (const [name, east, north] of [
  ["northwest hatch", -5500, 1800],
  ["northeast hatch", 1500, 1800],
]) {
  if (pointInRing(east, north, ring)) fail("coverage", `${name} is hatched and must stay under fog`);
}

const names = new Set((poi.pois ?? []).map((place) => place.name));
for (const name of ["Talon's Public Outpost", "Dragon's Lair", "Talon's Copper Site", "Talon's Silica Site", "Elara"]) {
  if (!names.has(name)) fail("data/eden/poi-estimate.json", `missing ${name}`);
}
if (poi.meta?.do_not_publish_other_players_bases !== true) {
  fail("data/eden/poi-estimate.json", "other players' bases must stay unpublished");
}
const plate = imageBounds(relief);
const image = poi.extent?.image;
for (const key of ["west", "east", "south", "north"]) {
  if (!plate || Math.abs((image?.[key] ?? NaN) - plate[key]) > 1e-6) {
    fail("data/eden/poi-estimate.json", `extent.image.${key} must match the relief plate`);
  }
}
const axes = poi.extent?.axes;
if (!axes || !(axes.west < 0 && axes.east > 0 && axes.south < -536.3 && axes.north > 244)) {
  fail("data/eden/poi-estimate.json", "extent.axes must contain the plotted Eden places");
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log(`ok: ${coverage.features.length} coverage feature${coverage.features.length === 1 ? "" : "s"}`);
