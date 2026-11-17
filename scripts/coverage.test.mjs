import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { revealedFeatures, revealedShapes } from "../js/coverage.js";
import { pointInRing } from "../js/explored.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const coverage = JSON.parse(readFileSync(join(root, "data/eden/coverage.geojson"), "utf8"));

test("revealed polygons are world-scoped and ignore other kinds", () => {
  const extra = {
    world: "Eden",
    features: [
      ...coverage.features,
      {
        type: "Feature",
        id: "eden-note",
        geometry: null,
        properties: { id: "eden-note", world: "Eden", kind: "note" },
      },
      {
        type: "Feature",
        id: "hush-pad",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [10, 0],
              [10, 10],
              [0, 0],
            ],
          ],
        },
        properties: { id: "hush-pad", world: "Hush", kind: "revealed" },
      },
    ],
  };
  assert.equal(revealedFeatures(extra, "Eden").length, 1);
  assert.equal(revealedFeatures(extra, "Hush").length, 1);
  assert.equal(revealedShapes(extra, "Maren").length, 0);
});

test("the seeded relief survey reveals the public places and not the hatched corners", () => {
  const shapes = revealedShapes(coverage, "Eden");
  assert.equal(shapes.length, 1);
  const ring = shapes[0].rings[0];
  assert.equal(pointInRing(0, 0, ring), true);
  assert.equal(pointInRing(-2789.3, 244, ring), true);
  assert.equal(pointInRing(-101.8, -108.8, ring), true);
  assert.equal(pointInRing(85, -536.3, ring), true);
  assert.equal(pointInRing(-5500, 1800, ring), false);
  assert.equal(pointInRing(1500, 1800, ring), false);
});
