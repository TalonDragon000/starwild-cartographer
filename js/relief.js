/** Georeference for the Eden relief estimate.

The plate measures metres from Talon's Public Outpost. East is +x and north is +y
on the plate. This site's Eden display plane uses Dragons Lair Base as (0, 0),
with the same axis directions. The Lair sits due north of the Outpost on the plate,
so a plate position becomes a display position by subtracting that northing:

site east = plate east
site north = plate north − lair northing

The image is the full rendered plate, including its title and legend. Its corners
are the SVG viewBox corners, converted with the same scale as the 0 m and 1000 m
east ticks. North uses that scale too. The plate's north axis increases upward.
*/

export function estimateToSite(east, north, lairNorthM) {
  return { x: east, y: north - lairNorthM };
}

export function svgUnitsPerMeter(calibration) {
  if (!calibration) return null;
  const span = calibration.eastTickSvgX - calibration.eastZeroSvgX;
  if (!(span > 0) || !(calibration.metersPerTick > 0)) return null;
  return span / calibration.metersPerTick;
}

export function imageBounds(record) {
  const calibration = record?.calibration;
  const perMeter = svgUnitsPerMeter(calibration);
  if (!calibration || !(perMeter > 0)) return null;
  if (typeof calibration.svgWidth !== "number" || typeof calibration.svgHeight !== "number") return null;
  if (typeof calibration.lairNorthM !== "number") return null;
  const east = (svgX) => (svgX - calibration.eastZeroSvgX) / perMeter;
  const north = (svgY) => (calibration.northZeroSvgY - svgY) / perMeter - calibration.lairNorthM;
  return {
    west: east(0),
    east: east(calibration.svgWidth),
    south: north(calibration.svgHeight),
    north: north(0),
  };
}
