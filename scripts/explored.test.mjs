import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { areaRings } from "../js/terrain.js";
import {
  EXPLORED_REFRESH_MS,
  collectionRadius,
  distanceToSegment,
  exploredFeatures,
  exploredFraction,
  formatExploredPercent,
  formatExploredReadout,
  parseDemo,
  pointInRings,
  pointRevealed,
  revealShapes,
} from "../js/explored.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const explored = JSON.parse(readFileSync(join(root, "data/explored.geojson"), "utf8"));
const terrain = JSON.parse(readFileSync(join(root, "data/terrain.geojson"), "utf8"));

test("demo query is explicit", () => {
  assert.equal(parseDemo("1"), true);
  assert.equal(parseDemo(" true "), true);
  assert.equal(parseDemo("yes"), true);
  assert.equal(parseDemo("0"), false);
  assert.equal(parseDemo(""), false);
  assert.equal(parseDemo(null), false);
});

test("the sheet refetches explored ground once a minute", () => {
  assert.equal(EXPLORED_REFRESH_MS, 60_000);
});

test("a visited point reveals its buffer and nothing past it", () => {
  const shapes = revealShapes([
    {
      feature: { type: "Feature", geometry: { type: "Point", coordinates: [0, 0] } },
      radius: 40,
    },
  ]);
  assert.equal(pointRevealed(0, 0, shapes), true);
  assert.equal(pointRevealed(40, 0, shapes), true);
  assert.equal(pointRevealed(41, 0, shapes), false);
});

test("a walked line reveals a strip", () => {
  const shapes = revealShapes([
    {
      feature: {
        type: "Feature",
        geometry: { type: "LineString", coordinates: [[0, 0], [100, 0]] },
      },
      radius: 10,
    },
  ]);
  assert.equal(pointRevealed(50, 9, shapes), true);
  assert.equal(pointRevealed(50, 11, shapes), false);
  assert.equal(pointRevealed(-10, 0, shapes), true);
  assert.equal(pointRevealed(-11, 0, shapes), false);
  assert.ok(distanceToSegment(50, 9, 0, 0, 100, 0) <= 10);
});

test("a polygon reveals its interior and a buffer, and a hole stays closed", () => {
  const shapes = revealShapes([
    {
      feature: {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [[0, 0], [60, 0], [60, 60], [0, 60], [0, 0]],
            [[20, 20], [40, 20], [40, 40], [20, 40], [20, 20]],
          ],
        },
      },
      radius: 4,
    },
  ]);
  assert.equal(pointRevealed(5, 5, shapes), true);
  assert.equal(pointRevealed(62, 30, shapes), true);
  assert.equal(pointRevealed(30, 30, shapes), false);
  assert.equal(pointRevealed(80, 30, shapes), false);
  assert.equal(pointInRings(5, 5, shapes[0].rings), true);
  assert.equal(pointInRings(30, 30, shapes[0].rings), false);
});

test("example tracks stay hidden until demo is on", () => {
  const hidden = exploredFeatures(explored, "Maren", false);
  const shown = exploredFeatures(explored, "Maren", true);
  assert.equal(hidden.length, 0);
  assert.equal(shown.length, 1);
  assert.equal(shown[0].feature.properties.example, true);
  assert.equal(shown[0].radius, 28);
});

test("Dragons Lair Base is revealed on Eden and the default radius applies", () => {
  assert.equal(collectionRadius(explored), 40);
  const entries = exploredFeatures(explored, "Eden", false);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].feature.id, "eden-2026-11-12-dragons-lair-base");
  assert.equal(entries[0].feature.properties.example, false);
  assert.equal(entries[0].radius, 40);
  const shapes = revealShapes(entries);
  assert.equal(pointRevealed(0, 0, shapes), true);
  assert.equal(pointRevealed(400, 0, shapes), false);
  assert.equal(exploredFeatures(explored, "Hush", true).length, 0);
});

test("the hidden demo track crosses the example grass and leaves some of it fogged", () => {
  const grass = terrain.features.find((feature) => feature.id === "example-maren-grass");
  const rings = areaRings(grass);
  const shapes = revealShapes(exploredFeatures(explored, "Maren", true));
  let covered = 0;
  let fogged = 0;
  for (let x = 120; x <= 220; x += 5) {
    for (let y = 50; y <= 160; y += 5) {
      if (!pointInRings(x, y, rings[0])) continue;
      if (pointRevealed(x, y, shapes)) covered += 1;
      else fogged += 1;
    }
  }
  assert.ok(covered > 8, `expected the demo track to cover grass, got ${covered}`);
  assert.ok(fogged > 4, `expected some example grass to stay fogged, got ${fogged}`);
});

test("explored fraction is the share of the view inside the reveal", () => {
  assert.equal(exploredFraction({ xMin: 0, yMin: 0, xMax: 100, yMax: 100 }, []), 0);
  const shapes = revealShapes([
    {
      feature: { type: "Feature", geometry: { type: "Point", coordinates: [50, 50] } },
      radius: 500,
    },
  ]);
  assert.equal(exploredFraction({ xMin: 0, yMin: 0, xMax: 100, yMax: 100 }, shapes), 1);
  const speck = revealShapes([
    {
      feature: { type: "Feature", geometry: { type: "Point", coordinates: [0, 0] } },
      radius: 40,
    },
  ]);
  const fraction = exploredFraction({ xMin: -400, yMin: -300, xMax: 400, yMax: 300 }, speck);
  assert.equal(formatExploredPercent(fraction), "<1%");
});

test("the readout names a percent and the last update", () => {
  assert.equal(formatExploredPercent(0), "0%");
  assert.equal(formatExploredPercent(0.004), "<1%");
  assert.equal(formatExploredPercent(0.126), "13%");
  assert.equal(formatExploredPercent(1), "100%");
  assert.match(
    formatExploredReadout(0.5, null, "2026-11-12T22:05:00"),
    /^50% of this view\nlast updated \d{1,2}:05 (AM|PM)$/,
  );
  assert.match(
    formatExploredReadout(0, "2026-11-12", "2026-11-12T15:04:00"),
    /^0% of this view\nupdated 2026-11-12 · checked \d{1,2}:04 (AM|PM)$/,
  );
  assert.equal(formatExploredReadout(0, null, null), "0% of this view\nlast updated —");
});
