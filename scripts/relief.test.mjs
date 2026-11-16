import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { estimateToSite, imageBounds, svgUnitsPerMeter } from "../js/relief.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const record = JSON.parse(readFileSync(join(root, "data/eden-relief-estimate.json"), "utf8"));
const locations = JSON.parse(readFileSync(join(root, "data/locations.geojson"), "utf8"));

const lairNorth = record.calibration.lairNorthM;

test("the relief plate is an Eden estimate and starts hidden", () => {
  assert.equal(record.world, "Eden");
  assert.equal(record.label, "Estimate (unverified)");
  assert.equal(record.defaultVisible, false);
  assert.equal(record.image, "data/eden-lair-relief-estimate.png");
  assert.equal(existsSync(join(root, record.image)), true);
  assert.match(record.method, /58 m/);
  assert.match(record.method, /hover/i);
  assert.match(record.method, /0 m datum/);
  assert.match(record.method, /Nav/);
  assert.match(record.method, /Outpost to Dragon's Lair/);
});

test("plate metres shift onto the Dragon's Lair origin", () => {
  assert.deepEqual(estimateToSite(0, lairNorth, lairNorth), { x: 0, y: 0 });
  assert.deepEqual(estimateToSite(0, 0, lairNorth), { x: 0, y: -2936.2 });
  const copper = estimateToSite(-2995.4, 1810.4, lairNorth);
  assert.equal(copper.x, -2995.4);
  assert.ok(Math.abs(copper.y - -1125.8) < 1e-9);
  const perMeter = svgUnitsPerMeter(record.calibration);
  assert.ok(Math.abs(perMeter - 0.063657474) < 1e-12);
});

test("the image corners cover the placed estimate and the Lair", () => {
  const bounds = imageBounds(record);
  assert.ok(bounds.west < -2995.4 && bounds.east > 0);
  assert.ok(bounds.south < -2936.2 && bounds.north > 0);
  assert.ok(Math.abs(bounds.west - -6484.123152608917) < 1e-9);
  assert.ok(Math.abs(bounds.east - 6183.674504583705) < 1e-9);
  assert.ok(Math.abs(bounds.south - -6915.680194265957) < 1e-9);
  assert.ok(Math.abs(bounds.north - 4394.853428227456) < 1e-9);
});

test("new Eden places are estimates, and unplaced ones are not plotted", () => {
  const byId = new Map(locations.features.map((feature) => [feature.id, feature]));
  const outpost = byId.get("eden-2026-11-16-talons-public-outpost");
  const copper = byId.get("eden-2026-11-16-talons-copper-site");
  const elara = byId.get("eden-2026-11-16-elara");
  const silica = byId.get("eden-2026-11-16-talons-silica-site");
  assert.ok(outpost && copper && elara && silica);

  assert.deepEqual(outpost.geometry.coordinates, [0, -2936.2, 0]);
  assert.equal(outpost.properties.x, 0);
  assert.equal(outpost.properties.y, -2936.2);
  assert.equal(outpost.properties.z, 0);
  assert.equal(outpost.properties.approximate, true);
  assert.equal(outpost.properties.origin, false);
  assert.match(outpost.properties.quantity_notes, /Estimate \(unverified\)/);

  assert.deepEqual(copper.geometry.coordinates, [-2995.4, -1125.8, 14]);
  assert.equal(copper.properties.x, -2995.4);
  assert.equal(copper.properties.approximate, true);
  assert.match(copper.properties.quantity_notes, /Estimate \(unverified\)/);
  assert.match(copper.properties.quantity_notes, /west of the Outpost-to-Lair line/);
  assert.match(copper.properties.quantity_notes, /northwest of the Lair/);
  assert.doesNotMatch(copper.properties.quantity_notes, /east of/);

  for (const feature of [elara, silica]) {
    assert.equal(feature.geometry, null);
    assert.equal(feature.properties.x, null);
    assert.equal(feature.properties.y, null);
    assert.equal(feature.properties.bearing_deg, null);
    assert.equal(feature.properties.approximate, true);
    assert.match(feature.properties.quantity_notes, /Estimate \(unverified\)/);
    assert.match(feature.properties.quantity_notes, /not placed/i);
  }

  const origins = locations.features.filter(
    (feature) => feature.properties.world === "Eden" && feature.properties.origin === true,
  );
  assert.deepEqual(
    origins.map((feature) => feature.id),
    ["eden-2026-11-12-dragons-lair-base"],
  );
});
