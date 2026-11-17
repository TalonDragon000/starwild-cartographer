export function matchesTutorialQuery(tutorial, query) {
  const tokens = String(query ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = [
    tutorial.name,
    tutorial.categoryName,
    tutorial.category,
    tutorial.source,
    tutorial.id,
    ...(tutorial.steps ?? []),
  ]
    .join("\n")
    .toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export function filterTutorials(tutorials, state) {
  return tutorials.filter((tutorial) => {
    if (state.categories !== "all" && !state.categories.has(tutorial.category)) return false;
    return matchesTutorialQuery(tutorial, state.query);
  });
}

export function sortTutorials(tutorials) {
  return [...tutorials].sort((a, b) =>
    String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" }),
  );
}

export function revealLinkedTutorial(state, tutorial) {
  if (!tutorial) return state;
  const categories =
    state.categories === "all" || state.categories.has(tutorial.category) ? state.categories : "all";
  return {
    query: matchesTutorialQuery(tutorial, state.query) ? state.query : "",
    categories,
  };
}

export function stateFromUrl(params, categoryIds) {
  const knownIds = new Set(categoryIds);
  const requested = params.getAll("category").filter((value) => value !== "");
  let categories = "all";
  if (requested.length === 1 && requested[0] === "none") {
    categories = new Set();
  } else if (requested.length > 0) {
    const known = requested.filter((id) => id !== "none" && knownIds.has(id));
    if (known.length === 0) categories = "all";
    else if (known.length === knownIds.size) categories = "all";
    else categories = new Set(known);
  }
  return {
    query: params.get("q") ?? "",
    categories,
  };
}

export function urlFromState(state, categoryIds) {
  const params = new URLSearchParams();
  const query = String(state.query ?? "").trim();
  if (query) params.set("q", query);
  if (state.categories !== "all") {
    if (state.categories.size === 0) {
      params.append("category", "none");
    } else {
      for (const id of categoryIds) {
        if (state.categories.has(id)) params.append("category", id);
      }
    }
  }
  return params;
}
