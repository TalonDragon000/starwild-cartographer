import {
  displayPosition,
  formatEastNorth,
  formatMeters,
  isFiniteNumber,
} from "./place.js";

const form = document.querySelector("#filters");
const worldSelect = document.querySelector("#world");
const searchInput = document.querySelector("#search");
const examplesInput = document.querySelector("#show-examples");
const categoryList = document.querySelector("#category-list");
const summary = document.querySelector("#summary");
const northNote = document.querySelector("#north-note");
const mapHeading = document.querySelector("#map-heading");
const mapEmpty = document.querySelector("#map-empty");
const cursor = document.querySelector("#cursor");
const loadError = document.querySelector("#load-error");
const caption = document.querySelector("#locations caption");
const tbody = document.querySelector("#locations tbody");

const markers = new Map();
let schema = null;
let features = [];
let byId = new Map();
let categoriesById = new Map();
let positions = new Map();
let skipped = 0;

if (typeof L === "undefined") {
  showError("The map library did not load. The page can still list locations once the data file loads.");
}

const map = typeof L === "undefined" ? null : L.map(document.querySelector("#map"), {
  crs: L.CRS.Simple,
  minZoom: -8,
  maxZoom: 4,
  zoomSnap: 0.25,
  zoomControl: true,
  attributionControl: true,
});
if (map) {
  map.attributionControl.setPrefix("");
  map.attributionControl.addAttribution("Meters, not latitude or longitude.");
  map.setView(L.latLng(0, 0), 0, { animate: false });
}
const markerLayer = map ? L.layerGroup().addTo(map) : null;
if (map) meterGrid().addTo(map);

form.addEventListener("submit", (event) => event.preventDefault());
worldSelect.addEventListener("change", render);
searchInput.addEventListener("input", render);
examplesInput.addEventListener("change", render);
document.querySelector("#categories-all").addEventListener("click", () => setCategories(true));
document.querySelector("#categories-none").addEventListener("click", () => setCategories(false));
if (map) {
  map.on("mousemove", (event) => {
    cursor.textContent = formatEastNorth(event.latlng.lng, event.latlng.lat);
  });
  map.on("mouseout", () => {
    cursor.textContent = "";
  });
}

main();

async function main() {
  try {
    const [loadedSchema, collection] = await Promise.all([
      fetchJson("data/location-schema.json"),
      fetchJson("data/locations.geojson"),
    ]);
    schema = loadedSchema;
    categoriesById = new Map((schema.categories ?? []).map((category) => [category.id, category]));
    const accepted = [];
    for (const feature of collection.features ?? []) {
      if (usable(feature)) accepted.push(feature);
      else skipped += 1;
    }
    features = accepted;
    byId = new Map(features.map((feature) => [feature.id, feature]));
    positions = new Map(features.map((feature) => [feature.id, displayPosition(feature, byId)]));
    buildWorlds();
    buildCategories();
    if (skipped > 0) {
      showError(
        `${skipped} location${skipped === 1 ? "" : "s"} could not be read and ${skipped === 1 ? "was" : "were"} left off the map.`,
      );
    }
    render();
  } catch (error) {
    showError("The map could not load location data. Check data/locations.geojson and data/location-schema.json.");
    summary.textContent = "Location data did not load.";
    console.error(error);
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

function usable(feature) {
  const properties = feature?.properties;
  if (!properties || feature.type !== "Feature") return false;
  if (typeof properties.id !== "string" || feature.id !== properties.id) return false;
  if (!schema.worlds?.includes(properties.world)) return false;
  if (!categoriesById.has(properties.category)) return false;
  if (typeof properties.example !== "boolean") return false;
  return true;
}

function buildWorlds() {
  for (const world of schema.worlds ?? []) {
    const option = document.createElement("option");
    option.value = world;
    option.textContent = world;
    worldSelect.append(option);
  }
  worldSelect.value = (schema.worlds ?? []).includes("Eden") ? "Eden" : worldSelect.value;
}

function buildCategories() {
  for (const category of schema.categories ?? []) {
    const item = document.createElement("li");
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "category";
    input.value = category.id;
    input.checked = true;
    input.addEventListener("change", render);
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.innerHTML = iconSvg(category.shape, category.color, {});
    const name = document.createElement("span");
    name.textContent = category.label;
    const count = document.createElement("span");
    count.className = "count";
    count.dataset.category = category.id;
    count.textContent = "0";
    label.append(input, swatch, name, count);
    item.append(label);
    categoryList.append(item);
  }
}

function setCategories(checked) {
  for (const input of categoryList.querySelectorAll("input")) input.checked = checked;
  render();
}

function selectedCategories() {
  return new Set(
    [...categoryList.querySelectorAll("input:checked")].map((input) => input.value),
  );
}

function render() {
  if (!schema) return;
  const world = worldSelect.value;
  const query = searchInput.value.trim().toLowerCase();
  const showExamples = examplesInput.checked;
  const categories = selectedCategories();
  const northDerived = schema.world_compass?.[world]?.north_derived === true;

  mapHeading.textContent = `Map of ${world}`;
  document.querySelector(".map-frame").setAttribute("aria-label", `Map of ${world}`);
  northNote.textContent = northCopy(world);

  for (const count of categoryList.querySelectorAll(".count")) {
    const category = count.dataset.category;
    const total = features.filter((feature) => {
      return (
        feature.properties.world === world &&
        feature.properties.category === category &&
        (showExamples || feature.properties.example === false) &&
        matchesQuery(feature, query)
      );
    }).length;
    count.textContent = String(total);
  }

  const visible = features.filter((feature) => {
    const properties = feature.properties;
    if (properties.world !== world) return false;
    if (properties.example && !showExamples) return false;
    if (!categories.has(properties.category)) return false;
    return matchesQuery(feature, query);
  });

  if (map) drawMarkers(visible, northDerived);
  drawTable(visible, world, query, northDerived);
  const plotted = visible.filter((feature) => positions.get(feature.id)).length;
  const exampleNote = showExamples ? "Examples are shown." : "Examples are hidden.";
  const unconfirmed = visible.filter((feature) => feature.properties.world_unconfirmed).length;
  const planetNote =
    unconfirmed > 0
      ? ` Planet not confirmed for ${unconfirmed} location${unconfirmed === 1 ? "" : "s"}.`
      : "";
  summary.textContent = `Showing ${visible.length} location${visible.length === 1 ? "" : "s"} on ${world}. ${plotted} plotted. ${exampleNote}${planetNote}`;
  mapEmpty.hidden = plotted > 0;
  mapEmpty.textContent = plotted > 0 ? "" : `No plotted locations on ${world}.`;
  if (map) requestAnimationFrame(() => map.invalidateSize());
}

function matchesQuery(feature, query) {
  if (!query) return true;
  return haystack(feature).includes(query);
}

function haystack(feature) {
  const properties = feature.properties;
  const category = categoriesById.get(properties.category);
  const parts = [
    properties.id,
    properties.world,
    properties.region,
    properties.subtype,
    properties.quantity_notes,
    properties.coordinates_raw,
    properties.planet_sightings,
    properties.source,
    properties.category,
    category?.label,
    properties.anchor_id,
    properties.bearing_deg,
    properties.distance_m,
  ];
  if (properties.approximate) parts.push("approximate");
  if (properties.origin) parts.push("origin anchor");
  if (properties.world_unconfirmed) parts.push("planet not confirmed");
  if (Array.isArray(properties.nav_markers)) {
    for (const marker of properties.nav_markers) {
      parts.push(marker?.name, marker?.distance_raw, marker?.distance_m, marker?.bearing_deg);
    }
  }
  return parts
    .filter((part) => part !== null && part !== undefined)
    .join(" ")
    .toLowerCase();
}

function drawMarkers(visible, northDerived) {
  map.closePopup();
  markerLayer.clearLayers();
  markers.clear();
  const plotted = [];
  for (const feature of visible) {
    const position = positions.get(feature.id);
    if (!position) continue;
    const properties = feature.properties;
    const category = categoriesById.get(properties.category);
    const marker = L.marker(L.latLng(position.y, position.x), {
      icon: L.divIcon({
        className: "map-pin",
        html: iconSvg(category.shape, category.color, {
          example: properties.example,
          approximate: properties.approximate,
        }),
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -16],
      }),
      title: markerTitle(feature, category),
      alt: markerTitle(feature, category),
      keyboard: true,
    });
    marker.bindPopup(popupElement(feature, position, northDerived), {
      maxWidth: 340,
      minWidth: 240,
      maxHeight: 280,
    });
    marker.addTo(markerLayer);
    markers.set(feature.id, marker);
    plotted.push(position);
  }
  fitMap(plotted);
}

function fitMap(plotted) {
  if (plotted.length === 0) {
    map.setView(L.latLng(0, 0), 0, { animate: false });
    return;
  }
  if (plotted.length === 1) {
    map.setView(L.latLng(plotted[0].y, plotted[0].x), 0, { animate: false });
    return;
  }
  const bounds = L.latLngBounds(plotted.map((position) => L.latLng(position.y, position.x)));
  map.fitBounds(bounds.pad(0.45), { animate: false, maxZoom: 2 });
}

function focusMarker(id) {
  const marker = markers.get(id);
  if (!marker) return;
  const zoom = Math.max(map.getZoom(), 1);
  map.setView(marker.getLatLng(), zoom, { animate: false });
  marker.openPopup();
  marker.getPopup()?.getElement()?.querySelector(".survey-card")?.focus();
}

function drawTable(visible, world, query, northDerived) {
  const searchNote = query ? ` matching “${searchInput.value.trim()}”` : "";
  caption.textContent = `Locations on ${world}${searchNote}`;
  tbody.replaceChildren();
  if (visible.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 12;
    cell.textContent = "No locations match these filters.";
    row.append(cell);
    tbody.append(row);
    return;
  }
  for (const feature of visible) {
    const properties = feature.properties;
    const category = categoriesById.get(properties.category);
    const position = positions.get(feature.id);
    const row = document.createElement("tr");
    appendCell(row, properties.region ?? "—");
    appendCell(row, category?.label ?? properties.category);
    appendCell(row, textOrDash(properties.subtype));
    appendCell(row, placementText(feature, position, northDerived));
    appendCell(row, navText(properties.nav_markers));
    const notes = appendCell(row, textOrDash(properties.quantity_notes));
    notes.classList.add("notes");
    appendCell(row, textOrDash(properties.planet_sightings));
    appendCell(row, textOrDash(properties.date_discovered));
    appendCell(row, worldLabel(properties));
    const sourceCell = document.createElement("td");
    sourceCell.append(sourceNode(properties.source));
    row.append(sourceCell);
    const idCell = document.createElement("td");
    const code = document.createElement("code");
    code.textContent = properties.id;
    idCell.append(code);
    row.append(idCell);
    const action = document.createElement("td");
    if (position) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Show";
      button.setAttribute("aria-label", `Show ${properties.region ?? properties.id} on the map`);
      button.addEventListener("click", () => focusMarker(feature.id));
      action.append(button);
    } else {
      action.textContent = "Not plotted";
    }
    row.append(action);
    tbody.append(row);
  }
}

function popupElement(feature, position, northDerived) {
  const properties = feature.properties;
  const category = categoriesById.get(properties.category);
  const root = document.createElement("article");
  root.className = "survey-card";
  root.tabIndex = -1;
  if (properties.example) root.append(banner("banner-example", "Example. Not a survey record."));
  if (properties.approximate) root.append(banner("banner-approx", "Approximate."));
  if (properties.origin) root.append(banner("banner-origin", "Origin anchor for this world."));
  if (properties.world_unconfirmed) {
    root.append(banner("banner-world", `Planet not confirmed. Filed under ${properties.world}.`));
  }
  const title = document.createElement("h3");
  title.textContent = properties.region ?? "Unnamed place";
  root.append(title);
  const list = document.createElement("dl");
  addRow(list, "Category", category?.label ?? properties.category);
  addRow(list, "Subtype", textOrDash(properties.subtype));
  addRow(list, "World", worldLabel(properties));
  addRow(list, "Discovered", textOrDash(properties.date_discovered));
  addRow(list, "Placement", placementText(feature, position, northDerived));
  addRow(list, "Bearing", isFiniteNumber(properties.bearing_deg) ? `${properties.bearing_deg}°` : "—");
  addRow(list, "Distance", isFiniteNumber(properties.distance_m) ? formatMeters(properties.distance_m) : "—");
  addRow(list, "Anchor", anchorLabel(properties.anchor_id));
  addRow(list, "Stored x", numberOrDash(properties.x));
  addRow(list, "Stored y", numberOrDash(properties.y));
  addRow(list, "Stored z", numberOrDash(properties.z));
  addRow(list, "Raw text", textOrDash(properties.coordinates_raw));
  addRow(list, "Nav markers", navText(properties.nav_markers));
  addRow(list, "Planets", textOrDash(properties.planet_sightings));
  addRow(list, "Notes", textOrDash(properties.quantity_notes));
  const sourceRow = document.createElement("div");
  sourceRow.append(sourceNode(properties.source));
  addRow(list, "Source", sourceRow);
  const idCode = document.createElement("code");
  idCode.textContent = properties.id;
  addRow(list, "Id", idCode);
  root.append(list);
  return root;
}

function placementText(feature, position, northDerived) {
  const properties = feature.properties;
  if (position?.method === "origin") return "Origin. 0 m east, 0 m north.";
  if (position?.method === "bearing") {
    const where = formatEastNorth(position.x, position.y);
    const approx = properties.approximate ? "Approximate. " : "";
    const north = northDerived ? "" : " Plotted on display north, which is not derived yet.";
    return `${approx}${formatMeters(properties.distance_m)} at ${properties.bearing_deg}° from ${anchorLabel(properties.anchor_id)}. Display position computed: ${where}.${north}`;
  }
  if (position?.method === "stored") {
    const approx = properties.approximate ? "Approximate. " : "";
    return `${approx}Stored display position: ${formatEastNorth(position.x, position.y)}.`;
  }
  return "Not plotted. No display position yet.";
}

function anchorLabel(anchorId) {
  if (typeof anchorId !== "string") return "—";
  const anchor = byId.get(anchorId);
  return anchor?.properties?.region ?? anchorId;
}

function worldLabel(properties) {
  return properties.world_unconfirmed ? `${properties.world} (planet not confirmed)` : properties.world;
}

function navText(markersValue) {
  if (!Array.isArray(markersValue) || markersValue.length === 0) return "—";
  return markersValue
    .map((marker) => {
      const distance =
        marker.distance_raw ??
        (isFiniteNumber(marker.distance_m) ? formatMeters(marker.distance_m) : "distance unknown");
      const bearing = isFiniteNumber(marker.bearing_deg) ? `${marker.bearing_deg}°` : "bearing unknown, not plotted";
      return `${marker.name} — ${distance} — ${bearing}`;
    })
    .join("; ");
}

function northCopy(world) {
  const compass = schema.world_compass?.[world];
  if (compass?.north_derived === true) {
    return compass.north_note || `North on ${world} has been derived. Bearings are degrees clockwise from that north. Distances are meters.`;
  }
  return `North on ${world} is not derived yet. The arrow is display north. Bearings will be degrees clockwise from the sun or the star on this world. Distances are meters.`;
}

function markerTitle(feature, category) {
  const properties = feature.properties;
  const bits = [properties.region ?? properties.id, category?.label ?? properties.category];
  if (properties.origin) bits.push("origin");
  if (properties.approximate) bits.push("approximate");
  if (properties.example) bits.push("example");
  return bits.join(", ");
}

function banner(className, text) {
  const node = document.createElement("p");
  node.className = `banner ${className}`;
  node.textContent = text;
  return node;
}

function addRow(list, term, value) {
  const label = document.createElement("dt");
  label.textContent = term;
  const detail = document.createElement("dd");
  if (value instanceof Node) detail.append(value);
  else detail.textContent = value;
  list.append(label, detail);
}

function appendCell(row, text) {
  const cell = document.createElement("td");
  cell.textContent = text;
  row.append(cell);
  return cell;
}

function sourceNode(source) {
  const href = sourceHref(source);
  if (!href) {
    const text = document.createElement("span");
    text.textContent = textOrDash(source);
    return text;
  }
  const link = document.createElement("a");
  link.href = href;
  link.textContent = source;
  return link;
}

function sourceHref(source) {
  if (typeof source !== "string") return null;
  if (!/^[a-zA-Z0-9._/-]+$/.test(source)) return null;
  if (source.startsWith("/") || source.includes("..")) return null;
  return source;
}

function textOrDash(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function numberOrDash(value) {
  return isFiniteNumber(value) ? String(value) : "—";
}

function showError(message) {
  loadError.hidden = false;
  loadError.textContent = message;
}

function iconSvg(shape, color, flags) {
  const fill = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#d9d3c5";
  const body = SHAPES[shape]?.(fill) ?? SHAPES.ring(fill);
  const rings = [];
  if (flags.approximate) {
    rings.push(
      '<circle cx="16" cy="16" r="14.2" fill="none" stroke="#f4f1e8" stroke-width="1.3" stroke-dasharray="1.4 2.1"/>',
    );
  }
  if (flags.example) {
    rings.push(
      '<circle cx="16" cy="16" r="15" fill="none" stroke="#ffd56a" stroke-width="1.2" stroke-dasharray="3 2"/>',
    );
  }
  return `<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">${body}${rings.join("")}</svg>`;
}

const STAR_POINTS = Array.from({ length: 10 }, (_, index) => {
  const radius = index % 2 === 0 ? 13 : 5.5;
  const angle = -Math.PI / 2 + index * (Math.PI / 5);
  return `${(16 + radius * Math.cos(angle)).toFixed(2)},${(16 + radius * Math.sin(angle)).toFixed(2)}`;
}).join(" ");

const SHAPES = {
  diamond: (color) =>
    `<polygon points="16,2 30,16 16,30 2,16" fill="${color}" stroke="#10201c" stroke-width="1.5"/>`,
  triangle: (color) =>
    `<polygon points="16,3 30,28 2,28" fill="${color}" stroke="#10201c" stroke-width="1.5"/>`,
  circle: (color) => `<circle cx="16" cy="16" r="12" fill="${color}" stroke="#10201c" stroke-width="1.5"/>`,
  hex: (color) =>
    `<polygon points="16,3 28,10 28,22 16,29 4,22 4,10" fill="${color}" stroke="#10201c" stroke-width="1.5"/>`,
  square: (color) =>
    `<rect x="5" y="5" width="22" height="22" rx="2" fill="${color}" stroke="#10201c" stroke-width="1.5"/>`,
  star: (color) => `<polygon points="${STAR_POINTS}" fill="${color}" stroke="#10201c" stroke-width="1.2"/>`,
  crosshair: (color) =>
    `<circle cx="16" cy="16" r="7.5" fill="none" stroke="#10201c" stroke-width="5"/><circle cx="16" cy="16" r="7.5" fill="none" stroke="${color}" stroke-width="2.5"/><circle cx="16" cy="16" r="2.2" fill="${color}"/><path d="M16 1.5 V7 M16 25 V30.5 M1.5 16 H7 M25 16 H30.5" stroke="${color}" stroke-width="2" fill="none"/>`,
  ring: (color) =>
    `<circle cx="16" cy="16" r="9" fill="none" stroke="#10201c" stroke-width="6"/><circle cx="16" cy="16" r="9" fill="none" stroke="${color}" stroke-width="3.5"/>`,
};

function meterGrid() {
  const Grid = L.Layer.extend({
    onAdd(layerMap) {
      this._map = layerMap;
      this._canvas = L.DomUtil.create("canvas", "meter-grid");
      this._canvas.setAttribute("aria-hidden", "true");
      layerMap.getPane("overlayPane").appendChild(this._canvas);
      this._draw = () => drawMeterGrid(layerMap, this._canvas);
      layerMap.on("move zoom viewreset resize", this._draw);
      this._draw();
    },
    onRemove(layerMap) {
      layerMap.off("move zoom viewreset resize", this._draw);
      this._canvas.remove();
    },
  });
  return new Grid();
}

function drawMeterGrid(layerMap, canvas) {
  const size = layerMap.getSize();
  if (size.x < 2 || size.y < 2) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const topLeft = layerMap.containerPointToLayerPoint([0, 0]);
  L.DomUtil.setPosition(canvas, topLeft);
  canvas.width = Math.floor(size.x * ratio);
  canvas.height = Math.floor(size.y * ratio);
  canvas.style.width = `${size.x}px`;
  canvas.style.height = `${size.y}px`;
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, size.x, size.y);

  const northWest = layerMap.containerPointToLatLng([0, 0]);
  const southEast = layerMap.containerPointToLatLng([size.x, size.y]);
  const xMin = Math.min(northWest.lng, southEast.lng);
  const xMax = Math.max(northWest.lng, southEast.lng);
  const yMin = Math.min(northWest.lat, southEast.lat);
  const yMax = Math.max(northWest.lat, southEast.lat);
  const step = niceStep(Math.max(xMax - xMin, yMax - yMin));
  if (!isFiniteNumber(step) || step <= 0) return;
  const gridReadout = document.querySelector("#grid-step");
  if (gridReadout) gridReadout.textContent = `Grid ${formatMeters(step)}`;

  context.font = "12px Segoe UI, system-ui, sans-serif";
  context.textBaseline = "top";
  drawLines(context, layerMap, xMin, xMax, yMin, yMax, step);
  drawAxis(context, layerMap, xMin, xMax, yMin, yMax);
}

function drawLines(context, layerMap, xMin, xMax, yMin, yMax, step) {
  context.strokeStyle = "rgba(217, 211, 197, 0.28)";
  context.fillStyle = "rgba(244, 241, 232, 0.86)";
  context.lineWidth = 1;
  let guard = 0;
  for (let x = Math.ceil(xMin / step) * step; x <= xMax + step * 0.001; x += step) {
    if (++guard > 80) break;
    if (Math.abs(x) < step * 0.001) continue;
    strokeVertical(context, layerMap, x, yMin, yMax, formatMeters(x));
  }
  guard = 0;
  for (let y = Math.ceil(yMin / step) * step; y <= yMax + step * 0.001; y += step) {
    if (++guard > 80) break;
    if (Math.abs(y) < step * 0.001) continue;
    strokeHorizontal(context, layerMap, y, xMin, xMax, formatMeters(y));
  }
}

function drawAxis(context, layerMap, xMin, xMax, yMin, yMax) {
  context.strokeStyle = "rgba(255, 213, 106, 0.9)";
  context.fillStyle = "#ffd56a";
  context.lineWidth = 1.5;
  if (xMin <= 0 && xMax >= 0) strokeVertical(context, layerMap, 0, yMin, yMax, "0");
  if (yMin <= 0 && yMax >= 0) strokeHorizontal(context, layerMap, 0, xMin, xMax, "0");
}

function strokeVertical(context, layerMap, x, yMin, yMax, label) {
  const start = layerMap.latLngToContainerPoint(L.latLng(yMax, x));
  const end = layerMap.latLngToContainerPoint(L.latLng(yMin, x));
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();
  if (start.x > 4 && start.x < layerMap.getSize().x - 48) context.fillText(label, start.x + 4, 6);
}

function strokeHorizontal(context, layerMap, y, xMin, xMax, label) {
  const start = layerMap.latLngToContainerPoint(L.latLng(y, xMin));
  const end = layerMap.latLngToContainerPoint(L.latLng(y, xMax));
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();
  if (start.y > 16 && start.y < layerMap.getSize().y - 18) context.fillText(label, 6, start.y + 3);
}

function niceStep(span) {
  if (!isFiniteNumber(span) || span <= 0) return 100;
  const rough = span / 6;
  const power = 10 ** Math.floor(Math.log10(rough));
  if (!isFiniteNumber(power) || power === 0) return 100;
  const fraction = rough / power;
  const multiplier = fraction >= 5 ? 5 : fraction >= 2 ? 2 : 1;
  return multiplier * power;
}
