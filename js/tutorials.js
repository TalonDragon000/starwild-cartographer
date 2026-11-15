import {
  filterTutorials,
  matchesTutorialQuery,
  revealLinkedTutorial,
  sortTutorials,
  stateFromUrl,
  urlFromState,
} from "./tutorials-query.js";

const form = document.querySelector("#filters");
const searchInput = document.querySelector("#search");
const categoryList = document.querySelector("#category-list");
const clearButton = document.querySelector("#clear-filters");
const summary = document.querySelector("#summary");
const tutorialList = document.querySelector("#tutorial-list");
const loadError = document.querySelector("#load-error");

let catalog = [];
let tutorials = [];
let categoryIds = [];
let openIds = new Set();
let rendering = false;
let focusLinked = false;

form.addEventListener("submit", (event) => event.preventDefault());
searchInput.addEventListener("input", render);
clearButton.addEventListener("click", clearFilters);
window.addEventListener("hashchange", () => {
  focusLinked = true;
  applyLinkedTutorial();
  render();
});
window.addEventListener("popstate", () => {
  applyState(stateFromUrl(new URLSearchParams(location.search), categoryIds));
  focusLinked = hashId() !== "";
  applyLinkedTutorial();
  render();
});

main();

async function main() {
  summary.textContent = "Loading tutorials.";
  try {
    const response = await fetch("data/bot-tutorials.json");
    if (!response.ok) throw new Error(`data/bot-tutorials.json returned ${response.status}`);
    const data = await response.json();
    if (!data || !Array.isArray(data.categories) || !Array.isArray(data.tutorials)) {
      throw new Error("data/bot-tutorials.json must have categories and tutorials arrays");
    }
    catalog = data.categories.filter(usableCategory);
    categoryIds = catalog.map((category) => category.id);
    const known = new Set(categoryIds);
    const skipped = data.tutorials.filter((tutorial) => !usableTutorial(tutorial, known)).length;
    tutorials = data.tutorials.filter((tutorial) => usableTutorial(tutorial, known)).map((tutorial) => {
      const category = catalog.find((item) => item.id === tutorial.category);
      return { ...tutorial, categoryName: category ? category.name : tutorial.category };
    });
    buildCategories();
    applyState(stateFromUrl(new URLSearchParams(location.search), categoryIds));
    if (skipped > 0) {
      showError(
        `${skipped} tutorial${skipped === 1 ? "" : "s"} could not be read and ${skipped === 1 ? "was" : "were"} left off the page.`,
      );
    }
    focusLinked = hashId() !== "";
    applyLinkedTutorial();
    render();
  } catch (error) {
    showError("The tutorials could not be loaded. Check data/bot-tutorials.json.");
    summary.textContent = "Tutorials did not load.";
    console.error(error);
  }
}

function usableCategory(category) {
  return (
    category !== null &&
    typeof category === "object" &&
    typeof category.id === "string" &&
    category.id.trim() !== "" &&
    typeof category.name === "string" &&
    category.name.trim() !== ""
  );
}

function usableTutorial(tutorial, knownCategories) {
  return (
    tutorial !== null &&
    typeof tutorial === "object" &&
    typeof tutorial.id === "string" &&
    tutorial.id.trim() !== "" &&
    typeof tutorial.name === "string" &&
    tutorial.name.trim() !== "" &&
    typeof tutorial.category === "string" &&
    knownCategories.has(tutorial.category) &&
    typeof tutorial.source === "string" &&
    tutorial.source.trim() !== "" &&
    (tutorial.video === null || typeof tutorial.video === "string") &&
    Array.isArray(tutorial.steps) &&
    tutorial.steps.length > 0 &&
    tutorial.steps.every((step) => typeof step === "string" && step.trim() !== "")
  );
}

function buildCategories() {
  const all = document.createElement("button");
  all.type = "button";
  all.className = "chip";
  all.dataset.all = "true";
  all.setAttribute("aria-pressed", "true");
  const allLabel = document.createElement("span");
  allLabel.className = "chip-label";
  allLabel.textContent = "All";
  const allCount = document.createElement("span");
  allCount.className = "count";
  allCount.dataset.count = "all";
  allCount.textContent = "0";
  const allNoun = document.createElement("span");
  allNoun.className = "visually-hidden count-noun";
  allNoun.textContent = " tutorials";
  all.append(allLabel, allCount, allNoun);
  all.addEventListener("click", () => {
    setCategories(true);
    render();
  });
  categoryList.append(all);

  for (const category of catalog) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.dataset.category = category.id;
    button.setAttribute("aria-pressed", "true");
    const label = document.createElement("span");
    label.className = "chip-label";
    label.textContent = category.name;
    const count = document.createElement("span");
    count.className = "count";
    count.dataset.count = category.id;
    count.textContent = "0";
    const noun = document.createElement("span");
    noun.className = "visually-hidden count-noun";
    noun.textContent = " tutorials";
    button.append(label, count, noun);
    button.addEventListener("click", () => {
      const pressed = button.getAttribute("aria-pressed") === "true";
      button.setAttribute("aria-pressed", pressed ? "false" : "true");
      syncAllChip();
      render();
    });
    categoryList.append(button);
  }
}

function setCategories(on) {
  for (const button of categoryList.querySelectorAll("button[data-category]")) {
    button.setAttribute("aria-pressed", on ? "true" : "false");
  }
  syncAllChip();
}

function syncAllChip() {
  const buttons = [...categoryList.querySelectorAll("button[data-category]")];
  const allOn = buttons.length > 0 && buttons.every((button) => button.getAttribute("aria-pressed") === "true");
  const allButton = categoryList.querySelector('button[data-all="true"]');
  if (allButton) allButton.setAttribute("aria-pressed", allOn ? "true" : "false");
}

function selectedCategories() {
  const buttons = [...categoryList.querySelectorAll("button[data-category]")];
  const selected = buttons
    .filter((button) => button.getAttribute("aria-pressed") === "true")
    .map((button) => button.dataset.category);
  if (buttons.length > 0 && selected.length === buttons.length) return "all";
  return new Set(selected);
}

function readState() {
  return {
    query: searchInput.value,
    categories: selectedCategories(),
  };
}

function applyState(state) {
  searchInput.value = state.query;
  for (const button of categoryList.querySelectorAll("button[data-category]")) {
    const on = state.categories === "all" || state.categories.has(button.dataset.category);
    button.setAttribute("aria-pressed", on ? "true" : "false");
  }
  syncAllChip();
}

function clearFilters() {
  applyState({ query: "", categories: "all" });
  render();
}

function applyLinkedTutorial() {
  const id = hashId();
  if (!id) return;
  const tutorial = tutorials.find((item) => item.id === id);
  if (!tutorial) return;
  openIds.add(id);
  applyState(revealLinkedTutorial(readState(), tutorial));
}

function render() {
  rendering = true;
  const state = readState();
  const visible = sortTutorials(filterTutorials(tutorials, state));
  updateCounts(state);
  clearButton.disabled = !filtersActive(state);

  tutorialList.replaceChildren();
  if (tutorials.length === 0) {
    tutorialList.append(emptyMessage("No tutorials have been added yet."));
  } else if (visible.length === 0) {
    tutorialList.append(emptyMessage("No tutorials match these filters."));
  } else {
    for (const tutorial of visible) tutorialList.append(tutorialCard(tutorial));
  }

  const noun = tutorials.length === 1 ? "tutorial" : "tutorials";
  summary.textContent = `Showing ${visible.length} of ${tutorials.length} ${noun}.`;
  writeUrl(state);
  rendering = false;

  if (focusLinked) {
    focusLinked = false;
    const id = hashId();
    const card = id ? document.getElementById(id) : null;
    if (card) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      card.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
      card.querySelector("summary")?.focus({ preventScroll: true });
    }
  }
}

function updateCounts(state) {
  const allCount = tutorials.filter((tutorial) => matchesTutorialQuery(tutorial, state.query)).length;
  setChipCount(categoryList.querySelector('[data-count="all"]'), allCount);
  for (const category of catalog) {
    const count = tutorials.filter(
      (tutorial) => tutorial.category === category.id && matchesTutorialQuery(tutorial, state.query),
    ).length;
    setChipCount(categoryList.querySelector(`[data-count="${CSS.escape(category.id)}"]`), count);
  }
}

function setChipCount(node, count) {
  if (!node) return;
  node.textContent = String(count);
  const noun = node.parentElement?.querySelector(".count-noun");
  if (noun) noun.textContent = count === 1 ? " tutorial" : " tutorials";
}

function filtersActive(state) {
  return state.query.trim() !== "" || state.categories !== "all";
}

function emptyMessage(text) {
  const paragraph = document.createElement("p");
  paragraph.className = "empty";
  paragraph.textContent = text;
  return paragraph;
}

function tutorialCard(tutorial) {
  const article = document.createElement("article");
  article.className = "skill-card";
  article.id = tutorial.id;

  const details = document.createElement("details");
  if (openIds.has(tutorial.id)) details.open = true;

  const summaryEl = document.createElement("summary");
  const kicker = document.createElement("p");
  kicker.className = "skill-kicker";
  const category = document.createElement("span");
  category.textContent = tutorial.categoryName;
  kicker.append(category);

  const title = document.createElement("h3");
  title.textContent = tutorial.name;

  const source = document.createElement("p");
  source.className = "skill-desc";
  source.textContent = `Source: ${tutorial.source}`;

  summaryEl.append(kicker, title, source);

  const toggle = document.createElement("span");
  toggle.className = "toggle-label";
  toggle.textContent = details.open ? "Hide steps" : "Show steps";
  summaryEl.append(toggle);

  const panel = document.createElement("div");
  panel.className = "skill-panel";
  panel.append(videoLine(tutorial));

  const steps = document.createElement("ol");
  steps.className = "skill-body";
  for (const step of tutorial.steps) {
    const item = document.createElement("li");
    item.textContent = step;
    steps.append(item);
  }
  panel.append(steps);

  details.append(summaryEl, panel);
  details.addEventListener("toggle", () => {
    toggle.textContent = details.open ? "Hide steps" : "Show steps";
    if (rendering) return;
    if (details.open) {
      openIds.add(tutorial.id);
      setHash(tutorial.id);
    } else {
      openIds.delete(tutorial.id);
      if (hashId() === tutorial.id) clearHash();
    }
  });

  article.append(details);
  return article;
}

function videoLine(tutorial) {
  const paragraph = document.createElement("p");
  paragraph.className = "meta";
  if (typeof tutorial.video === "string" && tutorial.video.trim() !== "") {
    const link = document.createElement("a");
    link.href = tutorial.video;
    link.textContent = "Video";
    link.rel = "noopener";
    paragraph.append("Video: ", link);
    return paragraph;
  }
  paragraph.textContent = "Video link not added yet.";
  return paragraph;
}

function writeUrl(state) {
  const params = urlFromState(state, categoryIds);
  const query = params.toString();
  const search = query ? `?${query}` : "";
  const next = `${location.pathname}${search}${location.hash}`;
  const current = `${location.pathname}${location.search}${location.hash}`;
  if (next !== current) history.replaceState(null, "", next);
}

function setHash(id) {
  const url = new URL(location.href);
  url.hash = id;
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function clearHash() {
  const url = new URL(location.href);
  url.hash = "";
  history.replaceState(null, "", `${url.pathname}${url.search}`);
}

function hashId() {
  const raw = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function showError(message) {
  loadError.hidden = false;
  const current = loadError.textContent.trim();
  loadError.textContent = current ? `${current} ${message}` : message;
}
