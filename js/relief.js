/** Georeference for the Eden relief estimate.

The plate and the Eden display plane both use Talon's Public Outpost as (0, 0).
East is +x and north is +y. A plate position is already a display position.

The image is the full rendered plate, including its title, inset, and legend.
Its corners are the SVG viewBox corners, converted with the same scale as the
0 m and 1000 m east ticks. North uses that scale too. The plate's north axis
increases upward.
*/

export function estimateToSite(east, north) {
  return { x: east, y: north };
}

export function svgUnitsPerMeter(calibration) {
  if (!calibration) return null;
  const span = calibration.eastTickSvgX - calibration.eastZeroSvgX;
  if (!(span > 0) || !(calibration.metersPerTick > 0)) return null;
  return span / calibration.metersPerTick;
}

function finiteBounds(box) {
  if (!box) return null;
  const { west, east, south, north } = box;
  if (![west, east, south, north].every((value) => typeof value === "number" && Number.isFinite(value))) return null;
  if (!(east > west) || !(north > south)) return null;
  return { west, east, south, north };
}

export function imageBounds(record) {
  const explicit = finiteBounds(record?.extent?.image);
  if (explicit) return explicit;
  const calibration = record?.calibration;
  const perMeter = svgUnitsPerMeter(calibration);
  if (!calibration || !(perMeter > 0)) return null;
  if (typeof calibration.svgWidth !== "number" || typeof calibration.svgHeight !== "number") return null;
  const east = (svgX) => (svgX - calibration.eastZeroSvgX) / perMeter;
  const north = (svgY) => (calibration.northZeroSvgY - svgY) / perMeter;
  return {
    west: east(0),
    east: east(calibration.svgWidth),
    south: north(calibration.svgHeight),
    north: north(0),
  };
}
