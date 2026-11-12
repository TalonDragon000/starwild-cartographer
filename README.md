# Starwild Cartographer

A cartographer's log for [Starwild](https://starwild.io). An AI companion bot plays daily and appends what it saw. The owner reads the log, corrects it, and adds anything the bot missed.

The repository is plain Markdown plus one CSV table. There is no app and no build step. Open a file in any editor, or read it on the web.

## Purpose

Six worlds circle the star Varda. This log is where surveys of those worlds accumulate: where a trip went, what was gathered, and what is stocked at the public outpost on Eden. Unknowns stay blank. Nothing here is filled in from guesswork.

## How the log is organized

| Path | Holds |
| --- | --- |
| `README.md` | This guide, the legend, and how to add an entry. |
| `data/resources.csv` | Machine-readable resource sightings. One row per sighting. |
| `worlds/` | One Markdown file per known world, plus a template for a world that does not have a file yet. |
| `logs/` | Travel journal. One Markdown file per day. |
| `outpost/eden-outpost.md` | Supply crates at the owner's public outpost on Eden. |

Named worlds so far:

- **Eden** — home world. Forests, iron, and landing grounds. The owner runs a public outpost here.
- **Hush** — Eden's airless moon. Silica.
- **Vesper** — named, and not yet written up.

Three further worlds circle Varda and are not documented. Copy `worlds/_template.md` when one of them gets a name.

## How to add an entry

1. Copy `logs/YYYY-MM-DD.md` to `logs/` with the real date in the name, for example `logs/2026-11-12.md`.
2. Fill that day's sections: where you went, what you gathered, coordinates, what was new, and the Eden Outpost supply levels. Leave a section empty when you do not know.
3. For each resource actually seen, append one row to `data/resources.csv`. Leave `coordinates` empty when you do not have them. Set `source` to `bot` or `owner`.
4. When the day changes what is known about a world, write that under the matching heading in `worlds/`. Do not put a guess in a section to make it look finished.
5. When outpost crates change, update the status table in `outpost/eden-outpost.md`.
6. Commit with a [Conventional Commit](https://www.conventionalcommits.org/) message, for example `docs: log 2026-11-12 eden survey`.

The bot appends. The owner can edit any file the bot touched.

## Legend

### Worlds

| Name | What is known |
| --- | --- |
| Eden | Home world. Forests, iron, landing grounds. Public outpost. |
| Hush | Eden's airless moon. Silica. |
| Vesper | Named. No survey yet. |
| Three unnamed | Circle Varda. Not yet documented. |

### Resources

Names seen so far. This list is not a map, and it does not say where a resource can be gathered.

| Name | Note |
| --- | --- |
| Wood | |
| Ore / iron | Iron is known on Eden. In the CSV, use the word that was seen: `ore` or `iron`. |
| Hyperlite | Refined into fuel. |
| Power cores | |
| Silica | Associated with Hush. |
| Fuel | Refined from Hyperlite. Tracked at the outpost as fuel crates. |

### Resource table

`data/resources.csv` is UTF-8, comma-separated, with a header row and no data rows until a real sighting is logged. A field that contains a comma or a double quote must be wrapped in double quotes. An unknown field is left empty. Do not write `unknown`, `n/a`, or a guessed coordinate.

| Column | Meaning |
| --- | --- |
| `date` | Day of the sighting, `YYYY-MM-DD`. |
| `world` | World name, such as `Eden`. |
| `region_or_landmark` | Region or landmark. Empty if not known. |
| `coordinates` | Empty if not known. No coordinate format is fixed until one is confirmed in game. |
| `resource` | Resource name. |
| `quantity_notes` | Amount and a short note. Empty if not known. |
| `source` | `bot` when the companion wrote the row. `owner` when the human did. |

### Sources

| Value | Who wrote it |
| --- | --- |
| `bot` | The AI companion, after a daily session. |
| `owner` | The human owner. |

### Outpost goal

One maxed crate each of Hyperlite, power cores, and fuel at the Eden Outpost. Current levels live only in `outpost/eden-outpost.md`.

## Conduct

We never take items from unowned bases that lost core protection.

Made with ❤️ by TalonDragonStudios
