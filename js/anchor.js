/** Eden's display origin, and places still waiting on a measured shift.

origin_anchor in data/location-schema.json names the 0,0 place. offset_from_previous_m
stays null until the previous anchor's position in the new frame has been measured.
A reanchor_pending place is listed in the info panel and is not plotted.
*/

import { formatEastNorth, isFiniteNumber } from "./place.js";

export function measuredOffset(anchor) {
  const offset = anchor?.offset_from_previous_m;
  if (!offset || typeof offset !== "object") return null;
  if (!isFiniteNumber(offset.x) || !isFiniteNumber(offset.y)) return null;
  return { x: offset.x, y: offset.y };
}

export function reanchorCopy(anchor, pending, exploredPending) {
  const places = Array.isArray(pending) ? pending : [];
  if (places.length === 0 && exploredPending !== true) return "";
  const originName =
    typeof anchor?.name === "string" && anchor.name.trim() !== "" ? anchor.name.trim() : "The current origin";
  const offset = measuredOffset(anchor);
  const offsetLine = offset
    ? `Recorded offset of the previous anchor: ${formatEastNorth(offset.x, offset.y)}. Listed places stay off the map until their stored positions are updated.`
    : "The offset from the previous anchor has not been measured.";
  const names = places
    .map((feature) => feature?.properties?.region || feature?.properties?.id)
    .filter((name) => typeof name === "string" && name.trim() !== "");
  const placeLine = names.length > 0 ? `Not plotted: ${names.join(", ")}.` : "";
  const walked = exploredPending === true ? "Walked ground recorded on the previous anchor is not drawn." : "";
  return [`Re-anchor pending. ${originName} is the 0,0 anchor.`, offsetLine, placeLine, walked]
    .filter((part) => part !== "")
    .join(" ");
}
