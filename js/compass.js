/** Compass rose state.

data/compass.json is the only source for calibration. A missing file, a false
flag, or a null offset means the rose is not rotated and no direction is claimed.
*/

import { isFiniteNumber } from "./place.js";

export function readCompass(data) {
  const offset = data?.north_offset_deg;
  if (data?.calibrated === true && isFiniteNumber(offset)) {
    return { calibrated: true, northOffsetDeg: offset };
  }
  return { calibrated: false, northOffsetDeg: null };
}

export function compassPanelText(compass, world, northDerived, northNote) {
  const name = world || "this world";
  const derived =
    northDerived === true
      ? northNote || `North on ${name} has been derived.`
      : `North on ${name} is not derived yet.`;
  if (!compass?.calibrated) {
    return `The compass is uncalibrated. ${derived} No north offset has been measured in game, so the rose is not a claimed direction. Bearings will be degrees clockwise from the sun or the star on this world. Distances are meters.`;
  }
  return `The compass is calibrated. The rose is rotated ${compass.northOffsetDeg}° clockwise from display up. ${derived} Distances are meters.`;
}

export function compassSheetLabel(compass) {
  return compass?.calibrated === true ? "Calibrated" : "Uncalibrated";
}

export function compassRose(compass) {
  if (compass?.calibrated !== true) return { label: "", rotateDeg: null };
  return { label: "N", rotateDeg: compass.northOffsetDeg };
}
