import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  contourGeometry,
  contourLevels,
  elevation,
  fieldForView,
  militarySteps,
  parseInfoOpen,
  parseView,
  sampleField,
  scaleSpec,
  terrainPresentation,
  terrainVisible,
} from "../js/terrain.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const palette = JSON.parse(readFileSync(join(root, "data/surface-palette.json"), "utf8"));
const schema = JSON.parse(readFileSync(join(root, "data/location-schema.json"), "utf8"));

function channel(value) {
  const ratio = value / 255;
  return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const number = Number.parseInt(hex.slice(1), 16);
  const red = channel((number >> 16) & 255);
  const green = channel((number >> 8) & 255);
  const blue = channel(number & 255);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first, second) {
  const left = luminance(first);
  const right = luminance(second);
  const [high, low] = left > right ? [left, right] : [right, left];
  return (high + 0.05) / (low + 0.05);
}

test("view query accepts topo and simple only", () => {
  assert.equal(parseView("topo"), "topo");
  assert.equal(parseView(" topographic "), "topo");
  assert.equal(parseView("SIMPLE"), "simple");
  assert.equal(parseView("banana"), null);
  assert.equal(parseView(null), null);
});

test("map info stays closed unless it was saved open", () => {
  assert.equal(parseInfoOpen("open"), true);
  assert.equal(parseInfoOpen("closed"), false);
  assert.equal(parseInfoOpen(null), false);
  assert.equal(parseInfoOpen(""), false);
});

test("elevation is stable and varies across the plane", () => {
  assert.equal(elevation(12, -40), elevation(12, -40));
  assert.notEqual(elevation(12, -40), elevation(13, -40));
  assert.ok(elevation(0, 0) > 0 && elevation(0, 0) < 1);
});

test("index contours are every fifth band", () => {
  const levels = contourLevels();
  assert.deepEqual(
    levels.filter((level) => level.index).map((level) => level.band),
    [5, 10],
  );
  const values = levels.map((level) => level.value);
  assert.deepEqual(values, [...values].sort((a, b) => a - b));
});

test("a known ramp produces vertical contours", () => {
  const field = sampleField({ xMin: 0, yMin: 0, xMax: 1, yMax: 1 }, 1, (x) => x);
  const segments = [...contourGeometry(field).normal, ...contourGeometry(field).index];
  const vertical = segments.filter(
    (segment) => Math.abs(segment[0] - segment[2]) < 1e-9 && segment[1] !== segment[3],
  );
  assert.ok(vertical.length >= 5);
  for (const segment of vertical) {
    assert.ok(segment[0] > 0 && segment[0] < 1);
  }
});

test("contour geometry does not change between calls", () => {
  const bounds = { xMin: -200, yMin: -200, xMax: 200, yMax: 200 };
  const sample = (x, y) => elevation(x, y);
  const first = contourGeometry(fieldForView(bounds, sample));
  const second = contourGeometry(fieldForView(bounds, sample));
  assert.deepEqual(first, second);
  assert.ok(first.normal.length + first.index.length > 0);
});

test("military grid prefers 100 m squares on a short span", () => {
  assert.deepEqual(militarySteps(800), { minor: 100, major: 1000 });
  assert.deepEqual(militarySteps(200), { minor: 10, major: 100 });
  assert.deepEqual(militarySteps(100_000), { minor: 10_000, major: 100_000 });
});

test("scale bar picks a readable meter length", () => {
  const spec = scaleSpec(1, 180);
  assert.equal(spec.meters, 200);
  assert.equal(spec.segments, 4);
  assert.ok(spec.px >= 120 && spec.px <= 260);
});

test("example terrain stays hidden until examples are on", () => {
  const feature = {
    geometry: { type: "Polygon" },
    properties: { world: "Maren", example: true },
  };
  assert.equal(terrainVisible(feature, "Maren", false), false);
  assert.equal(terrainVisible(feature, "Maren", true), true);
  assert.equal(terrainVisible(feature, "Eden", true), false);
  assert.equal(
    terrainVisible({ geometry: { type: "Polygon" }, properties: { world: "Eden", example: false } }, "Eden", false),
    true,
  );
});

test("surface polygons use the palette and lakes default to water", () => {
  const grass = terrainPresentation(
    {
      geometry: { type: "Polygon" },
      properties: { kind: "surface", surface: "grass", example: true },
    },
    palette,
  );
  assert.equal(grass.layer, "fill");
  assert.equal(grass.fill, "#6f8a32");
  assert.equal(grass.dashArray, "6 4");

  const lake = terrainPresentation(
    { geometry: { type: "Polygon" }, properties: { kind: "lake", surface: null, example: false } },
    palette,
  );
  assert.equal(lake.fill, "#4e7384");
  assert.equal(lake.dashArray, null);

  const ridge = terrainPresentation(
    { geometry: { type: "LineString" }, properties: { kind: "ridge", surface: null } },
    palette,
  );
  assert.equal(ridge.layer, "line");
  assert.equal(ridge.dashArray, "7 5");
});

test("topographic ink and marker plates meet WCAG AA", () => {
  assert.ok(contrast(palette.ink, palette.paper) >= 4.5);
  assert.ok(contrast(palette.contour, palette.paper) >= 3);
  assert.ok(contrast(palette.contourIndex, palette.paper) >= 3);
  assert.ok(contrast(palette.grid, palette.paper) >= 4.5);
  assert.ok(contrast(palette.gridMinor, palette.paper) >= 3);
  for (const surface of palette.surfaces) {
    const separated = Math.max(
      contrast(palette.markerPlate, surface.fill),
      contrast(palette.markerRing, surface.fill),
    );
    assert.ok(separated >= 3, `${surface.id} does not separate a marker`);
    assert.notEqual(surface.fill, palette.paper);
  }
  for (const category of schema.categories) {
    assert.ok(contrast(category.color, palette.markerPlate) >= 3, category.id);
    assert.ok(contrast(category.color, "#08141c") >= 3, `${category.id} on the simple map`);
  }
});
