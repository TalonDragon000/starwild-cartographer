import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseFrontmatter, renderSkillMarkdown, safeUrl } from "../js/markdown.js";
import {
  filterSkills,
  revealLinkedSkill,
  sortSkills,
  stateFromUrl,
  urlFromState,
} from "../js/skills-query.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readSkill(id) {
  return readFileSync(join(root, "bot-skills", id, "SKILL.md"), "utf8");
}

test("escapes HTML instead of rendering it", () => {
  const html = renderSkillMarkdown(
    "# Title\n\nHello <script>alert(1)</script> and <img src=x onerror=alert(1)>",
    "Other",
  );
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img/i);
});

test("drops unsafe link targets and escapes safe ones", () => {
  const html = renderSkillMarkdown(
    [
      "[bad](javascript:alert(1))",
      "[break](https://example.com/\"><script>alert(1)</script>)",
      "[ok](https://example.com/a?b=1&c=2)",
      "[file](bot-skills/example/SKILL.md)",
    ].join("\n\n"),
    "Other",
  );
  assert.doesNotMatch(html, /href="javascript:/i);
  assert.match(html, /\[bad\]\(javascript:alert\(1\)\)/);
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /href="https:\/\/example.com\/a\?b=1&amp;c=2"/);
  assert.match(html, /href="bot-skills\/example\/SKILL.md"/);
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(safeUrl("//evil.example"), null);
});

test("renders headings, lists, and bold under the card heading level", () => {
  const html = renderSkillMarkdown(
    [
      "# Title",
      "",
      "## 1. Make contact",
      "",
      "1. Open **Nearby** chat.",
      "2. Send hello.",
      "",
      "- **Accepting:** click Accept.",
      "",
      "Use `E` to interact.",
    ].join("\n"),
    "Title",
  );
  assert.match(html, /<h4>1\. Make contact<\/h4>/);
  assert.match(html, /<ol><li>Open <strong>Nearby<\/strong> chat\.<\/li><li>Send hello\.<\/li><\/ol>/);
  assert.match(html, /<ul><li><strong>Accepting:<\/strong> click Accept\.<\/li><\/ul>/);
  assert.match(html, /<code>E<\/code>/);
  assert.doesNotMatch(html, /<h1|<h2|<h3/);
});

test("reads folded frontmatter and keeps placeholders escaped in the crew skill", () => {
  const markdown = readSkill("starwild-crew-and-chat");
  const parsed = parseFrontmatter(markdown);
  assert.equal(parsed.data.name, "Starwild crew and chat");
  assert.match(parsed.data.description, /Nearby vs Crew chat/);
  const html = renderSkillMarkdown(markdown, parsed.data.name);
  assert.match(html, /Hi &lt;Name&gt;, &lt;BotName&gt;/);
  assert.match(html, /Make contact first/);
  assert.doesNotMatch(html, /<Name>|<BotName>/);
  assert.doesNotMatch(html, /<h1|<h2|<h3/);
});

test("renders the other skill bodies", () => {
  const climbing = renderSkillMarkdown(
    readSkill("starwild-climbing-and-bed-spawn"),
    "Starwild climbing and bed spawn",
  );
  const lag = renderSkillMarkdown(
    readSkill("starwild-lag-and-browser-handling"),
    "Starwild lag and browser handling",
  );
  assert.match(climbing, /There(?:'|&#39;)s no climb key/);
  assert.match(climbing, /Setting a bed spawn/);
  assert.match(lag, /Refresh the game tab first/);
  assert.match(lag, /HTTP 401/);
});

test("filters by query, category, and status, then sorts", () => {
  const index = JSON.parse(readFileSync(join(root, "data/bot-skills.json"), "utf8"));
  const names = new Map(index.categories.map((category) => [category.id, category.name]));
  const skills = index.skills.map((skill) => ({
    ...skill,
    categoryName: names.get(skill.category),
    bodyText: readSkill(skill.id),
  }));

  const ladder = filterSkills(skills, {
    query: "ladder",
    status: "all",
    categories: "all",
  });
  assert.deepEqual(ladder.map((skill) => skill.id), ["starwild-climbing-and-bed-spawn"]);

  const phrase = filterSkills(skills, {
    query: "name tag",
    status: "all",
    categories: "all",
  });
  assert.deepEqual(phrase.map((skill) => skill.id), ["starwild-crew-and-chat"]);

  const drafts = filterSkills(skills, {
    query: "",
    status: "draft",
    categories: "all",
  });
  assert.deepEqual(drafts.map((skill) => skill.status), ["draft"]);

  const crewOnly = filterSkills(skills, {
    query: "invite",
    status: "verified",
    categories: new Set(["social-crew"]),
  });
  assert.deepEqual(crewOnly.map((skill) => skill.id), ["starwild-crew-and-chat"]);

  assert.deepEqual(
    sortSkills(skills, "az").map((skill) => skill.id),
    [
      "starwild-climbing-and-bed-spawn",
      "starwild-crew-and-chat",
      "starwild-lag-and-browser-handling",
    ],
  );

  const dated = [
    { name: "Later", last_updated: "2026-11-01" },
    { name: "Earlier", last_updated: "2026-11-12" },
    { name: "Also earlier", last_updated: "2026-11-12" },
  ];
  assert.deepEqual(
    sortSkills(dated, "updated").map((skill) => skill.name),
    ["Also earlier", "Earlier", "Later"],
  );
});

test("round-trips filter state through the query string", () => {
  const ids = new Set(["social-crew", "movement-building", "performance-troubleshooting"]);
  const ordered = [...ids];
  const state = {
    query: "bed spawn",
    status: "draft",
    sort: "updated",
    categories: new Set(["movement-building"]),
  };
  const params = urlFromState(state, ordered);
  assert.equal(params.toString(), "q=bed+spawn&status=draft&sort=updated&category=movement-building");
  const read = stateFromUrl(params, ids);
  assert.equal(read.query, "bed spawn");
  assert.equal(read.status, "draft");
  assert.equal(read.sort, "updated");
  assert.deepEqual([...read.categories], ["movement-building"]);

  const cleared = stateFromUrl(new URLSearchParams(), ids);
  assert.equal(cleared.categories, "all");
  assert.equal(urlFromState(cleared, ordered).toString(), "");

  const none = stateFromUrl(new URLSearchParams("category=none"), ids);
  assert.equal(none.categories.size, 0);
  assert.equal(urlFromState(none, ordered).get("category"), "none");

  const unknown = stateFromUrl(new URLSearchParams("status=nope&category=combat&sort=sideways"), ids);
  assert.equal(unknown.status, "all");
  assert.equal(unknown.sort, "az");
  assert.equal(unknown.categories, "all");
});

test("a deep link relaxes only the filters that hide the skill", () => {
  const skill = {
    id: "starwild-climbing-and-bed-spawn",
    name: "Starwild climbing and bed spawn",
    description: "bed spawn",
    category: "movement-building",
    categoryName: "Movement & Building",
    tags: ["bed"],
    status: "draft",
    bodyText: "climb the ladder",
  };
  const revealed = revealLinkedSkill(
    {
      query: "refresh",
      status: "verified",
      sort: "updated",
      categories: new Set(["social-crew"]),
    },
    skill,
  );
  assert.equal(revealed.query, "");
  assert.equal(revealed.status, "all");
  assert.equal(revealed.sort, "updated");
  assert.equal(revealed.categories, "all");

  const kept = revealLinkedSkill(
    {
      query: "ladder",
      status: "draft",
      sort: "az",
      categories: new Set(["movement-building"]),
    },
    skill,
  );
  assert.equal(kept.query, "ladder");
  assert.equal(kept.status, "draft");
  assert.deepEqual([...kept.categories], ["movement-building"]);
});
