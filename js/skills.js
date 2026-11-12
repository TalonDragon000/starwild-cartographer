import { renderSkillMarkdown } from "./markdown.js";
import {
  filterSkills,
  matchesQuery,
  revealLinkedSkill,
  sortSkills,
  stateFromUrl,
  urlFromState,
} from "./skills-query.js";

const RAW_BASE =
  "https://raw.githubusercontent.com/TalonDragon000/starwild-cartographer/main/";

const form = document.querySelector("#filters");
const searchInput = document.querySelector("#search");
const categoryList = document.querySelector("#category-list");
const sortSelect = document.querySelector("#sort");
const clearButton = document.querySelector("#clear-filters");
const summary = document.querySelector("#summary");
const skillList = document.querySelector("#skill-list");
const loadError = document.querySelector("#load-error");
const copyStatus = document.querySelector("#copy-status");

let catalog = [];
let skills = [];
let categoryIds = [];
let openIds = new Set();
let rendering = false;
let focusLinked = false;

form.addEventListener("submit", (event) => event.preventDefault());
searchInput.addEventListener("input", render);
sortSelect.addEventListener("change", render);
clearButton.addEventListener("click", clearFilters);
for (const input of document.querySelectorAll('input[name="status"]')) {
  input.addEventListener("change", render);
}
window.addEventListener("hashchange", () => {
  focusLinked = true;
  applyLinkedSkill();
  render();
});
window.addEventListener("popstate", () => {
  applyState(stateFromUrl(new URLSearchParams(location.search), categoryIds));
  focusLinked = hashId() !== "";
  applyLinkedSkill();
  render();
});

main();

async function main() {
  summary.textContent = "Loading skills.";
  try {
    const response = await fetch("data/bot-skills.json");
    if (!response.ok) throw new Error(`data/bot-skills.json returned ${response.status}`);
    const data = await response.json();
    if (!data || !Array.isArray(data.categories) || !Array.isArray(data.skills)) {
      throw new Error("data/bot-skills.json must have categories and skills arrays");
    }
    catalog = data.categories.filter(usableCategory);
    categoryIds = catalog.map((category) => category.id);
    const known = new Set(categoryIds);
    const skipped = data.skills.filter((skill) => !usableSkill(skill, known)).length;
    const records = data.skills.filter((skill) => usableSkill(skill, known));
    const loaded = await Promise.all(records.map(loadSkill));
    skills = loaded.map((skill) => skill.record);
    const failed = loaded.filter((skill) => skill.failed).length;
    buildCategories();
    applyState(stateFromUrl(new URLSearchParams(location.search), categoryIds));
    if (skipped > 0) {
      showError(
        `${skipped} skill${skipped === 1 ? "" : "s"} could not be read and ${skipped === 1 ? "was" : "were"} left off the page.`,
      );
    }
    if (failed > 0) {
      showError(
        `${failed} skill file${failed === 1 ? "" : "s"} could not be loaded. Search still covers the index for ${failed === 1 ? "that skill" : "those skills"}.`,
      );
    }
    focusLinked = hashId() !== "";
    applyLinkedSkill();
    render();
  } catch (error) {
    showError("The skills could not be loaded. Check data/bot-skills.json.");
    summary.textContent = "Skills did not load.";
    console.error(error);
  }
}

async function loadSkill(skill) {
  const category = catalog.find((item) => item.id === skill.category);
  const record = {
    ...skill,
    categoryName: category ? category.name : skill.category,
    markdown: null,
    bodyText: "",
  };
  try {
    const response = await fetch(skill.source_path);
    if (!response.ok) throw new Error(`${skill.source_path} returned ${response.status}`);
    record.markdown = await response.text();
    record.bodyText = skillBodyText(record.markdown);
    return { record, failed: false };
  } catch (error) {
    console.error(error);
    return { record, failed: true };
  }
}

function skillBodyText(markdown) {
  const text = String(markdown).replace(/^\uFEFF/, "");
  const match = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? text.slice(match[0].length) : text;
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

function usableSkill(skill, knownCategories) {
  return (
    skill !== null &&
    typeof skill === "object" &&
    typeof skill.id === "string" &&
    skill.id.trim() !== "" &&
    typeof skill.name === "string" &&
    skill.name.trim() !== "" &&
    typeof skill.description === "string" &&
    typeof skill.category === "string" &&
    knownCategories.has(skill.category) &&
    Array.isArray(skill.tags) &&
    (skill.status === "verified" || skill.status === "draft") &&
    typeof skill.source_path === "string" &&
    skill.source_path.trim() !== ""
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
  allNoun.textContent = " skills";
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
    noun.textContent = " skills";
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
  const checked = document.querySelector('input[name="status"]:checked');
  const status = checked ? checked.value : "all";
  return {
    query: searchInput.value,
    status: status === "verified" || status === "draft" ? status : "all",
    sort: sortSelect.value === "updated" ? "updated" : "az",
    categories: selectedCategories(),
  };
}

function applyState(state) {
  searchInput.value = state.query;
  const status = state.status === "verified" || state.status === "draft" ? state.status : "all";
  const radio = document.querySelector(`input[name="status"][value="${status}"]`);
  if (radio) radio.checked = true;
  sortSelect.value = state.sort === "updated" ? "updated" : "az";
  for (const button of categoryList.querySelectorAll("button[data-category]")) {
    const on = state.categories === "all" || state.categories.has(button.dataset.category);
    button.setAttribute("aria-pressed", on ? "true" : "false");
  }
  syncAllChip();
}

function clearFilters() {
  applyState({ query: "", status: "all", sort: readState().sort, categories: "all" });
  render();
}

function applyLinkedSkill() {
  const id = hashId();
  if (!id) return;
  const skill = skills.find((item) => item.id === id);
  if (!skill) return;
  openIds.add(id);
  applyState(revealLinkedSkill(readState(), skill));
}

function render() {
  rendering = true;
  const state = readState();
  const visible = sortSkills(filterSkills(skills, state), state.sort);
  updateCounts(state);
  clearButton.disabled = !filtersActive(state);

  skillList.replaceChildren();
  if (skills.length === 0) {
    skillList.append(emptyMessage("No skills have been added yet."));
  } else if (visible.length === 0) {
    skillList.append(emptyMessage("No skills match these filters."));
  } else {
    for (const skill of visible) skillList.append(skillCard(skill));
  }

  const noun = skills.length === 1 ? "skill" : "skills";
  summary.textContent = `Showing ${visible.length} of ${skills.length} ${noun}.`;
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
  const allCount = skills.filter(
    (skill) =>
      (state.status === "all" || skill.status === state.status) && matchesQuery(skill, state.query),
  ).length;
  setChipCount(categoryList.querySelector('[data-count="all"]'), allCount);

  for (const category of catalog) {
    const count = skills.filter(
      (skill) =>
        skill.category === category.id &&
        (state.status === "all" || skill.status === state.status) &&
        matchesQuery(skill, state.query),
    ).length;
    setChipCount(categoryList.querySelector(`[data-count="${CSS.escape(category.id)}"]`), count);
  }

  for (const status of ["all", "verified", "draft"]) {
    const count = skills.filter((skill) => {
      if (status !== "all" && skill.status !== status) return false;
      if (state.categories !== "all" && !state.categories.has(skill.category)) return false;
      return matchesQuery(skill, state.query);
    }).length;
    setChipCount(document.querySelector(`[data-status-count="${status}"]`), count);
  }
}

function setChipCount(node, count) {
  if (!node) return;
  node.textContent = String(count);
  const noun = node.parentElement?.querySelector(".count-noun");
  if (noun) noun.textContent = count === 1 ? " skill" : " skills";
}

function filtersActive(state) {
  return state.query.trim() !== "" || state.status !== "all" || state.categories !== "all";
}

function emptyMessage(text) {
  const paragraph = document.createElement("p");
  paragraph.className = "empty";
  paragraph.textContent = text;
  return paragraph;
}

function skillCard(skill) {
  const article = document.createElement("article");
  article.className = "skill-card";
  article.id = skill.id;
  article.dataset.status = skill.status;

  const details = document.createElement("details");
  if (openIds.has(skill.id)) details.open = true;

  const summaryEl = document.createElement("summary");
  const kicker = document.createElement("p");
  kicker.className = "skill-kicker";
  const badge = document.createElement("span");
  badge.className = `badge badge-${skill.status}`;
  badge.textContent = skill.status === "draft" ? "Draft" : "Verified";
  const category = document.createElement("span");
  category.textContent = skill.categoryName;
  kicker.append(badge, category);

  const title = document.createElement("h3");
  title.textContent = skill.name;

  const description = document.createElement("p");
  description.className = "skill-desc";
  description.textContent = skill.description;

  summaryEl.append(kicker, title, description);
  if (skill.tags.length > 0) summaryEl.append(tagList(skill.tags));

  const meta = document.createElement("p");
  meta.className = "meta";
  const updated = textOrDash(skill.last_updated);
  const added = textOrDash(skill.date_added);
  meta.textContent = `Updated ${updated}. Added ${added}.`;
  summaryEl.append(meta);

  const toggle = document.createElement("span");
  toggle.className = "toggle-label";
  toggle.textContent = details.open ? "Hide steps" : "Show steps";
  summaryEl.append(toggle);

  const panel = document.createElement("div");
  panel.className = "skill-panel";
  panel.append(actionRow(skill));

  if (skill.status === "draft") {
    const note = document.createElement("p");
    note.className = "draft-note";
    note.textContent = "Draft. A step in this skill is not confirmed yet.";
    panel.append(note);
  }

  const body = document.createElement("div");
  body.className = "skill-body";
  if (skill.markdown) {
    // renderSkillMarkdown escapes text and only emits a fixed set of tags.
    body.innerHTML = renderSkillMarkdown(skill.markdown, skill.name);
  } else {
    const missing = document.createElement("p");
    missing.textContent = `The skill text could not be loaded from ${skill.source_path}.`;
    body.append(missing);
  }
  panel.append(body);

  details.append(summaryEl, panel);
  details.addEventListener("toggle", () => {
    toggle.textContent = details.open ? "Hide steps" : "Show steps";
    if (rendering) return;
    if (details.open) {
      openIds.add(skill.id);
      setHash(skill.id);
    } else {
      openIds.delete(skill.id);
      if (hashId() === skill.id) clearHash();
    }
  });

  article.append(details);
  return article;
}

function tagList(tags) {
  const list = document.createElement("ul");
  list.className = "tag-list";
  list.setAttribute("aria-label", "Tags");
  for (const tag of tags) {
    const item = document.createElement("li");
    item.textContent = String(tag);
    list.append(item);
  }
  return list;
}

function actionRow(skill) {
  const row = document.createElement("div");
  row.className = "skill-actions";
  const link = document.createElement("a");
  link.href = rawUrl(skill.source_path);
  link.textContent = "Raw SKILL.md";
  row.append(link);

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Copy SKILL.md";
  if (!skill.markdown) {
    button.disabled = true;
    button.textContent = "Copy unavailable";
  } else {
    button.addEventListener("click", () => copySkill(skill, button));
  }
  row.append(button);
  return row;
}

async function copySkill(skill, button) {
  const original = "Copy SKILL.md";
  try {
    await copyText(skill.markdown);
    button.textContent = "Copied";
    announce(`Copied ${skill.name}.`);
    window.setTimeout(() => {
      if (button.isConnected) button.textContent = original;
    }, 2000);
  } catch (error) {
    console.error(error);
    button.textContent = "Copy failed";
    announce(`Could not copy ${skill.name}. Use the raw SKILL.md link.`);
    window.setTimeout(() => {
      if (button.isConnected) button.textContent = original;
    }, 2000);
  }
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.append(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("copy failed");
}

function announce(message) {
  copyStatus.textContent = "";
  window.setTimeout(() => {
    copyStatus.textContent = message;
  }, 30);
}

function rawUrl(sourcePath) {
  const encoded = String(sourcePath)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return RAW_BASE + encoded;
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

function textOrDash(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function showError(message) {
  loadError.hidden = false;
  const current = loadError.textContent.trim();
  loadError.textContent = current ? `${current} ${message}` : message;
}
