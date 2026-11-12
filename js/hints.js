const form = document.querySelector("#filters");
const searchInput = document.querySelector("#search");
const categoryList = document.querySelector("#category-list");
const summary = document.querySelector("#summary");
const hintList = document.querySelector("#hint-list");
const loadError = document.querySelector("#load-error");

let hints = [];

form.addEventListener("submit", (event) => event.preventDefault());
searchInput.addEventListener("input", render);
document.querySelector("#categories-all").addEventListener("click", () => setCategories(true));
document.querySelector("#categories-none").addEventListener("click", () => setCategories(false));

main();

async function main() {
  try {
    const response = await fetch("data/hints.json");
    if (!response.ok) throw new Error(`data/hints.json returned ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("data/hints.json must be an array");
    hints = data.filter(usable);
    const skipped = data.length - hints.length;
    buildCategories();
    if (skipped > 0) {
      showError(
        `${skipped} hint${skipped === 1 ? "" : "s"} could not be read and ${skipped === 1 ? "was" : "were"} left off the page.`,
      );
    }
    render();
  } catch (error) {
    showError("The hints could not be loaded. Check data/hints.json.");
    summary.textContent = "Hints did not load.";
    console.error(error);
  }
}

function usable(hint) {
  return (
    hint !== null &&
    typeof hint === "object" &&
    typeof hint.id === "string" &&
    typeof hint.category === "string" &&
    hint.category.trim() !== "" &&
    typeof hint.tip === "string" &&
    hint.tip.trim() !== "" &&
    typeof hint.details === "string"
  );
}

function buildCategories() {
  for (const category of categoryNames()) {
    const item = document.createElement("li");
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "category";
    input.value = category;
    input.checked = true;
    input.addEventListener("change", render);
    const name = document.createElement("span");
    name.textContent = category;
    const count = document.createElement("span");
    count.className = "count";
    count.dataset.category = category;
    count.textContent = "0";
    label.append(input, name, count);
    item.append(label);
    categoryList.append(item);
  }
}

function categoryNames() {
  const names = [];
  for (const hint of hints) {
    if (!names.includes(hint.category)) names.push(hint.category);
  }
  return names;
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
  const query = searchInput.value.trim().toLowerCase();
  const categories = selectedCategories();
  const visible = hints.filter((hint) => {
    if (!categories.has(hint.category)) return false;
    if (!query) return true;
    return haystack(hint).includes(query);
  });

  for (const count of categoryList.querySelectorAll(".count")) {
    const category = count.dataset.category;
    count.textContent = String(
      hints.filter((hint) => hint.category === category && haystack(hint).includes(query)).length,
    );
  }

  hintList.replaceChildren();
  if (visible.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No hints match these filters.";
    hintList.append(empty);
  } else {
    for (const category of categoryNames()) {
      const groupHints = visible.filter((hint) => hint.category === category);
      if (groupHints.length === 0) continue;
      const section = document.createElement("section");
      section.className = "hint-group";
      const heading = document.createElement("h2");
      heading.textContent = category;
      section.append(heading);
      for (const hint of groupHints) section.append(hintArticle(hint));
      hintList.append(section);
    }
  }

  summary.textContent = `Showing ${visible.length} of ${hints.length} hint${hints.length === 1 ? "" : "s"}.`;
}

function hintArticle(hint) {
  const article = document.createElement("article");
  article.className = "hint";
  article.id = hint.id;
  const title = document.createElement("h3");
  title.textContent = hint.tip;
  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = `Added ${textOrDash(hint.date_added)}. Source: ${textOrDash(hint.source)}.`;
  const details = document.createElement("p");
  details.textContent = hint.details;
  article.append(title, meta, details);
  return article;
}

function haystack(hint) {
  return [hint.tip, hint.details, hint.category, hint.source, hint.id, hint.date_added]
    .filter((part) => part !== null && part !== undefined)
    .join(" ")
    .toLowerCase();
}

function textOrDash(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function showError(message) {
  loadError.hidden = false;
  loadError.textContent = message;
}
