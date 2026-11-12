import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  bearingOffset,
  displayPosition,
  formatEastNorth,
  formatMeters,
} from "../js/place.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function point(id, properties) {
  return { id, properties: { id, world: "Eden", ...properties } };
}

function index(features) {
  return new Map(features.map((feature) => [feature.id, feature]));
}

test("bearing 0 is north and bearing 90 is east", () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(bearingOffset(10, 0)).map(([key, value]) => [key, Math.round(value)]),
    ),
    { x: 0, y: 10 },
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(bearingOffset(10, 90)).map(([key, value]) => [key, Math.round(value)]),
    ),
    { x: 10, y: 0 },
  );
  const south = bearingOffset(10, 180);
  const west = bearingOffset(10, 270);
  assert.ok(Math.abs(south.x) < 1e-10);
  assert.ok(Math.abs(south.y + 10) < 1e-10);
  assert.ok(Math.abs(west.x + 10) < 1e-10);
  assert.ok(Math.abs(west.y) < 1e-10);
});

test("origin stays at zero and a chain follows bearings", () => {
  const origin = point("spawn", { origin: true, x: 0, y: 0 });
  const camp = point("camp", {
    origin: false,
    anchor_id: "spawn",
    bearing_deg: 0,
    distance_m: 1000,
    x: null,
    y: null,
  });
  const ore = point("ore", {
    origin: false,
    anchor_id: "camp",
    bearing_deg: 90,
    distance_m: 100,
    x: null,
    y: null,
  });
  const byId = index([origin, camp, ore]);
  assert.deepEqual(displayPosition(origin, byId), { x: 0, y: 0, method: "origin" });
  assert.deepEqual(displayPosition(camp, byId), {
    x: 0,
    y: 1000,
    method: "bearing",
    anchorId: "spawn",
  });
  const placed = displayPosition(ore, byId);
  assert.equal(placed.method, "bearing");
  assert.ok(Math.abs(placed.x - 100) < 1e-9);
  assert.ok(Math.abs(placed.y - 1000) < 1e-9);
});

test("stored meters win over a missing bearing, and a cycle does not recurse", () => {
  const stored = point("stored", { origin: false, x: 12, y: -4 });
  assert.equal(displayPosition(stored, index([stored])).method, "stored");

  const left = point("left", {
    origin: false,
    anchor_id: "right",
    bearing_deg: 10,
    distance_m: 5,
    x: null,
    y: null,
  });
  const right = point("right", {
    origin: false,
    anchor_id: "left",
    bearing_deg: 20,
    distance_m: 5,
    x: null,
    y: null,
  });
  assert.equal(displayPosition(left, index([left, right])), null);
});

test("an anchor on another world is not a base", () => {
  const hush = point("hush-camp", { origin: true, world: "Hush", x: 0, y: 0 });
  const eden = point("eden-rock", {
    origin: false,
    world: "Eden",
    anchor_id: "hush-camp",
    bearing_deg: 10,
    distance_m: 10,
    x: null,
    y: null,
  });
  assert.equal(displayPosition(eden, index([hush, eden])), null);
});

test("distance labels keep survey precision", () => {
  assert.equal(formatMeters(523), "523 m");
  assert.equal(formatMeters(164400), "164.4 km");
  assert.equal(formatMeters(0), "0 m");
  assert.equal(formatEastNorth(0, 0), "0 m east, 0 m north");
  assert.equal(formatEastNorth(-30, 75), "30 m west, 75 m north");
});

test("logged Eden spawn and Maren examples place as documented", () => {
  const collection = JSON.parse(readFileSync(join(root, "data/locations.geojson"), "utf8"));
  const byId = index(collection.features);
  const spawn = displayPosition(byId.get("eden-2026-11-12-v3ktr-first-spawn"), byId);
  assert.deepEqual(spawn, { x: 0, y: 0, method: "origin" });

  const camp = byId.get("example-maren-camp");
  const vein = displayPosition(byId.get("example-maren-vein"), byId);
  const offset = bearingOffset(200, 45);
  assert.equal(vein.method, "bearing");
  assert.ok(Math.abs(vein.x - (camp.properties.x + offset.x)) < 1e-9);
  assert.ok(Math.abs(vein.y - (camp.properties.y + offset.y)) < 1e-9);

  const bush = byId.get("example-maren-bush");
  const placedBush = displayPosition(bush, byId);
  assert.equal(bush.properties.approximate, true);
  assert.equal(placedBush.method, "bearing");
  assert.equal(bush.properties.x, null);
  assert.equal(bush.properties.y, null);
});
