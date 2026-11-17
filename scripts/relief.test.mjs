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
  assert.match(record.method, /sun-referenced/);
  assert.match(record.method, /true north/);
  assert.match(record.method, /elevations are unknown/);
  assert.doesNotMatch(record.method, /northwest of the Lair/);
});

test("plate metres are Eden display metres from the Outpost", () => {
  assert.deepEqual(estimateToSite(0, 0), { x: 0, y: 0 });
  assert.deepEqual(estimateToSite(-2789.3, 244), { x: -2789.3, y: 244 });
  assert.deepEqual(estimateToSite(-101.8, -108.8), { x: -101.8, y: -108.8 });
  assert.deepEqual(estimateToSite(85, -536.3), { x: 85, y: -536.3 });
  const perMeter = svgUnitsPerMeter(record.calibration);
  assert.ok(Math.abs(perMeter - 0.094946829) < 1e-12);
});

test("the image corners cover the panorama places", () => {
  const bounds = imageBounds(record);
  assert.ok(bounds.west < -2789.3 && bounds.east > 85);
  assert.ok(bounds.south < -536.3 && bounds.north > 244);
  assert.ok(Math.abs(bounds.west - -6706.4562208812695) < 1e-6);
  assert.ok(Math.abs(bounds.east - 4213.339741972847) < 1e-6);
  assert.ok(Math.abs(bounds.south - -3795.8877910498736) < 1e-6);
  assert.ok(Math.abs(bounds.north - 2877.3208529165313) < 1e-6);
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
  assert.equal(lair.properties.category, "structures");
  assert.deepEqual(lair.geometry.coordinates, [-2789.3, 244]);
  assert.equal(lair.properties.z, null);
  assert.equal(lair.properties.bearing_deg, 275);
  assert.equal(lair.properties.anchor_id, outpost.properties.id);
  assert.equal(lair.properties.distance_m, 2800);
  assert.equal(outpost.properties.category, "outposts");

  assert.deepEqual(copper.geometry.coordinates, [85, -536.3]);
  assert.equal(copper.properties.bearing_deg, 171);
  assert.equal(copper.properties.z, null);
  assert.equal(copper.properties.distance_m, 543);
  assert.equal(copper.properties.anchor_id, outpost.properties.id);
  assert.match(copper.properties.quantity_notes, /Estimate \(unverified\)/);
  assert.match(copper.properties.quantity_notes, /171/);
  assert.match(copper.properties.quantity_notes, /elevation is unknown/i);
  assert.doesNotMatch(copper.properties.quantity_notes, /\+14 m/);
  assert.doesNotMatch(copper.properties.quantity_notes, /3\.5 km/);
  assert.doesNotMatch(copper.properties.quantity_notes, /northwest of the Lair/);

  assert.deepEqual(silica.geometry.coordinates, [-101.8, -108.8]);
  assert.equal(silica.properties.bearing_deg, 223.1);
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
