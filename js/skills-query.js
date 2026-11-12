export function matchesQuery(skill, query) {
  const tokens = String(query ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = [
    skill.name,
    skill.description,
    skill.categoryName,
    skill.category,
    skill.status,
    skill.id,
    ...(skill.tags ?? []),
    skill.bodyText ?? "",
  ]
    .join("\n")
    .toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export function filterSkills(skills, state) {
  return skills.filter((skill) => {
    if (state.status !== "all" && skill.status !== state.status) return false;
    if (state.categories !== "all" && !state.categories.has(skill.category)) return false;
    return matchesQuery(skill, state.query);
  });
}

export function sortSkills(skills, sort) {
  const copy = [...skills];
  copy.sort((a, b) => {
    if (sort === "updated") {
      const byDate = String(b.last_updated).localeCompare(String(a.last_updated));
      if (byDate !== 0) return byDate;
    }
    return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" });
  });
  return copy;
}

export function revealLinkedSkill(state, skill) {
  if (!skill) return state;
  const categories =
    state.categories === "all" || state.categories.has(skill.category)
      ? state.categories === "all"
        ? "all"
        : new Set(state.categories)
      : "all";
  return {
    query: matchesQuery(skill, state.query) ? state.query : "",
    status: state.status !== "all" && state.status !== skill.status ? "all" : state.status,
    sort: state.sort,
    categories,
  };
}

export function stateFromUrl(params, categoryIds) {
  const knownIds = new Set(categoryIds);
  const statusRaw = params.get("status");
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
    status: statusRaw === "verified" || statusRaw === "draft" ? statusRaw : "all",
    sort: params.get("sort") === "updated" ? "updated" : "az",
    categories,
  };
}

export function urlFromState(state, categoryIds) {
  const params = new URLSearchParams();
  const query = String(state.query ?? "").trim();
  if (query) params.set("q", query);
  if (state.status === "verified" || state.status === "draft") params.set("status", state.status);
  if (state.sort === "updated") params.set("sort", state.sort);
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
