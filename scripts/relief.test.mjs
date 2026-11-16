import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { estimateToSite, imageBounds, svgUnitsPerMeter } from "../js/relief.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const record = JSON.parse(readFileSync(join(root, "data/eden-relief-estimate.json"), "utf8"));
const locations = JSON.parse(readFileSync(join(root, "data/locations.geojson"), "utf8"));

test("the relief plate is an Eden estimate and starts hidden", () => {
  assert.equal(record.world, "Eden");
  assert.equal(record.label, "Estimate (unverified)");
  assert.equal(record.defaultVisible, false);
  assert.equal(record.image, "data/eden-lair-relief-estimate.png");
  assert.equal(existsSync(join(root, record.image)), true);
  assert.match(record.method, /58 m/);
  assert.match(record.method, /hover/i);
  assert.match(record.method, /0 m datum/);
  assert.match(record.method, /panorama/);
  assert.match(record.method, /Outpost to Dragon's Lair/);
  assert.match(record.method, /elevations are unknown/);
  assert.doesNotMatch(record.method, /northwest of the Lair/);
});

test("plate metres are Eden display metres from the Outpost", () => {
  assert.deepEqual(estimateToSite(0, 0), { x: 0, y: 0 });
  assert.deepEqual(estimateToSite(0, 2800), { x: 0, y: 2800 });
  assert.deepEqual(estimateToSite(-117.2, 92), { x: -117.2, y: 92 });
  assert.deepEqual(estimateToSite(-526.9, -131.4), { x: -526.9, y: -131.4 });
  const perMeter = svgUnitsPerMeter(record.calibration);
  assert.ok(Math.abs(perMeter - 0.063657475) < 1e-12);
});

test("the image corners cover the panorama places", () => {
  const bounds = imageBounds(record);
  assert.ok(bounds.west < -526.9 && bounds.east > 0);
  assert.ok(bounds.south < -131.4 && bounds.north > 2800);
  assert.ok(Math.abs(bounds.west - -5284.123050749345) < 1e-9);
  assert.ok(Math.abs(bounds.east - 7383.674407443904) < 1e-9);
  assert.ok(Math.abs(bounds.south - -4179.480131752008) < 1e-9);
  assert.ok(Math.abs(bounds.north - 7131.053313063393) < 1e-9);
});

test("Eden places use the Outpost origin and the corrected panorama", () => {
  const byId = new Map(locations.features.map((feature) => [feature.id, feature]));
  const outpost = byId.get("eden-2026-11-16-talons-public-outpost");
  const lair = byId.get("eden-2026-11-12-dragons-lair-base");
  const copper = byId.get("eden-2026-11-16-talons-copper-site");
  const silica = byId.get("eden-2026-11-16-talons-silica-site");
  const elara = byId.get("eden-2026-11-16-elara");
  assert.ok(outpost && lair && copper && silica && elara);

  assert.equal(outpost.properties.origin, true);
  assert.deepEqual(outpost.geometry.coordinates, [0, 0, 0]);
  assert.equal(outpost.properties.z, 0);
  assert.match(outpost.properties.quantity_notes, /Estimate \(unverified\)/);

  assert.equal(lair.properties.origin, false);
  assert.deepEqual(lair.geometry.coordinates, [0, 2800]);
  assert.equal(lair.properties.z, null);
  assert.equal(lair.properties.anchor_id, outpost.properties.id);
  assert.equal(lair.properties.distance_m, 2800);

  assert.deepEqual(copper.geometry.coordinates, [-526.9, -131.4]);
  assert.equal(copper.properties.z, null);
  assert.equal(copper.properties.distance_m, 543);
  assert.equal(copper.properties.anchor_id, outpost.properties.id);
  assert.match(copper.properties.quantity_notes, /Estimate \(unverified\)/);
  assert.match(copper.properties.quantity_notes, /WSW/);
  assert.match(copper.properties.quantity_notes, /elevation is unknown/i);
  assert.doesNotMatch(copper.properties.quantity_notes, /\+14 m/);
  assert.doesNotMatch(copper.properties.quantity_notes, /3\.5 km/);
  assert.doesNotMatch(copper.properties.quantity_notes, /northwest of the Lair/);

  assert.deepEqual(silica.geometry.coordinates, [-117.2, 92]);
  assert.equal(silica.properties.z, null);
  assert.equal(silica.properties.distance_m, 149);
  assert.equal(silica.properties.anchor_id, outpost.properties.id);
  assert.match(silica.properties.quantity_notes, /Estimate \(unverified\)/);

  assert.equal(elara.geometry, null);
  assert.equal(elara.properties.x, null);
  assert.match(elara.properties.quantity_notes, /not placed/i);

  const origins = locations.features.filter(
    (feature) => feature.properties.world === "Eden" && feature.properties.origin === true,
  );
  assert.deepEqual(
    origins.map((feature) => feature.id),
    ["eden-2026-11-16-talons-public-outpost"],
  );
});
