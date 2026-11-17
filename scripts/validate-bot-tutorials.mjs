import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = join(root, "data/bot-tutorials.json");
const categoryKeys = ["id", "name"];
const tutorialKeys = ["id", "name", "category", "source", "video", "steps"];
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const errors = [];

function fail(path, message) {
  errors.push(`${path}: ${message}`);
}

let data;
try {
  data = JSON.parse(readFileSync(indexPath, "utf8"));
} catch (error) {
  console.error(`data/bot-tutorials.json is not valid JSON: ${error.message}`);
  process.exit(1);
}

if (data === null || typeof data !== "object" || Array.isArray(data)) {
  fail("data/bot-tutorials.json", "expected an object with categories and tutorials");
}

for (const key of ["categories", "tutorials"]) {
  if (!Array.isArray(data?.[key])) fail(`data/bot-tutorials.json.${key}`, "expected an array");
}

const presentTop = data && typeof data === "object" && !Array.isArray(data) ? Object.keys(data) : [];
for (const key of presentTop) {
  if (key !== "categories" && key !== "tutorials") fail("data/bot-tutorials.json", `unknown property ${key}`);
}

const categoryIds = new Set();
for (const [index, category] of (data?.categories ?? []).entries()) {
  const path = `categories[${index}]`;
  if (category === null || typeof category !== "object" || Array.isArray(category)) {
    fail(path, "must be an object");
    continue;
  }
  for (const key of categoryKeys) {
    if (!Object.hasOwn(category, key)) fail(path, `missing ${key}`);
  }
  for (const key of Object.keys(category)) {
    if (!categoryKeys.includes(key)) fail(path, `unknown property ${key}`);
  }
  if (typeof category.id !== "string" || !idPattern.test(category.id)) {
    fail(`${path}.id`, "must be lowercase words separated by hyphens");
  } else if (categoryIds.has(category.id)) {
    fail(`${path}.id`, `duplicate id ${category.id}`);
  } else {
    categoryIds.add(category.id);
  }
  if (typeof category.name !== "string" || category.name.trim() === "") {
    fail(`${path}.name`, "must be a non-empty string");
  }
}

const tutorialIds = new Set();
for (const [index, tutorial] of (data?.tutorials ?? []).entries()) {
  const path = `tutorials[${index}]`;
  if (tutorial === null || typeof tutorial !== "object" || Array.isArray(tutorial)) {
    fail(path, "must be an object");
    continue;
  }
  for (const key of tutorialKeys) {
    if (!Object.hasOwn(tutorial, key)) fail(path, `missing ${key}`);
  }
  for (const key of Object.keys(tutorial)) {
    if (!tutorialKeys.includes(key)) fail(path, `unknown property ${key}`);
  }
  if (typeof tutorial.id !== "string" || !idPattern.test(tutorial.id)) {
    fail(`${path}.id`, "must be lowercase words separated by hyphens");
  } else if (tutorialIds.has(tutorial.id)) {
    fail(`${path}.id`, `duplicate id ${tutorial.id}`);
  } else {
    tutorialIds.add(tutorial.id);
  }
  if (typeof tutorial.name !== "string" || tutorial.name.trim() === "") {
    fail(`${path}.name`, "must be a non-empty string");
  }
  if (typeof tutorial.category !== "string" || !categoryIds.has(tutorial.category)) {
    fail(`${path}.category`, "must be a categories id");
  }
  if (typeof tutorial.source !== "string" || tutorial.source.trim() === "") {
    fail(`${path}.source`, "must be a non-empty string");
  }
  if (tutorial.video !== null) {
    if (typeof tutorial.video !== "string" || !/^https:\/\/\S+$/.test(tutorial.video)) {
      fail(`${path}.video`, "must be null or an https URL");
    }
  }
  if (!Array.isArray(tutorial.steps) || tutorial.steps.length === 0) {
    fail(`${path}.steps`, "must be a non-empty array");
  } else {
    for (const [stepIndex, step] of tutorial.steps.entries()) {
      if (typeof step !== "string" || step.trim() === "") {
        fail(`${path}.steps[${stepIndex}]`, "must be a non-empty string");
      }
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

const count = data.tutorials.length;
console.log(`ok: ${count} tutorial${count === 1 ? "" : "s"}`);
