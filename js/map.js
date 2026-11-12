import {
  displayPosition,
  formatEastNorth,
  formatMeters,
  isFiniteNumber,
} from "./place.js";
import {
  EXPLORED_REFRESH_MS,
  exploredFeatures,
  exploredFraction,
  formatExploredReadout,
  parseDemo,
  pointRevealed,
  revealShapes,
} from "./explored.js";
import {
  INFO_STORAGE_KEY,
  LEGEND_STORAGE_KEY,
  VIEW_STORAGE_KEY,
  areaRings,
  contourGeometry,
  elevation,
  fieldForView,
  militarySteps,
  parseInfoOpen,
  parseView,
  scaleSpec,
  terrainPresentation,
  terrainVisible,
} from "./terrain.js";

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
const mapFrame = document.querySelector(".map-frame");
const viewInputs = [...document.querySelectorAll('input[name="map-view"]')];
const sheetCard = document.querySelector("#sheet-card");
const sheetWorld = document.querySelector("#sheet-world");
const sheetGrid = document.querySelector("#sheet-grid");
const sheetNorth = document.querySelector("#sheet-north");
const surfaceLegend = document.querySelector("#surface-legend");
const surfacePanel = document.querySelector("#surface-panel");
const scaleBar = document.querySelector("#scale-bar");
const scaleRule = document.querySelector("#scale-rule");
const scaleLabels = document.querySelector("#scale-labels");
const topoNote = document.querySelector("#topo-note");
const viewStatus = document.querySelector("#view-status");
const compassLabel = document.querySelector("#compass-label");
const sheetExplored = document.querySelector("#sheet-explored");
const sheetDemo = document.querySelector("#sheet-demo");
const infoToggle = document.querySelector("#map-info-toggle");
const infoPanel = document.querySelector("#map-info-panel");
const legendToggle = document.querySelector("#legend-toggle");
const legendPanel = document.querySelector("#legend-panel");
let infoOpen = false;
let legendOpen = false;

const markers = new Map();
let schema = null;
let features = [];
let byId = new Map();
let categoriesById = new Map();
let positions = new Map();
let skipped = 0;
let mapView = "simple";
let palette = null;
let surfacesById = new Map();
let terrainCollection = null;
let terrainLayer = null;
let exploredCollection = null;
let exploredFetchedAt = null;
let revealKey = "";
let revealMeterShapes = [];
let exploredViewFraction = 0;
let exploreToken = 0;
let redrawGrid = () => {};
let redrawContours = () => {};
let redrawFog = () => {};

const showDemo = parseDemo(new URLSearchParams(location.search).get("demo"));
const SVG_NS = "http://www.w3.org/2000/svg";

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
if (map) {
  createTerrainPanes(map);
  terrainLayer = L.featureGroup().addTo(map);
  contourOverlay().addTo(map);
  fogOverlay().addTo(map);
  meterGrid().addTo(map);
  map.on("move zoom viewreset resize", drawScaleBar);
  map.on("zoomend moveend viewreset resize", updateRevealClip);
  map.on("popupopen", () => {
    infoPanel.classList.add("is-covered");
    legendPanel.classList.add("is-covered");
  });
  map.on("popupclose", () => {
    infoPanel.classList.remove("is-covered");
    legendPanel.classList.remove("is-covered");
  });
}

form.addEventListener("submit", (event) => event.preventDefault());
worldSelect.addEventListener("change", render);
searchInput.addEventListener("input", render);
examplesInput.addEventListener("change", render);
document.querySelector("#categories-all").addEventListener("click", () => setCategories(true));
document.querySelector("#categories-none").addEventListener("click", () => setCategories(false));
for (const input of viewInputs) {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    setMapView(input.value, { persist: true, announce: true, restyle: true });
  });
}
applyInitialView();
applyInitialInfo();
infoToggle.addEventListener("click", () => {
  const open = !infoOpen;
  setMapInfoOpen(open, { focus: open ? "panel" : "toggle" });
});
legendToggle.addEventListener("click", () => {
  const open = !legendOpen;
  setLegendOpen(open, { focus: open ? "panel" : "toggle" });
});
document.addEventListener("keydown", onMapPanelKeydown, true);
document.addEventListener("pointerdown", onMapPanelPointerDown);
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
    const exploredPromise = refreshExplored();
    const [loadedSchema, collection, terrainResult, paletteResult, exploredOk] = await Promise.all([
      fetchJson("data/location-schema.json"),
      fetchJson("data/locations.geojson"),
      fetchJson("data/terrain.geojson").then(
        (data) => ({ ok: true, data }),
        () => ({ ok: false, data: null }),
      ),
      fetchJson("data/surface-palette.json").then(
        (data) => ({ ok: true, data }),
        () => ({ ok: false, data: null }),
      ),
      exploredPromise,
    ]);
    schema = loadedSchema;
    categoriesById = new Map((schema.categories ?? []).map((category) => [category.id, category]));
    terrainCollection = terrainResult.ok ? terrainResult.data : null;
    if (paletteResult.ok) applyPalette(paletteResult.data);
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
    const problems = [];
    if (skipped > 0) {
      problems.push(
        `${skipped} location${skipped === 1 ? "" : "s"} could not be read and ${skipped === 1 ? "was" : "were"} left off the map.`,
      );
    }
    if (!paletteResult.ok) {
      problems.push("The surface palette did not load. Topographic fills stay on the paper base.");
    }
    if (!terrainResult.ok) {
      problems.push("Terrain data did not load. Topographic view has no surveyed ground.");
    }
    if (!exploredOk) {
      problems.push("Explored ground did not load. The topographic sheet stays fogged until data/explored.geojson can be read.");
    }
    if (problems.length > 0) showError(problems.join(" "));
    render();
    startExploreWatch();
  } catch (error) {
    showError("The map could not load location data. Check data/locations.geojson and data/location-schema.json.");
    summary.textContent = "Location data did not load.";
    console.error(error);
  }
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
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
  mapFrame.setAttribute("aria-label", `Map of ${world}`);
  northNote.textContent = northCopy(world);
  updateSheetFacts();

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
  syncTerrain();
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

function drawMarkers(visible, northDerived, options = {}) {
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
          plate: mapView === "topo",
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
  if (options.fit !== false) fitMap(plotted);
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
  const fill = isHex(color) ? color : "#d9d3c5";
  const body = SHAPES[shape]?.(fill) ?? SHAPES.ring(fill);
  const plateFill = isHex(palette?.markerPlate) ? palette.markerPlate : "#10201c";
  const plateRing = isHex(palette?.markerRing) ? palette.markerRing : "#f4efe2";
  const plate = flags.plate
    ? `<circle cx="16" cy="16" r="15" fill="${plateFill}" stroke="${plateRing}" stroke-width="1.2"/>`
    : "";
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
  return `<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">${plate}${body}${rings.join("")}</svg>`;
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

function fillGridLabel(context, text, x, y) {
  const ink = context.fillStyle;
  context.strokeStyle = cssHex("--topo-paper", "#b7b18c");
  context.lineWidth = 3.5;
  context.lineJoin = "round";
  context.strokeText(text, x, y);
  context.fillStyle = ink;
  context.fillText(text, x, y);
}

function meterGrid() {
  const Grid = L.Layer.extend({
    onAdd(layerMap) {
      this._map = layerMap;
      this._canvas = L.DomUtil.create("canvas", "meter-grid");
      this._canvas.setAttribute("aria-hidden", "true");
      layerMap.getPane("overlayPane").appendChild(this._canvas);
      this._draw = () => drawMeterGrid(layerMap, this._canvas);
      redrawGrid = () => this._draw();
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
  if (mapView === "topo") {
    drawMilitaryGrid(context, layerMap, size, xMin, xMax, yMin, yMax);
    return;
  }
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
  context.strokeStyle = "rgba(126, 232, 224, 0.24)";
  context.fillStyle = "rgba(214, 244, 240, 0.9)";
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
  context.strokeStyle = "rgba(255, 204, 102, 0.92)";
  context.fillStyle = "#ffcc66";
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

function applyInitialView() {
  const requested = new URLSearchParams(location.search).get("view");
  const urlView = parseView(requested);
  let stored = null;
  try {
    stored = parseView(localStorage.getItem(VIEW_STORAGE_KEY));
  } catch {
    stored = null;
  }
  const initial = urlView ?? stored ?? "simple";
  setMapView(initial, { persist: false, announce: false, restyle: false });
  if (urlView) {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, urlView);
    } catch {
      // Storage can be blocked. The URL still selects the view.
    }
  }
  if (requested !== null && requested !== initial) {
    writeViewUrl(initial);
  }
}

function applyInitialInfo() {
  infoOpen = readPanelOpen(INFO_STORAGE_KEY);
  legendOpen = readPanelOpen(LEGEND_STORAGE_KEY);
  syncInfoPanel({ persist: false });
  syncLegendPanel({ persist: false });
}

function readPanelOpen(key) {
  try {
    return parseInfoOpen(localStorage.getItem(key));
  } catch {
    return false;
  }
}

function writePanelOpen(key, open) {
  try {
    localStorage.setItem(key, open ? "open" : "closed");
  } catch {
    // The button still opens the panel when storage is unavailable.
  }
}

function setMapInfoOpen(open, options = {}) {
  infoOpen = open === true;
  syncInfoPanel(options);
}

function setLegendOpen(open, options = {}) {
  legendOpen = open === true;
  syncLegendPanel(options);
}

function syncInfoPanel(options = {}) {
  infoToggle.setAttribute("aria-expanded", infoOpen ? "true" : "false");
  infoPanel.hidden = !infoOpen;
  if (options.persist !== false) writePanelOpen(INFO_STORAGE_KEY, infoOpen);
  if (options.focus === "panel" && infoOpen) infoPanel.focus();
  if (options.focus === "toggle" && !infoOpen) infoToggle.focus();
}

function syncLegendPanel(options = {}) {
  const topographic = mapView === "topo";
  legendToggle.hidden = !topographic;
  const show = topographic && legendOpen;
  legendToggle.setAttribute("aria-expanded", show ? "true" : "false");
  legendPanel.hidden = !show;
  if (options.persist !== false) writePanelOpen(LEGEND_STORAGE_KEY, legendOpen);
  if (options.focus === "panel" && show) legendPanel.focus();
  if (options.focus === "toggle" && !show && topographic) legendToggle.focus();
}

function onMapPanelKeydown(event) {
  if (event.key !== "Escape") return;
  const active = document.activeElement;
  if (!infoPanel.hidden && infoPanel.contains(active)) {
    event.preventDefault();
    event.stopPropagation();
    setMapInfoOpen(false, { focus: "toggle" });
    return;
  }
  if (!legendPanel.hidden && legendPanel.contains(active)) {
    event.preventDefault();
    event.stopPropagation();
    setLegendOpen(false, { focus: "toggle" });
    return;
  }
  if (infoPanel.hidden && legendPanel.hidden) return;
  event.preventDefault();
  event.stopPropagation();
  if (!legendPanel.hidden) setLegendOpen(false);
  if (!infoPanel.hidden) setMapInfoOpen(false);
  infoToggle.focus();
}

function onMapPanelPointerDown(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (
    infoPanel.contains(target) ||
    infoToggle.contains(target) ||
    legendPanel.contains(target) ||
    legendToggle.contains(target)
  ) {
    return;
  }
  const focusInInfo = infoPanel.contains(document.activeElement);
  const focusInLegend = legendPanel.contains(document.activeElement);
  const infoWasOpen = !infoPanel.hidden;
  const legendWasOpen = !legendPanel.hidden;
  if (!infoWasOpen && !legendWasOpen) return;
  if (infoWasOpen) setMapInfoOpen(false);
  if (legendWasOpen) setLegendOpen(false);
  const willFocus = target.closest("button, a, input, select, textarea, [tabindex]");
  if (willFocus) return;
  if (focusInInfo) infoToggle.focus();
  else if (focusInLegend) legendToggle.focus();
}

function setMapView(next, options = {}) {
  const view = parseView(next) ?? "simple";
  mapView = view;
  for (const input of viewInputs) input.checked = input.value === view;
  mapFrame.classList.toggle("view-topo", view === "topo");
  mapFrame.classList.toggle("view-simple", view === "simple");
  if (view === "topo") document.documentElement.dataset.view = "topo";
  else delete document.documentElement.dataset.view;
  const topographic = view === "topo";
  sheetCard.hidden = !topographic;
  scaleBar.hidden = !topographic;
  topoNote.hidden = !topographic;
  surfacePanel.hidden = !topographic;
  syncLegendPanel({ persist: false });
  updateSheetFacts();
  if (options.announce) {
    viewStatus.textContent = topographic
      ? "Topographic view. Fog covers unexplored ground. Surveyed color shows only where the route has been."
      : "Simple view.";
  }
  if (options.persist) {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      // The control still switches the view when storage is unavailable.
    }
    writeViewUrl(view);
  }
  redrawGrid();
  redrawContours();
  redrawFog();
  updateRevealClip();
  drawScaleBar();
  if (options.restyle) {
    restyleMarkers();
    syncTerrain();
  }
}

function writeViewUrl(view) {
  const url = new URL(location.href);
  url.searchParams.set("view", view === "topo" ? "topo" : "simple");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function northIsDerived(world) {
  return schema?.world_compass?.[world]?.north_derived === true;
}

function updateSheetFacts(gridText) {
  const world = worldSelect.value;
  const northDerived = northIsDerived(world);
  sheetWorld.textContent = world || "—";
  sheetNorth.textContent = northDerived ? "Derived" : "Provisional";
  if (gridText) sheetGrid.textContent = gridText;
  const provisional = mapView === "topo" && !northDerived;
  compassLabel.textContent = provisional ? "N (provisional)" : "N";
  updateExploreChrome();
}

function applyPalette(next) {
  if (!next || !Array.isArray(next.surfaces)) return;
  palette = next;
  surfacesById = new Map(next.surfaces.map((surface) => [surface.id, surface]));
  const pairs = [
    ["--topo-paper", next.paper],
    ["--topo-ink", next.ink],
    ["--topo-contour", next.contour],
    ["--topo-contour-index", next.contourIndex],
    ["--topo-grid", next.grid],
    ["--topo-grid-minor", next.gridMinor],
    ["--topo-marker-plate", next.markerPlate],
    ["--topo-marker-ring", next.markerRing],
  ];
  for (const [key, value] of pairs) {
    if (isHex(value)) mapFrame.style.setProperty(key, value);
  }
  buildSurfaceLegend();
}

function buildSurfaceLegend() {
  surfaceLegend.replaceChildren();
  if (!palette) return;
  surfaceLegend.append(fogLegendItem());
  surfaceLegend.append(legendItem("Paper, explored", palette.paper, palette.ink));
  for (const surface of palette.surfaces) {
    surfaceLegend.append(legendItem(surface.label, surface.fill, surface.stroke));
  }
  if (palette.fallback) {
    surfaceLegend.append(legendItem(palette.fallback.label, palette.fallback.fill, palette.fallback.stroke));
  }
}

function fogLegendItem() {
  const item = document.createElement("li");
  const swatch = document.createElement("span");
  swatch.className = "surface-swatch is-fog";
  const name = document.createElement("span");
  name.textContent = "Fog, unexplored";
  item.append(swatch, name);
  return item;
}

function legendItem(label, fill, stroke) {
  const item = document.createElement("li");
  const swatch = document.createElement("span");
  swatch.className = "surface-swatch";
  swatch.style.background = isHex(fill) ? fill : "transparent";
  swatch.style.borderColor = isHex(stroke) ? stroke : "currentColor";
  const name = document.createElement("span");
  name.textContent = label;
  item.append(swatch, name);
  return item;
}

function restyleMarkers() {
  if (!schema || !map) return;
  const world = worldSelect.value;
  const query = searchInput.value.trim().toLowerCase();
  const showExamples = examplesInput.checked;
  const categories = selectedCategories();
  const northDerived = northIsDerived(world);
  const visible = features.filter((feature) => {
    const properties = feature.properties;
    if (properties.world !== world) return false;
    if (properties.example && !showExamples) return false;
    if (!categories.has(properties.category)) return false;
    return matchesQuery(feature, query);
  });
  drawMarkers(visible, northDerived, { fit: false });
}

function syncTerrain() {
  if (!terrainLayer) return;
  terrainLayer.clearLayers();
  if (mapView !== "topo" || !terrainCollection) return;
  const world = worldSelect.value;
  const showExamples = examplesInput.checked;
  for (const feature of terrainCollection.features ?? []) {
    if (!terrainVisible(feature, world, showExamples)) continue;
    addTerrainFeature(feature);
  }
  updateRevealClip();
  redrawContours();
  redrawFog();
}

function addTerrainFeature(feature) {
  const presentation = terrainPresentation(feature, palette);
  const popup = () => terrainPopup(feature);
  if (presentation.layer === "point") {
    const layer = L.geoJSON(feature, {
      pane: "terrainLine",
      pointToLayer: (_feature, latlng) =>
        L.circleMarker(latlng, {
          pane: "terrainLine",
          radius: presentation.radius,
          color: presentation.color,
          weight: 2,
          fillColor: presentation.fill,
          fillOpacity: presentation.fillOpacity,
        }),
    });
    layer.bindPopup(popup, { maxWidth: 280, minWidth: 180 });
    layer.addTo(terrainLayer);
    return;
  }
  if (presentation.layer === "line") {
    const layer = L.geoJSON(feature, {
      pane: "terrainLine",
      style: {
        color: presentation.color,
        weight: presentation.weight,
        opacity: 1,
        dashArray: presentation.dashArray,
        lineCap: "round",
        lineJoin: "round",
      },
    });
    layer.bindPopup(popup, { maxWidth: 280, minWidth: 180 });
    layer.addTo(terrainLayer);
    return;
  }
  const layer = L.geoJSON(feature, {
    pane: "terrainFill",
    style: {
      color: presentation.color,
      weight: presentation.weight,
      opacity: 1,
      fillColor: presentation.fill,
      fillOpacity: presentation.fillOpacity,
      dashArray: presentation.dashArray,
    },
  });
  layer.bindPopup(popup, { maxWidth: 280, minWidth: 180 });
  if (feature.properties?.example) {
    const center = ringCenter(areaRings(feature)[0]?.[0]);
    if (!center || pointRevealed(center[0], center[1], currentRevealShapes())) {
      layer.eachLayer((path) => {
        path.bindTooltip("EXAMPLE", {
          permanent: true,
          direction: "center",
          className: "terrain-example-tag",
          opacity: 1,
        });
      });
    }
  }
  layer.addTo(terrainLayer);
}

function terrainPopup(feature) {
  const properties = feature.properties ?? {};
  const swatch = typeof properties.surface === "string" ? surfacesById.get(properties.surface) : null;
  const root = document.createElement("article");
  root.className = "terrain-card";
  if (properties.example) root.append(banner("banner-example", "Example. Not a survey."));
  const title = document.createElement("h3");
  title.textContent = properties.name ?? "Surveyed ground";
  root.append(title);
  const list = document.createElement("dl");
  addRow(list, "Kind", kindLabel(properties.kind));
  if (properties.surface) addRow(list, "Surface", swatch?.label ?? properties.surface);
  addRow(list, "World", properties.world ?? "—");
  addRow(list, "Notes", textOrDash(properties.notes));
  root.append(list);
  return root;
}

function kindLabel(kind) {
  const labels = {
    surface: "Surface",
    lake: "Lake",
    river: "River",
    ridge: "Ridge",
    outcrop: "Outcrop",
  };
  return labels[kind] ?? textOrDash(kind);
}

function createTerrainPanes(layerMap) {
  layerMap.createPane("terrainFill");
  layerMap.createPane("contour");
  layerMap.createPane("terrainLine");
  layerMap.createPane("fog");
  const fill = layerMap.getPane("terrainFill");
  const contour = layerMap.getPane("contour");
  const line = layerMap.getPane("terrainLine");
  const fog = layerMap.getPane("fog");
  fill.style.zIndex = "340";
  contour.style.zIndex = "360";
  contour.style.pointerEvents = "none";
  line.style.zIndex = "380";
  fog.style.zIndex = "390";
  fog.style.pointerEvents = "none";
}

function contourOverlay() {
  const Layer = L.Layer.extend({
    onAdd(layerMap) {
      this._map = layerMap;
      this._canvas = L.DomUtil.create("canvas", "contour-layer");
      this._canvas.setAttribute("aria-hidden", "true");
      layerMap.getPane("contour").appendChild(this._canvas);
      this._draw = () => drawContours(layerMap, this._canvas);
      redrawContours = () => this._draw();
      layerMap.on("move zoom viewreset resize", this._draw);
      this._draw();
    },
    onRemove(layerMap) {
      layerMap.off("move zoom viewreset resize", this._draw);
      this._canvas.remove();
    },
  });
  return new Layer();
}

function drawContours(layerMap, canvas) {
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
  if (mapView !== "topo") return;
  const surveyed = surveyedPolygons(layerMap);
  const reveal = projectShapes(layerMap, currentRevealShapes(), "container");
  if (surveyed.length === 0 || reveal.length === 0) return;
  const northWest = layerMap.containerPointToLatLng([0, 0]);
  const southEast = layerMap.containerPointToLatLng([size.x, size.y]);
  const bounds = {
    xMin: Math.min(northWest.lng, southEast.lng),
    xMax: Math.max(northWest.lng, southEast.lng),
    yMin: Math.min(northWest.lat, southEast.lat),
    yMax: Math.max(northWest.lat, southEast.lat),
  };
  const field = fieldForView(bounds, (x, y) => elevation(x, y));
  const lines = contourGeometry(field);
  const ring = cssHex("--topo-marker-ring", "#f4efe2");
  const contour = cssHex("--topo-contour", "#4a2c16");
  const index = cssHex("--topo-contour-index", "#2c1a0e");
  context.save();
  context.beginPath();
  for (const rings of surveyed) traceRings(context, rings);
  context.clip("evenodd");
  context.beginPath();
  traceReveal(context, reveal);
  context.clip();
  context.lineJoin = "round";
  context.lineCap = "round";
  strokeContours(context, layerMap, lines.normal, ring, 1.7);
  strokeContours(context, layerMap, lines.index, ring, 3.5);
  strokeContours(context, layerMap, lines.normal, contour, 1.15);
  strokeContours(context, layerMap, lines.index, index, 2.55);
  context.restore();
}

function strokeContours(context, layerMap, segments, color, width) {
  context.strokeStyle = color;
  context.lineWidth = width;
  context.beginPath();
  for (const [x1, y1, x2, y2] of segments) {
    const start = layerMap.latLngToContainerPoint(L.latLng(y1, x1));
    const end = layerMap.latLngToContainerPoint(L.latLng(y2, x2));
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
  }
  context.stroke();
}

function currentRevealShapes() {
  const world = worldSelect.value;
  const key = `${world}|${showDemo ? 1 : 0}|${exploredFetchedAt ?? ""}|${exploredCollection?.features?.length ?? 0}`;
  if (key !== revealKey) {
    revealKey = key;
    revealMeterShapes = revealShapes(exploredFeatures(exploredCollection, world, showDemo));
  }
  return revealMeterShapes;
}

function projectShapes(layerMap, shapes, space) {
  const toPoint = (x, y) => {
    const latlng = L.latLng(y, x);
    return space === "layer" ? layerMap.latLngToLayerPoint(latlng) : layerMap.latLngToContainerPoint(latlng);
  };
  const radiusAt = (x, y, radius) => {
    const start = toPoint(x, y);
    const end = toPoint(x + radius, y);
    return Math.max(0, Math.hypot(end.x - start.x, end.y - start.y));
  };
  const projected = [];
  for (const shape of shapes) {
    if (shape.type === "circle") {
      const point = toPoint(shape.x, shape.y);
      projected.push({ type: "circle", x: point.x, y: point.y, r: radiusAt(shape.x, shape.y, shape.r) });
    } else if (shape.type === "line" && shape.points.length > 0) {
      const [x, y] = shape.points[0];
      projected.push({
        type: "line",
        r: radiusAt(x, y, shape.r),
        points: shape.points.map(([east, north]) => {
          const point = toPoint(east, north);
          return [point.x, point.y];
        }),
      });
    } else if (shape.type === "polygon" && shape.rings[0]?.length) {
      const [x, y] = shape.rings[0][0];
      projected.push({
        type: "polygon",
        r: radiusAt(x, y, shape.r),
        rings: shape.rings.map((ring) =>
          ring.map(([east, north]) => {
            const point = toPoint(east, north);
            return [point.x, point.y];
          }),
        ),
      });
    }
  }
  return projected;
}

function surveyedPolygons(layerMap) {
  if (!terrainCollection) return [];
  const world = worldSelect.value;
  const showExamples = examplesInput.checked;
  const polygons = [];
  for (const feature of terrainCollection.features ?? []) {
    if (!terrainVisible(feature, world, showExamples)) continue;
    for (const rings of areaRings(feature)) {
      polygons.push(
        rings.map((ring) =>
          ring.map(([east, north]) => {
            const point = layerMap.latLngToContainerPoint(L.latLng(north, east));
            return [point.x, point.y];
          }),
        ),
      );
    }
  }
  return polygons;
}

function traceRings(context, rings) {
  for (const ring of rings) {
    if (!ring?.length) continue;
    context.moveTo(ring[0][0], ring[0][1]);
    for (let index = 1; index < ring.length; index += 1) context.lineTo(ring[index][0], ring[index][1]);
    context.closePath();
  }
}

function traceQuad(context, x1, y1, x2, y2, radius) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return;
  const px = (-dy / length) * radius;
  const py = (dx / length) * radius;
  context.moveTo(x1 + px, y1 + py);
  context.lineTo(x2 + px, y2 + py);
  context.lineTo(x2 - px, y2 - py);
  context.lineTo(x1 - px, y1 - py);
  context.closePath();
}

function traceReveal(context, shapes) {
  for (const shape of shapes) {
    if (shape.type === "circle") {
      context.moveTo(shape.x + shape.r, shape.y);
      context.arc(shape.x, shape.y, Math.max(shape.r, 0), 0, Math.PI * 2);
    } else if (shape.type === "line") {
      for (const [x, y] of shape.points) {
        context.moveTo(x + shape.r, y);
        context.arc(x, y, Math.max(shape.r, 0), 0, Math.PI * 2);
      }
      for (let index = 1; index < shape.points.length; index += 1) {
        const [x1, y1] = shape.points[index - 1];
        const [x2, y2] = shape.points[index];
        traceQuad(context, x1, y1, x2, y2, shape.r);
      }
    } else if (shape.type === "polygon") {
      traceRings(context, shape.rings);
      const outer = shape.rings[0] ?? [];
      for (const [x, y] of outer) {
        context.moveTo(x + shape.r, y);
        context.arc(x, y, Math.max(shape.r, 0), 0, Math.PI * 2);
      }
      for (let index = 1; index < outer.length; index += 1) {
        const [x1, y1] = outer[index - 1];
        const [x2, y2] = outer[index];
        traceQuad(context, x1, y1, x2, y2, shape.r);
      }
    }
  }
}

function fillReveal(context, shapes, expand) {
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const shape of shapes) {
    const radius = Math.max(0, shape.r + expand);
    if (shape.type === "circle") {
      context.beginPath();
      context.arc(shape.x, shape.y, radius, 0, Math.PI * 2);
      context.fill();
    } else if (shape.type === "line" && shape.points.length > 1) {
      context.beginPath();
      context.moveTo(shape.points[0][0], shape.points[0][1]);
      for (let index = 1; index < shape.points.length; index += 1) {
        context.lineTo(shape.points[index][0], shape.points[index][1]);
      }
      context.lineWidth = radius * 2;
      context.stroke();
    } else if (shape.type === "polygon") {
      context.beginPath();
      traceRings(context, shape.rings);
      context.fill("evenodd");
      const outer = shape.rings[0];
      if (outer?.length && radius > 0) {
        context.beginPath();
        context.moveTo(outer[0][0], outer[0][1]);
        for (let index = 1; index < outer.length; index += 1) context.lineTo(outer[index][0], outer[index][1]);
        context.closePath();
        context.lineWidth = radius * 2;
        context.stroke();
      }
    }
  }
}

function fogOverlay() {
  const Layer = L.Layer.extend({
    onAdd(layerMap) {
      this._map = layerMap;
      this._canvas = L.DomUtil.create("canvas", "fog-layer");
      this._canvas.setAttribute("aria-hidden", "true");
      layerMap.getPane("fog").appendChild(this._canvas);
      this._draw = () => drawFog(layerMap, this._canvas);
      redrawFog = () => this._draw();
      layerMap.on("move zoom viewreset resize", this._draw);
      this._draw();
    },
    onRemove(layerMap) {
      layerMap.off("move zoom viewreset resize", this._draw);
      this._canvas.remove();
    },
  });
  return new Layer();
}

function drawFog(layerMap, canvas) {
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
  if (mapView !== "topo") {
    updateExploreChrome(0);
    return;
  }
  const northWest = layerMap.containerPointToLatLng([0, 0]);
  const southEast = layerMap.containerPointToLatLng([size.x, size.y]);
  const bounds = {
    xMin: Math.min(northWest.lng, southEast.lng),
    xMax: Math.max(northWest.lng, southEast.lng),
    yMin: Math.min(northWest.lat, southEast.lat),
    yMax: Math.max(northWest.lat, southEast.lat),
  };
  const reveal = projectShapes(layerMap, currentRevealShapes(), "container");
  updateExploreChrome(exploredFraction(bounds, currentRevealShapes()));
  context.fillStyle = fogVeil();
  context.fillRect(0, 0, size.x, size.y);
  drawFogHatch(context, size);
  if (reveal.length === 0) return;
  eraseReveal(context, reveal, 12, 0.35);
  eraseReveal(context, reveal, 5, 0.7);
  eraseReveal(context, reveal, 0, 1);
  paintRevealRim(context, ratio, size, reveal);
}

function fogVeil() {
  const value = getComputedStyle(mapFrame).getPropertyValue("--topo-fog-veil").trim();
  return value || "rgba(18, 28, 22, 0.42)";
}

function drawFogHatch(context, size) {
  context.save();
  context.strokeStyle = "rgba(26, 23, 18, 0.22)";
  context.lineWidth = 1;
  context.beginPath();
  const step = 14;
  for (let offset = -size.y; offset < size.x; offset += step) {
    context.moveTo(offset, 0);
    context.lineTo(offset + size.y, size.y);
  }
  context.stroke();
  context.restore();
}

function eraseReveal(context, shapes, expand, alpha) {
  context.save();
  context.globalCompositeOperation = "destination-out";
  context.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  context.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
  fillReveal(context, shapes, expand);
  context.restore();
}

function paintRevealRim(context, ratio, size, shapes) {
  const rim = document.createElement("canvas");
  rim.width = Math.floor(size.x * ratio);
  rim.height = Math.floor(size.y * ratio);
  const scratch = rim.getContext("2d");
  scratch.setTransform(ratio, 0, 0, ratio, 0, 0);
  scratch.fillStyle = "#f6f1e4";
  scratch.strokeStyle = "#f6f1e4";
  fillReveal(scratch, shapes, 1.4);
  scratch.globalCompositeOperation = "destination-out";
  scratch.fillStyle = "#000";
  scratch.strokeStyle = "#000";
  fillReveal(scratch, shapes, -1.6);
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.drawImage(rim, 0, 0);
  context.restore();
}

function updateExploreChrome(fraction) {
  if (typeof fraction === "number" && Number.isFinite(fraction)) exploredViewFraction = fraction;
  const world = worldSelect.value;
  const demoHere =
    showDemo &&
    exploredFeatures(exploredCollection, world, true).some((entry) => entry.feature.properties?.example === true);
  if (sheetDemo) sheetDemo.hidden = !(mapView === "topo" && demoHere);
  if (topoNote && mapView === "topo") {
    topoNote.textContent = demoHere
      ? "DEMO reveal is on. That track was not walked. Fog = unexplored."
      : "Fog = unexplored. Surveyed color and contours show only on ground that has been traveled.";
  }
  if (!sheetExplored) return;
  const text = formatExploredReadout(
    exploredViewFraction,
    exploredCollection?.updated,
    exploredFetchedAt,
  );
  if (sheetExplored.textContent !== text) sheetExplored.textContent = text;
}

function ringCenter(ring) {
  if (!Array.isArray(ring) || ring.length === 0) return null;
  let east = 0;
  let north = 0;
  let count = 0;
  for (const point of ring) {
    if (!Array.isArray(point) || point.length < 2) continue;
    east += point[0];
    north += point[1];
    count += 1;
  }
  if (count === 0) return null;
  return [east / count, north / count];
}

async function refreshExplored() {
  const token = ++exploreToken;
  try {
    const data = await fetchJson(`data/explored.geojson?t=${Date.now()}`, { cache: "no-store" });
    if (token !== exploreToken) return false;
    exploredCollection = data;
    exploredFetchedAt = new Date().toISOString();
    revealKey = "";
    redrawFog();
    redrawContours();
    updateRevealClip();
    return true;
  } catch (error) {
    if (token !== exploreToken) return false;
    console.error(error);
    return false;
  }
}

function startExploreWatch() {
  document.addEventListener("visibilitychange", onExploreAttention);
  window.addEventListener("focus", onExploreAttention);
  window.setInterval(() => {
    if (document.visibilityState === "hidden") return;
    refreshExplored();
  }, EXPLORED_REFRESH_MS);
}

let exploreAttentionTimer = 0;
function onExploreAttention() {
  if (document.visibilityState === "hidden") return;
  window.clearTimeout(exploreAttentionTimer);
  exploreAttentionTimer = window.setTimeout(() => refreshExplored(), 300);
}

function updateRevealClip() {
  if (!map) return;
  const shapes = mapView === "topo" ? projectShapes(map, currentRevealShapes(), "layer") : [];
  clipPane("terrainFill", shapes);
  clipPane("terrainLine", shapes);
}

function clipPane(paneName, shapes) {
  const pane = map.getPane(paneName);
  const svg = pane?.querySelector("svg");
  if (!svg) return;
  const clipId = `reveal-clip-${paneName}`;
  let clip = svg.querySelector(`#${clipId}`);
  if (!clip) {
    clip = document.createElementNS(SVG_NS, "clipPath");
    clip.id = clipId;
    clip.setAttribute("clipPathUnits", "userSpaceOnUse");
    let defs = svg.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS(SVG_NS, "defs");
      svg.insertBefore(defs, svg.firstChild);
    }
    defs.append(clip);
  }
  clip.replaceChildren();
  for (const shape of shapes) appendClipShape(clip, shape);
  const group = svg.querySelector("g");
  if (group) group.setAttribute("clip-path", `url(#${clipId})`);
}

function appendClipShape(clip, shape) {
  if (shape.type === "circle") {
    clip.append(svgCircle(shape.x, shape.y, shape.r));
    return;
  }
  if (shape.type === "line") {
    for (const [x, y] of shape.points) clip.append(svgCircle(x, y, shape.r));
    for (let index = 1; index < shape.points.length; index += 1) {
      const quad = quadPoints(shape.points[index - 1], shape.points[index], shape.r);
      if (quad) clip.append(svgPolygon(quad));
    }
    return;
  }
  if (shape.type === "polygon") {
    clip.append(svgRings(shape.rings));
    const outer = shape.rings[0] ?? [];
    for (const [x, y] of outer) clip.append(svgCircle(x, y, shape.r));
    for (let index = 1; index < outer.length; index += 1) {
      const quad = quadPoints(outer[index - 1], outer[index], shape.r);
      if (quad) clip.append(svgPolygon(quad));
    }
  }
}

function quadPoints(start, end, radius) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return null;
  const px = (-dy / length) * radius;
  const py = (dx / length) * radius;
  return [
    [start[0] + px, start[1] + py],
    [end[0] + px, end[1] + py],
    [end[0] - px, end[1] - py],
    [start[0] - px, start[1] - py],
  ];
}

function svgCircle(x, y, radius) {
  const node = document.createElementNS(SVG_NS, "circle");
  node.setAttribute("cx", String(x));
  node.setAttribute("cy", String(y));
  node.setAttribute("r", String(Math.max(radius, 0)));
  return node;
}

function svgPolygon(points) {
  const node = document.createElementNS(SVG_NS, "polygon");
  node.setAttribute("points", points.map(([x, y]) => `${x},${y}`).join(" "));
  return node;
}

function svgRings(rings) {
  const commands = [];
  for (const ring of rings) {
    if (!ring?.length) continue;
    commands.push(`M ${ring[0][0]} ${ring[0][1]}`);
    for (let index = 1; index < ring.length; index += 1) {
      commands.push(`L ${ring[index][0]} ${ring[index][1]}`);
    }
    commands.push("Z");
  }
  const node = document.createElementNS(SVG_NS, "path");
  node.setAttribute("d", commands.join(" "));
  node.setAttribute("clip-rule", "evenodd");
  return node;
}

function drawMilitaryGrid(context, layerMap, size, xMin, xMax, yMin, yMax) {
  const span = Math.max(xMax - xMin, yMax - yMin);
  const { minor, major } = militarySteps(span);
  if (!isFiniteNumber(minor) || minor <= 0) return;
  updateSheetFacts(`${formatMeters(minor)} / ${formatMeters(major)}`);
  const minorColor = cssHex("--topo-grid-minor", "#3f3c34");
  const majorColor = cssHex("--topo-grid", "#1a1712");
  context.lineCap = "butt";
  context.font = '600 11px ui-monospace, "Cascadia Code", monospace';
  context.textBaseline = "top";
  strokeGridLines(context, layerMap, size, xMin, xMax, yMin, yMax, minor, major, false, minorColor);
  strokeGridLines(context, layerMap, size, xMin, xMax, yMin, yMax, major, major, true, majorColor);
}

function strokeGridLines(context, layerMap, size, xMin, xMax, yMin, yMax, step, major, isMajor, color) {
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = isMajor ? 1.6 : 1;
  context.font = isMajor
    ? '700 12px ui-monospace, "Cascadia Code", monospace'
    : '600 11px ui-monospace, "Cascadia Code", monospace';
  const minorPx = Math.abs(
    layerMap.latLngToContainerPoint(L.latLng(0, step)).x -
      layerMap.latLngToContainerPoint(L.latLng(0, 0)).x,
  );
  const labelMinors = isMajor || minorPx >= 52;
  let guard = 0;
  let lastTop = -Infinity;
  for (let x = firstGridLine(xMin, step); x <= xMax + step * 0.001; x += step) {
    if (++guard > 80) break;
    const majorLine = isMajorLine(x, major);
    if (!isMajor && majorLine) continue;
    const start = layerMap.latLngToContainerPoint(L.latLng(yMax, x));
    const end = layerMap.latLngToContainerPoint(L.latLng(yMin, x));
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
    if (!labelMinors || start.x < 8 || start.x > size.x - 8) continue;
    if (!isMajor && start.x - lastTop < 48) continue;
    const labelY = 5;
    if (labelBlocked(start.x, labelY + 6)) continue;
    fillGridLabel(context, formatMeters(Math.round(x / step) * step), start.x + 3, labelY);
    lastTop = start.x;
  }
  guard = 0;
  let lastLeft = -Infinity;
  for (let y = firstGridLine(yMin, step); y <= yMax + step * 0.001; y += step) {
    if (++guard > 80) break;
    const majorLine = isMajorLine(y, major);
    if (!isMajor && majorLine) continue;
    const start = layerMap.latLngToContainerPoint(L.latLng(y, xMin));
    const end = layerMap.latLngToContainerPoint(L.latLng(y, xMax));
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
    if (!labelMinors || start.y < 18 || start.y > size.y - 16) continue;
    if (!isMajor && Math.abs(start.y - lastLeft) < 28) continue;
    if (labelBlocked(10, start.y)) continue;
    fillGridLabel(context, formatMeters(Math.round(y / step) * step), 6, start.y + 3);
    lastLeft = start.y;
  }
}

function firstGridLine(min, step) {
  return Math.ceil(min / step - 1e-9) * step;
}

function isMajorLine(value, major) {
  if (!isFiniteNumber(major) || major <= 0) return false;
  const nearest = Math.round(value / major) * major;
  return Math.abs(value - nearest) <= major * 1e-6;
}

function labelBlocked(x, y) {
  const mapRect = map.getContainer().getBoundingClientRect();
  const obstacles = [
    document.querySelector(".leaflet-control-zoom"),
    document.querySelector(".compass-rose"),
    scaleBar.hidden ? null : scaleBar,
    infoPanel.hidden ? null : infoPanel,
    legendPanel.hidden ? null : legendPanel,
    infoToggle,
    legendToggle.hidden ? null : legendToggle,
  ];
  for (const node of obstacles) {
    if (!node) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    const left = rect.left - mapRect.left - 6;
    const right = rect.right - mapRect.left + 6;
    const top = rect.top - mapRect.top - 4;
    const bottom = rect.bottom - mapRect.top + 4;
    if (x >= left && x <= right && y >= top && y <= bottom) return true;
  }
  return false;
}

function drawScaleBar() {
  if (!map || mapView !== "topo") return;
  const origin = map.latLngToContainerPoint(L.latLng(0, 0));
  const east = map.latLngToContainerPoint(L.latLng(0, 100));
  const pxPerMeter = Math.abs(east.x - origin.x) / 100;
  const spec = scaleSpec(pxPerMeter);
  if (!spec || !isFiniteNumber(spec.px) || spec.px < 48) {
    scaleBar.setAttribute("aria-label", "Scale bar unavailable at this zoom");
    return;
  }
  const segmentPx = spec.px / spec.segments;
  scaleRule.replaceChildren();
  scaleRule.style.width = `${spec.px}px`;
  for (let index = 0; index < spec.segments; index += 1) {
    const block = document.createElement("span");
    block.className = index % 2 === 0 ? "scale-seg dark" : "scale-seg light";
    block.style.flex = "1 1 auto";
    block.style.width = `${segmentPx}px`;
    scaleRule.append(block);
  }
  scaleLabels.replaceChildren();
  scaleLabels.style.width = `${spec.px}px`;
  scaleLabels.append(
    scaleLabel("0", 0),
    scaleLabel(formatMeters(spec.meters / 2), 0.5),
    scaleLabel(formatMeters(spec.meters), 1),
  );
  scaleBar.setAttribute("aria-label", `Scale bar, 0 to ${formatMeters(spec.meters)}`);
}

function scaleLabel(text, at) {
  const node = document.createElement("span");
  node.textContent = text;
  node.style.left = `${at * 100}%`;
  if (at === 0) node.style.transform = "translateX(0)";
  else if (at === 1) node.style.transform = "translateX(-100%)";
  else node.style.transform = "translateX(-50%)";
  return node;
}

function cssHex(name, fallback) {
  const value = getComputedStyle(mapFrame).getPropertyValue(name).trim();
  return isHex(value) ? value : fallback;
}

function isHex(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}
