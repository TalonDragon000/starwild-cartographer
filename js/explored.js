/** Explored ground for the topographic sheet.

data/explored.geojson lists points and paths V3KTR has traveled. The sheet
reveals a buffer around each feature and leaves the rest in fog. radius_m on
a feature overrides default_radius_m. Example features stay hidden unless the
page is opened with ?demo=1.

Coordinates are display meters, [east, north], on the same plane as locations.
The buffer is how far the sheet clears around a track. It is not a surveyed edge.
*/

export const EXPLORED_REFRESH_MS = 60_000;
export const DEFAULT_REVEAL_RADIUS_M = 40;

export function parseDemo(value) {
  if (typeof value !== "string") return false;
  const text = value.trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes";
}

export function collectionRadius(collection) {
  const value = collection?.default_radius_m;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  return DEFAULT_REVEAL_RADIUS_M;
}

export function featureRadius(feature, fallback) {
  const radius = feature?.properties?.radius_m;
  if (typeof radius === "number" && Number.isFinite(radius) && radius > 0) return radius;
  if (typeof fallback === "number" && Number.isFinite(fallback) && fallback > 0) return fallback;
  return DEFAULT_REVEAL_RADIUS_M;
}

export function exploredFeatures(collection, world, showDemo) {
  const fallback = collectionRadius(collection);
  const entries = [];
  for (const feature of collection?.features ?? []) {
    const properties = feature?.properties;
    if (!properties || feature.type !== "Feature" || feature.geometry == null) continue;
    if (properties.world !== world) continue;
    if (properties.example === true && showDemo !== true) continue;
    entries.push({ feature, radius: featureRadius(feature, fallback) });
  }
  return entries;
}

function pair(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  if (!Number.isFinite(value[0]) || !Number.isFinite(value[1])) return null;
  return [value[0], value[1]];
}

function pushLine(shapes, coordinates, radius) {
  const points = [];
  for (const position of coordinates ?? []) {
    const point = pair(position);
    if (point) points.push(point);
  }
  if (points.length === 0) return;
  if (points.length === 1) {
    shapes.push({ type: "circle", x: points[0][0], y: points[0][1], r: radius });
    return;
  }
  shapes.push({ type: "line", points, r: radius });
}

function pushPolygon(shapes, coordinates, radius) {
  const rings = [];
  for (const ring of coordinates ?? []) {
    const points = [];
    for (const position of ring ?? []) {
      const point = pair(position);
      if (point) points.push(point);
    }
    if (points.length >= 3) rings.push(points);
  }
  if (rings.length > 0) shapes.push({ type: "polygon", rings, r: radius });
}

export function revealShapes(entries) {
  const shapes = [];
  for (const { feature, radius } of entries) {
    const geometry = feature.geometry;
    const type = geometry?.type;
    const coordinates = geometry?.coordinates;
    if (type === "Point") {
      const point = pair(coordinates);
      if (point) shapes.push({ type: "circle", x: point[0], y: point[1], r: radius });
    } else if (type === "MultiPoint") {
      for (const position of coordinates ?? []) {
        const point = pair(position);
        if (point) shapes.push({ type: "circle", x: point[0], y: point[1], r: radius });
      }
    } else if (type === "LineString") {
      pushLine(shapes, coordinates, radius);
    } else if (type === "MultiLineString") {
      for (const line of coordinates ?? []) pushLine(shapes, line, radius);
    } else if (type === "Polygon") {
      pushPolygon(shapes, coordinates, radius);
    } else if (type === "MultiPolygon") {
      for (const polygon of coordinates ?? []) pushPolygon(shapes, polygon, radius);
    }
  }
  return shapes;
}

export function distanceToSegment(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(x - x1, y - y1);
  const t = Math.min(1, Math.max(0, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

export function pointInRing(x, y, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const xi = ring[index][0];
    const yi = ring[index][1];
    const xj = ring[previous][0];
    const yj = ring[previous][1];
    const crosses = yi > y !== yj > y;
    if (!crosses) continue;
    const edge = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (x < edge) inside = !inside;
  }
  return inside;
}

export function pointInRings(x, y, rings) {
  if (!Array.isArray(rings) || rings.length === 0 || !pointInRing(x, y, rings[0])) return false;
  for (let index = 1; index < rings.length; index += 1) {
    if (pointInRing(x, y, rings[index])) return false;
  }
  return true;
}

function nearPolyline(x, y, points, radius) {
  for (let index = 1; index < points.length; index += 1) {
    const [x1, y1] = points[index - 1];
    const [x2, y2] = points[index];
    if (distanceToSegment(x, y, x1, y1, x2, y2) <= radius) return true;
  }
  return false;
}

export function pointRevealed(x, y, shapes) {
  for (const shape of shapes) {
    if (shape.type === "circle") {
      if (Math.hypot(x - shape.x, y - shape.y) <= shape.r) return true;
    } else if (shape.type === "line") {
      if (nearPolyline(x, y, shape.points, shape.r)) return true;
    } else if (shape.type === "polygon") {
      if (pointInRings(x, y, shape.rings) || nearPolyline(x, y, shape.rings[0], shape.r)) return true;
      for (let index = 1; index < shape.rings.length; index += 1) {
        if (nearPolyline(x, y, shape.rings[index], shape.r)) return true;
      }
    }
  }
  return false;
}

export function exploredFraction(bounds, shapes, columns = 48) {
  if (!Array.isArray(shapes) || shapes.length === 0) return 0;
  const width = bounds.xMax - bounds.xMin;
  const height = bounds.yMax - bounds.yMin;
  if (!(width > 0) || !(height > 0)) return 0;
  const across = Math.max(2, columns);
  const down = across;
  let hits = 0;
  const total = across * down;
  for (let row = 0; row < down; row += 1) {
    const y = bounds.yMin + ((row + 0.5) / down) * height;
    for (let column = 0; column < across; column += 1) {
      const x = bounds.xMin + ((column + 0.5) / across) * width;
      if (pointRevealed(x, y, shapes)) hits += 1;
    }
  }
  return hits / total;
}

export function formatExploredPercent(fraction) {
  if (!Number.isFinite(fraction) || fraction <= 0) return "0%";
  if (fraction >= 0.995) return "100%";
  const percent = fraction * 100;
  if (percent < 1) return "<1%";
  return `${Math.round(percent)}%`;
}

function formatClock(iso) {
  if (typeof iso !== "string") return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${suffix}`;
}

export function formatExploredReadout(fraction, fileUpdated, fetchedAtIso) {
  const percent = formatExploredPercent(fraction);
  const clock = formatClock(fetchedAtIso);
  let when = "last updated —";
  if (typeof fileUpdated === "string" && fileUpdated.trim()) {
    when = `updated ${fileUpdated.trim()}${clock ? ` · checked ${clock}` : ""}`;
  } else if (clock) {
    when = `last updated ${clock}`;
  }
  return `${percent} of this view\n${when}`;
}
