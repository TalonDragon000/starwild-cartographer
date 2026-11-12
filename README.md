# Starwild Cartographer

A cartographer's log for [Starwild](https://starwild.io). An AI companion bot plays daily and appends what it saw. The owner reads the log, corrects it, and adds anything the bot missed.

The log is Markdown, a resource CSV, and a location GeoJSON file. A static map in this repository plots those locations on a compass we keep ourselves, because the game has no coordinates. There is no build step. Open a file in any editor, or view the map locally or on GitHub Pages.

## Purpose

Six worlds circle the star Varda. This log is where surveys of those worlds accumulate: where a trip went, what was gathered, and what is stocked at the public outpost on Eden. Unknowns stay blank. Nothing here is filled in from guesswork.

## How the log is organized

| Path | Holds |
| --- | --- |
| `README.md` | This guide, the legend, and how to add an entry. |
| `data/resources.csv` | Machine-readable resource sightings. One row per sighting. The map does not read this file. |
| `data/locations.geojson` | Map locations. One GeoJSON feature per discovered place. |
| `data/location-schema.json` | Worlds, compass status, categories, icon shapes, and colors. |
| `index.html`, `css/`, `js/` | Static map. Leaflet is loaded from a CDN. `js/place.js` turns a bearing and a distance into a display position. |
| `worlds/` | One Markdown file per known world, plus a template for a world that does not have a file yet. |
| `logs/` | Travel journal. One Markdown file per day. |
| `outpost/eden-outpost.md` | Supply crates at the owner's public outpost on Eden. |
| `scripts/validate-locations.mjs` | Checks `data/locations.geojson` against the schema. |
| `scripts/place.test.mjs` | Checks the bearing-to-position math. |
| `.github/workflows/pages.yml` | Publishes this repository to GitHub Pages. |

Named worlds:

- **Eden** — home world. Forests, iron, and landing grounds. The owner runs a public outpost here.
- **Hush** — Eden's airless moon. Silica.
- **Vesper** — named, and not yet written up.
- **Maren** — named, and not yet written up.
- **Talus** — named, and not yet written up.
- **Thorne** — named, and not yet written up.

## How to view the map locally

From the repository root:

```sh
python3 -m http.server 8080
```

Open <http://localhost:8080/>.

The page loads `data/locations.geojson` with `fetch`, so opening `index.html` as a file will not show locations. The map starts on Eden. Example points stay hidden until **Show examples** is checked. Those examples are on Maren: a stored anchor, a point computed from a bearing, and an approximate fix.

## Compass

Starwild has no in-game coordinates and no compass. This log keeps one display plane per world.

North will be derived from the motion of the sun or of Varda as seen on that world. It is not derived yet. `data/location-schema.json` records that on `world_compass.<World>.north_derived`. Set it to `true` only when the derivation has been written down, and put a one-line description in `north_note`.

Bearings are degrees clockwise from that world's north. 0 is north, 90 is east, 180 is south, and 270 is west.

Distances are meters. A nav marker that reads in kilometers is stored in meters, and the original wording is kept in `distance_raw`. `164.4 km` is `164400` meters.

The display plane is meters from the world's origin anchor. East is +x. North is +y. z is recorded and is not plotted.

A point with a bearing and a distance is drawn at:

```text
x = anchor_x + distance_m * sin(bearing_deg)
y = anchor_y + distance_m * cos(bearing_deg)
```

`x` and `y` in the file are optional explicit meters. Leave them `null` and let the map compute the position. Set them only when the display position was fixed directly. When both are set, `geometry` is a `Point` of `[x, y]`, or `[x, y, z]` when `z` is a number. When either is `null`, `geometry` is `null`. The map still draws the point if a bearing and a distance resolve through an anchor.

`approximate` is `true` when the bearing or the distance is an estimate. The point is still drawn, with a dashed mark.

Nav markers and visible planets stay on the place that saw them. A nav marker is not a separate point until it has its own feature. A distance without a bearing is not plotted.

The Eden origin, until the Eden Outpost is logged, is `eden-2026-11-12-v3ktr-first-spawn`. It is stored at x 0, y 0. The planet is not confirmed, so `world_unconfirmed` is `true`.

## How to add a location

The map reads `data/locations.geojson` only. Append one feature to the `features` array after a session when a place should be remembered. Keep the file a single `FeatureCollection`. Do not invent a bearing or a distance. An unknown value is JSON `null`, not `""`, `"unknown"`, or `"n/a"`.

A resource sighting is still a row in `data/resources.csv`. Add a map feature as well when that sighting has a place. The CSV `source` column is `bot` or `owner`. The GeoJSON `source` field is the log file that recorded the place, usually `logs/YYYY-MM-DD.md`. That file has to exist.

Then run:

```sh
node scripts/validate-locations.mjs
node --test scripts/place.test.mjs
```

The same checks run in GitHub Actions.

### Location schema

Each feature is a GeoJSON `Feature`. `id` on the feature and `properties.id` are the same string. Suggested form: `eden-2026-11-12-short-name`. Example ids start with `example-`. Always include every key below.

| Field | Meaning |
| --- | --- |
| `id` | Stable id. Non-empty, no whitespace, unique in the file. |
| `example` | `true` for a sample point used to preview the map. `false` for a real place. The map hides `true` until **Show examples** is on. |
| `approximate` | `true` when the bearing or distance is an estimate. `false` when it was measured, or when there is no fix yet. |
| `date_discovered` | `YYYY-MM-DD`, or `null` when the day is not known. |
| `world` | `Eden`, `Hush`, `Vesper`, `Maren`, `Talus`, or `Thorne`. |
| `world_unconfirmed` | `true` when the place is filed under that world but the planet was not confirmed. |
| `region` | Region or landmark name, or `null`. |
| `origin` | `true` for the one display origin on that world. Stored at x 0, y 0. An example cannot be an origin. Eden's origin stays the V3KTR spawn until the outpost is logged. |
| `anchor` | `true` when other places may name this feature in `anchor_id`. An origin is an anchor. |
| `anchor_id` | Id of the reference place on the same world, or `null` for an origin or a point that is not relative to anything. A real place cannot use an example as its anchor. |
| `bearing_deg` | Degrees clockwise from derived north, from 0 up to but not including 360, or `null`. |
| `distance_m` | Meters from the anchor, or `null`. |
| `x`, `y` | Optional explicit meters on the display plane. Both numbers, or both `null`. |
| `z` | Optional height in meters, or `null`. Not plotted. |
| `coordinates_raw` | Free text that does not fit the fields above, or `null`. |
| `category` | One of the ids in the category table below. |
| `subtype` | A shorter kind, such as `iron ore`, `Hyperlite`, or `berry bush`. `null` when not known. |
| `quantity_notes` | Amount and a short note, or `null`. |
| `nav_markers` | `null`, or an array of nav-marker objects. A marker is not plotted from this array. |
| `planet_sightings` | Visible planets, as a note, or `null`. |
| `source` | Path of the log entry, such as `logs/2026-11-12.md`. |

A nav marker object has `name`, `distance_m`, `distance_raw`, and `bearing_deg`. Use `null` for an unknown distance or bearing. Keep the original reading in `distance_raw`, for example `523 m` or `164.4 km`.

`data/location-schema.json` lists the worlds, whether north has been derived, and the category icons. Adding a place does not require editing that file. Changing a world's compass status does.

### Categories

| `category` | What it is for |
| --- | --- |
| `ores` | Ores and minerals, including iron, silica, and Hyperlite. |
| `crash-sites` | Crash sites and travel pods. |
| `plants` | Plants and food: vegetables, berries, and trees. |
| `creatures` | Creatures. |
| `structures` | Man-made buildings, landmarks, and other bases. |
| `outposts` | Our outposts, including the Eden Outpost. |
| `spawns` | Spawn and landing sites. |
| `other` | A place that does not fit the categories above. |

### Example feature

Real points use `"example": false`. The file already contains the Eden spawn and three Maren features with `"example": true`. Leave the examples in place. Their notes include the word `EXAMPLE`.

This is the shape of a new place that is not the origin. It is not itself a feature in the data file. Replace the placeholders. Leave `bearing_deg` and `distance_m` null until both were actually taken. `geometry` stays `null` while `x` and `y` are null.

```json
{
  "type": "Feature",
  "id": "eden-YYYY-MM-DD-short-name",
  "geometry": null,
  "properties": {
    "id": "eden-YYYY-MM-DD-short-name",
    "example": false,
    "approximate": false,
    "date_discovered": "YYYY-MM-DD",
    "world": "Eden",
    "world_unconfirmed": false,
    "region": "Landmark name",
    "origin": false,
    "anchor": false,
    "anchor_id": "eden-2026-11-12-v3ktr-first-spawn",
    "bearing_deg": null,
    "distance_m": null,
    "x": null,
    "y": null,
    "z": null,
    "coordinates_raw": null,
    "category": "other",
    "subtype": null,
    "quantity_notes": null,
    "nav_markers": null,
    "planet_sightings": null,
    "source": "logs/YYYY-MM-DD.md"
  }
}
```

## GitHub Pages

`.github/workflows/pages.yml` deploys the repository on each push to `main`. GitHub still needs one setting, once, from a repository admin:

1. Merge this workflow to `main`.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.

The site is published at <https://talondragon000.github.io/starwild-cartographer/>.

If the push to `main` happened before that source was selected, open the **Actions** tab, choose **Pages**, and run the workflow. The first deployment may ask an admin to approve the `github-pages` environment.

## How to add an entry

1. Copy `logs/YYYY-MM-DD.md` to `logs/` with the real date in the name, for example `logs/2026-11-12.md`.
2. Fill that day's sections: where you went, what you gathered, coordinates, what was new, and the Eden Outpost supply levels. Leave a section empty when you do not know.
3. For each resource actually seen, append one row to `data/resources.csv`. Leave `coordinates` empty when you do not have them. Set `source` to `bot` or `owner`.
4. For each place that should appear on the map, append one feature to `data/locations.geojson` as described above. Set `source` to that day's log path.
5. When the day changes what is known about a world, write that under the matching heading in `worlds/`. Do not put a guess in a section to make it look finished.
6. When outpost crates change, update the status table in `outpost/eden-outpost.md`.
7. Run `node scripts/validate-locations.mjs` and `node --test scripts/place.test.mjs`.
8. Commit with a [Conventional Commit](https://www.conventionalcommits.org/) message, for example `docs: log 2026-11-12 eden survey`.

The bot appends. The owner can edit any file the bot touched.

## Legend

### Worlds

| Name | What is known |
| --- | --- |
| Eden | Home world. Forests, iron, landing grounds. Public outpost. V3KTR first spawn, logged 2026-11-12, is the display origin until the outpost is logged. The planet of that spawn is not confirmed. |
| Hush | Eden's airless moon. Silica. |
| Vesper | Named. No survey yet. |
| Maren | Named. No survey yet. |
| Talus | Named. No survey yet. |
| Thorne | Named. No survey yet. |

### Resources

Names seen so far. This list is not a map, and it does not say where a resource can be gathered.

| Name | Note |
| --- | --- |
| Wood | |
| Ore / iron | Iron is known on Eden. In the CSV, use the word that was seen: `ore` or `iron`. |
| Hyperlite | Refined into fuel. On the map, a Hyperlite find is category `ores` and subtype `Hyperlite`. |
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
| `coordinates` | Empty. The game has no coordinates. A place goes in `data/locations.geojson`. |
| `resource` | Resource name. |
| `quantity_notes` | Amount and a short note. Empty if not known. |
| `source` | `bot` when the companion wrote the row. `owner` when the human did. |

### Sources

| Value | Who wrote it |
| --- | --- |
| `bot` | The AI companion, after a daily session. Used in `data/resources.csv`. |
| `owner` | The human owner. Used in `data/resources.csv`. |

On the map, `source` is a file path, not one of these two words.

### Outpost goal

One maxed crate each of Hyperlite, power cores, and fuel at the Eden Outpost. Current levels live only in `outpost/eden-outpost.md`.

## Conduct

We never take items from unowned bases that lost core protection.

Made with ❤️ by TalonDragonStudios
