import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  filterTutorials,
  revealLinkedTutorial,
  sortTutorials,
  stateFromUrl,
  urlFromState,
} from "../js/tutorials-query.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("the graphics tutorial is searchable and links from the lag skill", () => {
  const tutorials = JSON.parse(readFileSync(join(root, "data/bot-tutorials.json"), "utf8"));
  const skills = JSON.parse(readFileSync(join(root, "data/bot-skills.json"), "utf8"));
  const skill = skills.skills.find((item) => item.id === "starwild-lag-and-browser-handling");
  const graphics = tutorials.tutorials.find((item) => item.id === skill.tutorial_id);
  assert.equal(graphics.category, "performance");
  assert.equal(graphics.video, null);
  assert.equal(graphics.source, "video by TalonDragon000");
  assert.match(graphics.steps.join("\n"), /smartphone icon/);
  assert.match(graphics.steps.join("\n"), /Quality to Low/);
  assert.match(graphics.steps.join("\n"), /UI size to 80%/);
  assert.match(graphics.steps.join("\n"), /Leave Voice as it is/);
  assert.match(graphics.steps.join("\n"), /no save button/);

  const markdown = readFileSync(
    join(root, "bot-skills/starwild-lag-and-browser-handling/SKILL.md"),
    "utf8",
  );
  assert.match(markdown, /tutorials\.html#lower-graphics-to-reduce-lag/);

  const records = tutorials.tutorials.map((tutorial) => ({
    ...tutorial,
    categoryName: tutorials.categories.find((category) => category.id === tutorial.category)?.name,
  }));
  const found = filterTutorials(records, { query: "push to talk", categories: new Set(["performance"]) });
  assert.deepEqual(found.map((tutorial) => tutorial.id), ["lower-graphics-to-reduce-lag"]);
  assert.equal(filterTutorials(records, { query: "push", categories: new Set(["missing"]) }).length, 0);
  assert.equal(sortTutorials(records)[0].id, "lower-graphics-to-reduce-lag");
});

test("tutorial filters round-trip through the query string", () => {
  const ids = ["performance", "movement"];
  const state = { query: "quality low", categories: new Set(["performance"]) };
  const params = urlFromState(state, ids);
  assert.equal(params.toString(), "q=quality+low&category=performance");
  const read = stateFromUrl(params, ids);
  assert.equal(read.query, "quality low");
  assert.deepEqual([...read.categories], ["performance"]);
  assert.equal(urlFromState({ query: "", categories: "all" }, ids).toString(), "");

  const revealed = revealLinkedTutorial(
    { query: "ladder", categories: new Set(["movement"]) },
    { name: "Lower graphics", category: "performance", categoryName: "Performance", source: "video", steps: ["Quality"] },
  );
  assert.equal(revealed.query, "");
  assert.equal(revealed.categories, "all");
});
