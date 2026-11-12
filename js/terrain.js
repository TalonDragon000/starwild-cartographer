/** Topographic view helpers.

Contours are decorative. Starwild has no elevation data. The height field is
seeded value noise in display meters, so the same view draws the same lines
on every load. Surveyed ground comes from data/terrain.geojson. Colors come
from data/surface-palette.json.

The storage key is duplicated by a short inline script in index.html so the
paper base can paint before this module loads.
*/

export const VIEW_STORAGE_KEY = "starwild-cartographer.mapView";

export const CONTOUR_SEED = 0x51a711ed;
export const CONTOUR_FIRST = 0.28;
export const CONTOUR_INTERVAL = 0.045;
export const CONTOUR_COUNT = 10;

const GRID_STEPS = [1, 10, 100, 1000, 10_000, 100_000, 1_000_000, 10_000_000];

const TERRAIN_KINDS = new Set(["surface", "lake", "river", "ridge", "outcrop"]);

export function parseView(value) {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if (text === "topo" || text === "topographic") return "topo";
  if (text === "simple") return "simple";
  return null;
}

export function contourLevels() {
  return Array.from({ length: CONTOUR_COUNT }, (_, index) => ({
    band: index + 1,
    value: CONTOUR_FIRST + index * CONTOUR_INTERVAL,
    index: (index + 1) % 5 === 0,
  }));
}

export function hashUnit(ix, iy, seed) {
  let n = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + (seed | 0);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

export function valueNoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const v00 = hashUnit(x0, y0, seed);
  const v10 = hashUnit(x0 + 1, y0, seed);
  const v01 = hashUnit(x0, y0 + 1, seed);
  const v11 = hashUnit(x0 + 1, y0 + 1, seed);
  const a = v00 + (v10 - v00) * tx;
  const b = v01 + (v11 - v01) * tx;
  return a + (b - a) * ty;
}

export function elevation(xMeters, yMeters, seed = CONTOUR_SEED) {
  let amplitude = 1;
  let frequency = 1 / 420;
  let sum = 0;
  let norm = 0;
  for (let octave = 0; octave < 4; octave += 1) {
    sum += amplitude * valueNoise(xMeters * frequency, yMeters * frequency, seed + octave * 1013);
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.05;
  }
  return sum / norm;
}

export function contourCellSize(spanMeters) {
  if (!Number.isFinite(spanMeters) || spanMeters <= 0) return 8;
  const rough = Math.max(spanMeters / 96, 1);
  return 2 ** Math.max(0, Math.round(Math.log2(rough)));
}

export function sampleField(bounds, cellSize, sample) {
  const x0 = Math.floor(bounds.xMin / cellSize) * cellSize;
  const y0 = Math.floor(bounds.yMin / cellSize) * cellSize;
  const cols = Math.floor((bounds.xMax - x0) / cellSize) + 2;
  const rows = Math.floor((bounds.yMax - y0) / cellSize) + 2;
  const values = new Float64Array(cols * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      values[row * cols + col] = sample(x0 + col * cellSize, y0 + row * cellSize);
    }
  }
  return { x0, y0, cellSize, cols, rows, values };
}

export function fieldForView(bounds, sample) {
  const span = Math.max(bounds.xMax - bounds.xMin, bounds.yMax - bounds.yMin, 1);
  let cellSize = contourCellSize(span);
  let field = sampleField(bounds, cellSize, sample);
  while ((field.cols > 150 || field.rows > 150) && cellSize < span) {
    cellSize *= 2;
    field = sampleField(bounds, cellSize, sample);
  }
  return field;
}

function lerpT(start, end, level) {
  if (start === end) return 0.5;
  return Math.min(1, Math.max(0, (level - start) / (end - start)));
}

function edgePoint(x, y, cell, edge, corners, level) {
  const [v0, v1, v2, v3] = corners;
  if (edge === 0) return [x + cell * lerpT(v0, v1, level), y];
  if (edge === 1) return [x + cell, y + cell * lerpT(v1, v2, level)];
  if (edge === 2) return [x + cell * lerpT(v3, v2, level), y + cell];
  return [x, y + cell * lerpT(v0, v3, level)];
}

function saddlePairs(code, center, level) {
  const centerHigh = center >= level;
  if (code === 5) return centerHigh ? [[3, 2], [0, 1]] : [[0, 3], [1, 2]];
  if (code === 10) return centerHigh ? [[0, 3], [1, 2]] : [[0, 1], [3, 2]];
  return [];
}

const PAIRS = {
  1: [[0, 3]],
  2: [[0, 1]],
  3: [[3, 1]],
  4: [[1, 2]],
  6: [[0, 2]],
  7: [[3, 2]],
  8: [[3, 2]],
  9: [[0, 2]],
  11: [[1, 2]],
  12: [[3, 1]],
  13: [[0, 1]],
  14: [[0, 3]],
};

function marchInto(target, field, level) {
  const { x0, y0, cellSize, cols, rows, values } = field;
  for (let row = 0; row < rows - 1; row += 1) {
    for (let col = 0; col < cols - 1; col += 1) {
      const v0 = values[row * cols + col];
      const v1 = values[row * cols + col + 1];
      const v2 = values[(row + 1) * cols + col + 1];
      const v3 = values[(row + 1) * cols + col];
      let code = 0;
      if (v0 >= level) code |= 1;
      if (v1 >= level) code |= 2;
      if (v2 >= level) code |= 4;
      if (v3 >= level) code |= 8;
      if (code === 0 || code === 15) continue;
      const corners = [v0, v1, v2, v3];
      const pairs =
        code === 5 || code === 10
          ? saddlePairs(code, (v0 + v1 + v2 + v3) / 4, level)
          : PAIRS[code];
      if (!pairs) continue;
      const x = x0 + col * cellSize;
      const y = y0 + row * cellSize;
      for (const [startEdge, endEdge] of pairs) {
        const start = edgePoint(x, y, cellSize, startEdge, corners, level);
        const end = edgePoint(x, y, cellSize, endEdge, corners, level);
        target.push([start[0], start[1], end[0], end[1]]);
      }
    }
  }
}

export function contourGeometry(field) {
  const normal = [];
  const index = [];
  for (const level of contourLevels()) {
    marchInto(level.index ? index : normal, field, level.value);
  }
  return { normal, index };
}

export function militarySteps(spanMeters) {
  const span = Number.isFinite(spanMeters) && spanMeters > 0 ? spanMeters : 1000;
  let bestMinor = 100;
  let bestScore = Infinity;
  for (const minor of GRID_STEPS) {
    const lines = span / minor;
    if (lines < 2 || lines > 24) continue;
    const score = Math.abs(Math.log(lines / 10));
    if (score < bestScore) {
      bestScore = score;
      bestMinor = minor;
    }
  }
  return { minor: bestMinor, major: bestMinor * 10 };
}

export function scaleSpec(pxPerMeter, targetPx = 180) {
  if (!Number.isFinite(pxPerMeter) || pxPerMeter <= 0) return null;
  const rawMeters = targetPx / pxPerMeter;
  if (!Number.isFinite(rawMeters) || rawMeters <= 0) return null;
  const power = 10 ** Math.floor(Math.log10(rawMeters));
  if (!Number.isFinite(power) || power === 0) return null;
  const fraction = rawMeters / power;
  const nice = fraction >= 4 ? 5 : fraction >= 1.7 ? 2 : 1;
  const meters = nice * power;
  return {
    meters,
    segments: 4,
    segmentMeters: meters / 4,
    px: meters * pxPerMeter,
  };
}

export function terrainVisible(feature, world, showExamples) {
  const properties = feature?.properties;
  if (!properties || feature.geometry == null) return false;
  if (properties.world !== world) return false;
  if (properties.example === true && showExamples !== true) return false;
  return true;
}

export function defaultSurfaceForKind(kind) {
  if (kind === "lake") return "water";
  if (kind === "outcrop") return "rock";
  return null;
}

export function terrainPresentation(feature, palette) {
  const properties = feature?.properties ?? {};
  const kind = properties.kind;
  const geometry = feature?.geometry?.type ?? "";
  const requested = typeof properties.surface === "string" ? properties.surface : defaultSurfaceForKind(kind);
  const swatch =
    palette?.surfaces?.find((surface) => surface.id === requested) ??
    palette?.fallback ?? {
      id: "other",
      label: "Other surface",
      fill: "#a89878",
      stroke: "#3a3228",
    };
  const example = properties.example === true;
  if (kind === "ridge") {
    return {
      layer: "line",
      color: palette?.contourIndex ?? "#2c1a0e",
      weight: 2,
      dashArray: "7 5",
      fill: false,
    };
  }
  if (kind === "river" || geometry === "LineString" || geometry === "MultiLineString") {
    const water = palette?.surfaces?.find((surface) => surface.id === "water");
    return {
      layer: "line",
      color: water?.stroke ?? swatch.stroke,
      weight: 2.5,
      dashArray: null,
      fill: false,
    };
  }
  if (geometry === "Point" || geometry === "MultiPoint") {
    return {
      layer: "point",
      fill: swatch.fill,
      color: swatch.stroke,
      radius: 6,
      fillOpacity: 1,
    };
  }
  return {
    layer: "fill",
    fill: swatch.fill,
    color: swatch.stroke,
    weight: example ? 2 : 1.25,
    dashArray: example ? "6 4" : null,
    fillOpacity: 1,
  };
}

export function isTerrainKind(kind) {
  return TERRAIN_KINDS.has(kind);
}
