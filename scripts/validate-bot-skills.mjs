import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "../js/markdown.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = join(root, "data/bot-skills.json");
const categoryKeys = ["id", "name"];
const skillKeys = [
  "id",
  "name",
  "description",
  "category",
  "tags",
  "status",
  "date_added",
  "last_updated",
  "source_path",
];
const statuses = new Set(["verified", "draft"]);
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const errors = [];

function fail(path, message) {
  errors.push(`${path}: ${message}`);
}

function norm(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function checkDate(path, value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(path, "must be YYYY-MM-DD");
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    fail(path, "must be a real calendar date");
    return false;
  }
  return true;
}

let data;
try {
  data = JSON.parse(readFileSync(indexPath, "utf8"));
} catch (error) {
  console.error(`data/bot-skills.json is not valid JSON: ${error.message}`);
  process.exit(1);
}

if (data === null || typeof data !== "object" || Array.isArray(data)) {
  fail("data/bot-skills.json", "expected an object with categories and skills");
}

for (const key of ["categories", "skills"]) {
  if (!Array.isArray(data?.[key])) fail(`data/bot-skills.json.${key}`, "expected an array");
}

const presentTop = data && typeof data === "object" && !Array.isArray(data) ? Object.keys(data) : [];
for (const key of presentTop) {
  if (key !== "categories" && key !== "skills") {
    fail("data/bot-skills.json", `unknown property ${key}`);
  }
}

const categoryIds = new Set();
for (const [index, category] of (data?.categories ?? []).entries()) {
  const path = `categories[${index}]`;
  if (category === null || typeof category !== "object" || Array.isArray(category)) {
    fail(path, "must be an object");
    continue;
  }
  const present = Object.keys(category);
  for (const key of categoryKeys) {
    if (!present.includes(key)) fail(path, `missing ${key}`);
  }
  for (const key of present) {
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

const skillIds = new Set();
for (const [index, skill] of (data?.skills ?? []).entries()) {
  const path = `skills[${index}]`;
  if (skill === null || typeof skill !== "object" || Array.isArray(skill)) {
    fail(path, "must be an object");
    continue;
  }
  const present = Object.keys(skill);
  for (const key of skillKeys) {
    if (!present.includes(key)) fail(path, `missing ${key}`);
  }
  for (const key of present) {
    if (!skillKeys.includes(key)) fail(path, `unknown property ${key}`);
  }

  if (typeof skill.id !== "string" || !idPattern.test(skill.id)) {
    fail(`${path}.id`, "must be lowercase words separated by hyphens");
  } else if (skillIds.has(skill.id)) {
    fail(`${path}.id`, `duplicate id ${skill.id}`);
  } else {
    skillIds.add(skill.id);
  }

  if (typeof skill.name !== "string" || skill.name.trim() === "") {
    fail(`${path}.name`, "must be a non-empty string");
  }
  if (typeof skill.description !== "string" || skill.description.trim() === "") {
    fail(`${path}.description`, "must be a non-empty string");
  }
  if (typeof skill.category !== "string" || !categoryIds.has(skill.category)) {
    fail(`${path}.category`, "must be a categories id");
  }
  if (!Array.isArray(skill.tags) || skill.tags.length === 0) {
    fail(`${path}.tags`, "must be a non-empty array");
  } else {
    const seen = new Set();
    for (const [tagIndex, tag] of skill.tags.entries()) {
      if (typeof tag !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag)) {
        fail(`${path}.tags[${tagIndex}]`, "must be a lowercase tag with no spaces");
      } else if (seen.has(tag)) {
        fail(`${path}.tags[${tagIndex}]`, `duplicate tag ${tag}`);
      } else {
        seen.add(tag);
      }
    }
  }
  if (!statuses.has(skill.status)) fail(`${path}.status`, "must be verified or draft");

  const addedOk = checkDate(`${path}.date_added`, skill.date_added);
  const updatedOk = checkDate(`${path}.last_updated`, skill.last_updated);
  if (addedOk && updatedOk && skill.last_updated < skill.date_added) {
    fail(`${path}.last_updated`, "must be on or after date_added");
  }

  const expectedPath = `bot-skills/${skill.id}/SKILL.md`;
  if (skill.source_path !== expectedPath) {
    fail(`${path}.source_path`, `must be ${expectedPath}`);
  } else {
    const absolute = resolve(root, skill.source_path);
    const rel = relative(root, absolute);
    if (rel.startsWith("..") || rel.split(/[/\\]/).includes("..")) {
      fail(`${path}.source_path`, "must stay inside the repository");
    } else if (!existsSync(absolute)) {
      fail(`${path}.source_path`, "file does not exist");
    } else {
      const parsed = parseFrontmatter(readFileSync(absolute, "utf8"));
      if (!parsed.hasFrontmatter) fail(`${path}.source_path`, "missing frontmatter");
      if (parsed.data.__invalid) fail(`${path}.source_path`, "frontmatter has a line that is not a key");
      const frontKeys = Object.keys(parsed.data).filter((key) => key !== "__invalid");
      for (const key of ["name", "description"]) {
        if (!frontKeys.includes(key)) fail(`${path}.source_path`, `frontmatter missing ${key}`);
      }
      for (const key of frontKeys) {
        if (key !== "name" && key !== "description") {
          fail(`${path}.source_path`, `frontmatter has unknown key ${key}`);
        }
      }
      if (typeof skill.name === "string" && norm(parsed.data.name) !== norm(skill.name)) {
        fail(`${path}.name`, "must match frontmatter name");
      }
      if (
        typeof skill.description === "string" &&
        norm(parsed.data.description) !== norm(skill.description)
      ) {
        fail(`${path}.description`, "must match frontmatter description");
      }
      if (norm(parsed.body) === "") fail(`${path}.source_path`, "body is empty");
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

const count = data.skills.length;
console.log(`ok: ${count} skill${count === 1 ? "" : "s"}`);
