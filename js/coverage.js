/** Revealed ground for the survey fog.

data/eden/coverage.geojson is a FeatureCollection in the map's metre plane:
x is east and y is north from that world's origin. A feature with kind
"revealed" (or no kind) clears the fog inside its polygon. Everything else
on that world stays fogged. Append a polygon to reveal a new aerial footprint.
Do not put another player's base in this file.
*/

export function revealedFeatures(collection, world) {
  const features = Array.isArray(collection?.features) ? collection.features : [];
  const selected = [];
  for (const feature of features) {
    const properties = feature?.properties ?? {};
    const featureWorld = properties.world ?? collection?.world;
    if (featureWorld !== world) continue;
    const kind = properties.kind ?? "revealed";
    if (kind !== "revealed") continue;
    const polygons = polygonRings(feature.geometry);
    if (polygons.length === 0) continue;
    selected.push({ feature, polygons });
  }
  return selected;
}

export function revealedShapes(collection, world) {
  const shapes = [];
  for (const entry of revealedFeatures(collection, world)) {
    for (const rings of entry.polygons) {
      shapes.push({ type: "polygon", rings, r: 0 });
    }
  }
  return shapes;
}

function polygonRings(geometry) {
  if (!geometry || typeof geometry !== "object") return [];
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    return usable(geometry.coordinates) ? [geometry.coordinates] : [];
  }
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.filter((polygon) => usable(polygon));
  }
  return [];
}

function usable(polygon) {
  const outer = polygon?.[0];
  return Array.isArray(outer) && outer.length >= 4;
}
