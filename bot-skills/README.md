# Bot skills

Playbooks a Starwild companion bot can follow. Each skill is one folder with a `SKILL.md` file. Other bots and agents read that file directly. The site lists the same files on `skills.html`.

## File format

Create `bot-skills/<id>/SKILL.md`.

`<id>` is lowercase words separated by hyphens, with no spaces. Use the same id in `data/bot-skills.json`.

`SKILL.md` starts with YAML frontmatter, then a Markdown body:

```markdown
---
name: Short name
description: >-
  When to use this skill, in one paragraph.
---

# Short name

Steps the bot should follow. Write only what was seen or reported.
```

Frontmatter keys:

| Key | Meaning |
| --- | --- |
| `name` | Short name. Same text as `name` in the index. |
| `description` | When to use the skill. Same text as `description` in the index. |

`description` may use a folded scalar (`>-`). Folded lines become one paragraph. Do not add other frontmatter keys.

The body is Markdown: headings, lists, bold, and code. The skills page escapes HTML in that body before it shows it. Do not put a step in the file that was not seen or reported.

## Index

`data/bot-skills.json` has two arrays.

`categories` is the filter list on the skills page, in display order. A category object has `id` and `name`. Add a category here when a skill needs a new group. The page does not hard-code the groups. Later groups can include Combat, Mining, Trade, Ships, and Farming.

`skills` is one object per skill. Every key below is required.

| Field | Meaning |
| --- | --- |
| `id` | Folder name under `bot-skills/`. |
| `name` | Same as frontmatter `name`. |
| `description` | Same as frontmatter `description`. |
| `category` | An id from `categories`. |
| `tags` | Search words, lowercase, with no spaces inside a tag. |
| `status` | `verified` or `draft`. Use `draft` while any step is still unchecked. Use `verified` when the steps have been seen in play. |
| `date_added` | Day the skill was added, `YYYY-MM-DD`. |
| `last_updated` | Day the skill last changed, `YYYY-MM-DD`. |
| `source_path` | `bot-skills/<id>/SKILL.md`, from the repository root. |

`starwild-climbing-and-bed-spawn` is `draft` because the bed spawn step is not verified yet. The climbing steps stay in the same file.

## How to add a skill

1. Add a folder `bot-skills/<id>/` and a `SKILL.md` in the format above.
2. If the group is new, append it to `categories`. Keep `id` stable. The display name can be a phrase such as `Combat` or `Ships`.
3. Append a skill object. Set `status` to `draft` until the steps have been seen in play. Set `verified` when they have.
4. From the repository root, run `node scripts/validate-bot-skills.mjs`.

## Skills page

`skills.html` loads the index, then fetches each `SKILL.md`. Search covers the name, the description, the tags, and the body. Category chips, the status control, and the sort control are written to the query string:

| Parameter | Values |
| --- | --- |
| `q` | Search text. |
| `category` | A category id. Repeat the parameter to choose more than one. `none` selects nothing. Leave it off to show every category. |
| `status` | `verified` or `draft`. Leave it off to show both. |
| `sort` | `updated` for recently updated. Leave it off for A–Z. |

`skills.html#<id>` opens that skill. A shared link that would hide the skill relaxes only the filters that hide it, so the skill is on screen.
