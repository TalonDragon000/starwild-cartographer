/** Display positions for the Starwild survey map.

Starwild has no in-game coordinates. Each world uses its own plane, in meters:
+x east, +y north. Bearings are degrees clockwise from that world's derived north.

x = anchor_x + distance_m * sin(bearing_deg)
y = anchor_y + distance_m * cos(bearing_deg)

Stored x and y are optional. An origin anchor is (0, 0). z is never plotted.
*/

export function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function bearingOffset(distanceMeters, bearingDegrees) {
  const radians = (bearingDegrees * Math.PI) / 180;
  return {
    x: distanceMeters * Math.sin(radians),
    y: distanceMeters * Math.cos(radians),
  };
}

export function displayPosition(feature, byId, trail = new Set()) {
  const properties = feature?.properties;
  if (!properties || typeof properties !== "object") return null;
  const id = feature.id ?? properties.id;
  if (typeof id !== "string" || trail.has(id)) return null;

  trail.add(id);
  try {
    if (properties.origin === true) {
      return { x: 0, y: 0, method: "origin" };
    }
    if (isFiniteNumber(properties.x) && isFiniteNumber(properties.y)) {
      return { x: properties.x, y: properties.y, method: "stored" };
    }
    if (
      isFiniteNumber(properties.bearing_deg) &&
      isFiniteNumber(properties.distance_m) &&
      typeof properties.anchor_id === "string"
    ) {
      const anchor = byId.get(properties.anchor_id);
      if (!anchor || anchor.properties?.world !== properties.world) return null;
      const base = displayPosition(anchor, byId, trail);
      if (!base) return null;
      const offset = bearingOffset(properties.distance_m, properties.bearing_deg);
      return {
        x: base.x + offset.x,
        y: base.y + offset.y,
        method: "bearing",
        anchorId: properties.anchor_id,
      };
    }
    return null;
  } finally {
    trail.delete(id);
  }
}

export function formatMeters(meters) {
  if (!isFiniteNumber(meters)) return null;
  const sign = meters < 0 ? "-" : "";
  const value = Math.abs(meters);
  if (value >= 1000) {
    const kilometers = value / 1000;
    const digits = kilometers >= 1000 ? 0 : 1;
    return `${sign}${trimNumber(kilometers.toFixed(digits))} km`;
  }
  return `${sign}${trimNumber(value.toFixed(1))} m`;
}

export function formatEastNorth(x, y) {
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;
  const east = `${formatMeters(Math.abs(x))} ${x < 0 ? "west" : "east"}`;
  const north = `${formatMeters(Math.abs(y))} ${y < 0 ? "south" : "north"}`;
  return `${east}, ${north}`;
}

function trimNumber(text) {
  return text.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}
