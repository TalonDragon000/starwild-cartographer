# Starwild Cartographer

A cartographer's log for [Starwild](https://starwild.io). An AI companion bot plays daily and appends what it saw. The owner reads the log, corrects it, and adds anything the bot missed.

The log is Markdown, a resource CSV, a location GeoJSON file, a hints file, and bot skill files. A static site plots the locations, lists gameplay tips, and lists the bot skills. There is no build step. Open a file in any editor, or view the site locally or on GitHub Pages.

## Purpose

Six worlds circle the star Varda. This log is where surveys of those worlds accumulate: where a trip went, what was gathered, and what is stocked at the public outpost on Eden. Unknowns stay blank. Nothing here is filled in from guesswork.

## How the log is organized

| Path | Holds |
| --- | --- |
| `README.md` | This guide, the legend, and how to add an entry. |
| `data/resources.csv` | Machine-readable resource sightings. One row per sighting. The map does not read this file. |
| `data/locations.geojson` | Map locations. One GeoJSON feature per discovered place. |
| `data/location-schema.json` | Worlds, compass status, categories, icon shapes, and colors. |
| `data/terrain.geojson` | Surveyed ground for the topographic view: surfaces, and later ridges, rivers, lakes, and outcrops. |
| `data/explored.geojson` | Ground V3KTR has traveled. The topographic sheet reveals a buffer around these points and paths. |
| `data/surface-palette.json` | Fill colors for topographic surfaces. This is the only place those colors are set. |
| `data/hints.json` | Gameplay tips. One object per tip. The hints page reads this file. |
| `data/bot-skills.json` | Bot skill index: categories and one object per skill. The skills page reads this file. |
| `data/bot-tutorials.json` | Bot tutorial index: categories and one object per tutorial. The tutorials page reads this file. |
| `data/compass.json` | Compass rose calibration. `calibrated` stays false and `north_offset_deg` stays null until it is measured in game. |
| `js/config.js` | Supabase URL and public anon key. Both stay empty until community points are turned on. |
| `supabase/migrations/0001_points.sql` | `points` and `landmark_sightings` tables, with row-level security. Applied in Supabase, not by the static site. |
| `index.html`, `hints.html`, `skills.html`, `tutorials.html`, `css/`, `js/` | Static site. The map loads Leaflet from a CDN. `js/place.js` turns a bearing and a distance into a display position. Community sign-in loads `supabase-js` from a CDN only when `js/config.js` is filled in. |
| `worlds/` | One Markdown file per known world, plus a template for a world that does not have a file yet. |
| `logs/` | Travel journal. One Markdown file per day. |
| `outpost/eden-outpost.md` | Supply crates at the owner's public outpost on Eden. |
| `scripts/validate-locations.mjs` | Checks `data/locations.geojson` against the schema. |
| `scripts/validate-hints.mjs` | Checks `data/hints.json` against the schema. |
| `scripts/validate-bot-skills.mjs` | Checks `data/bot-skills.json` against the skill files. |
| `scripts/validate-bot-tutorials.mjs` | Checks `data/bot-tutorials.json`. |
| `scripts/validate-compass.mjs` | Checks `data/compass.json`. |
| `scripts/validate-points-sql.mjs` | Checks the community-points migration for its tables, grants, and admin guard. |
| `scripts/validate-terrain.mjs` | Checks `data/terrain.geojson` and `data/surface-palette.json`. |
| `scripts/validate-explored.mjs` | Checks `data/explored.geojson`. |
| `scripts/place.test.mjs` | Checks the bearing-to-position math. |
| `scripts/skills.test.mjs` | Checks skill search, the query string, and that skill Markdown is escaped. |
| `scripts/tutorials.test.mjs` | Checks tutorial search, the query string, and the link from the lag skill. |
| `scripts/contrib.test.mjs` | Checks community point plotting, the uncalibrated compass, and the re-anchor note. |
| `scripts/terrain.test.mjs` | Checks the topographic grid, contours, and surface colors. |
| `scripts/explored.test.mjs` | Checks the explored-ground buffer and the fog readout. |
| `bot-skills/` | One folder per bot skill. Each folder holds `SKILL.md`. See `bot-skills/README.md`. |
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

The pages load their data with `fetch`, so opening an HTML file directly will not show locations, hints, skills, or tutorials. The map starts on Eden. Example points stay hidden until **Show examples** is checked. Those examples are on Maren: a stored anchor, a point computed from a bearing, an approximate fix, and one example grass polygon in the topographic view. The grass polygon is drawn only where that ground is also explored. `?demo=1` reveals a hidden example track across it. That track is not a path that was walked. Helpful Hints, Bot Skills, and Bot Tutorials are linked from the site navigation. Bot Skills is `skills.html`. Bot Tutorials is `tutorials.html`.

With the empty placeholders in `js/config.js`, the map is the static survey only. The community sign-in block stays hidden, and the page does not request Supabase.

The map has two views. **Simple** is the default dark survey plot. **Topographic** is the flat field sheet described below. The choice is stored in this browser. A link can force it with `?view=simple` or `?view=topo`.

## Compass

Starwild has no in-game coordinates and no compass. This log keeps one display plane per world.

North will be derived from the motion of the sun or of Varda as seen on that world. It is not derived yet. `data/location-schema.json` records that on `world_compass.<World>.north_derived`. Set it to `true` only when the derivation has been written down, and put a one-line description in `north_note`.

The compass rose is separate from that flag. `data/compass.json` holds `calibrated` and `north_offset_deg`. Both stay uncalibrated (`false` and `null`) until the offset is measured in game. The info panel says the compass is uncalibrated. The rose is not rotated, and it does not claim a direction. When an offset exists, set `calibrated` to `true` and `north_offset_deg` to degrees clockwise from display up. Do not invent either value.

Bearings are degrees clockwise from that world's north. 0 is north, 90 is east, 180 is south, and 270 is west.

Distances are meters. A nav marker that reads in kilometers is stored in meters, and the original wording is kept in `distance_raw`. `1.5 km` is `1500` meters. An approximate reading keeps the tilde in `distance_raw`, such as `~164 km`.

The display plane is meters from the world's origin anchor. East is +x. North is +y. z is recorded and is not plotted.

A point with a bearing and a distance is drawn at:

```text
x = anchor_x + distance_m * sin(bearing_deg)
y = anchor_y + distance_m * cos(bearing_deg)
```

`x` and `y` in the file are optional explicit meters. Leave them `null` and let the map compute the position. Set them only when the display position was fixed directly. When both are set, `geometry` is a `Point` of `[x, y]`, or `[x, y, z]` when `z` is a number. When either is `null`, `geometry` is `null`. The map still draws the point if a bearing and a distance resolve through an anchor.

`approximate` is `true` when the bearing or the distance is an estimate. The point is still drawn, with a dashed mark.

Nav markers and visible planets stay on the place that saw them. A nav marker is not a separate point until it has its own feature. A distance without a bearing is not plotted.

The Eden origin is `eden-2026-11-15-talons-public-outpost`, Talon's Public Outpost, stored at x 0, y 0. `data/location-schema.json` records that on `origin_anchor.Eden`. Dragons Lair Base remains a base. It is not the origin. The offset from the Lair to the outpost has not been measured, so `offset_from_previous_m` is `null`. Do not invent it.

`offset_from_previous_m` is the previous anchor's east and north in the new frame, `{ "x": east, "y": north }`, or `null` when that position has not been measured. The Lair, and every place logged from it, has `reanchor_pending` true, null `x` and `y`, and no geometry. The info panel lists those places. They are not plotted, and the pending flag is not drawn on the map. After the offset is measured, store it, shift the pending places, and set `reanchor_pending` to false. Only one non-example origin is allowed on a world.

## Map views

**Simple** stays the default. It is the dark plot: category markers, the cyan meter grid, and the display-north arrow. Markers, popups, filters, the category list, search, and the location table behave the same in both views. The page chrome stays Atkinson Hyperlegible for prose and Orbitron, cyan, and gold for the controls.

**Topographic** is a flat military field sheet. It does not shade hills and it does not fake a third dimension.

- The base is muted olive paper. Fog covers ground that has not been traveled. A revealed patch is the paper color until a survey gives it a surface.
- Surveyed polygons in `data/terrain.geojson` are filled from `data/surface-palette.json`, and only inside explored ground. Two round buttons at the lower right of the map open the details, and both start closed. **?** is More info: the field sheet, the north note, and the explored readout. The layers button is the surface key. Each choice is remembered on its own, in `localStorage` under `starwild-cartographer.mapInfo` and `starwild-cartographer.mapLegend`. The scale bar stays on the map.
- Contour lines are seeded, not measured heights. They stay put between loads, and they are drawn only on surveyed polygons that sit inside explored ground. Every fifth line is a heavier index contour. A thin light edge keeps the brown line visible on dark ground. The sheet says: "Fog = unexplored."
- The grid is dark gray. Spacing follows the zoom in the manner of 100 m squares with a heavier line every tenth square, so a 100 m grid has 1 km index lines. Numbers sit on the edges and are display meters.
- A scale bar is labeled in display meters.
- The compass rose follows `data/compass.json`. While `calibrated` is false, the info panel says the compass is uncalibrated and the rose is not labeled as north.

The browser remembers the view in `localStorage` under `starwild-cartographer.mapView`. `?view=simple` and `?view=topo` override that saved choice.

## Terrain

`data/terrain.geojson` is a GeoJSON `FeatureCollection`. The topographic view draws it. The simple view ignores it. Do not invent a surface, ridge, river, lake, or outcrop for a real place. Add a feature only when that ground was surveyed.

The file ships with one example polygon on Maren, `example-maren-grass`. It is hidden until **Show examples** is on. The name and notes include `EXAMPLE`. It is not a surveyed place.

Change a hex value in `data/surface-palette.json` to match an in-game shade. That file is the only color list for these fills. To add a ground type, add an object to `surfaces`, then set `properties.surface` to its `id`. These ids stay in the palette so the legend can name them: `grass`, `forest`, `dirt`, `sand`, `snow`, `rock`, and `water`. A feature whose surface is not in the list is rejected by the checker. The page still has a fallback swatch, labeled "Other surface", for a palette that is newer than the script.

Contours are not stored in the terrain file. The page draws them from a seeded field, and only where a surveyed polygon is inside explored ground.

| Field | Meaning |
| --- | --- |
| `id` | Same string as the feature `id`. Non-empty, no whitespace, unique in the file. |
| `example` | `true` for a sample hidden until **Show examples** is on. `false` for surveyed ground. An example id starts with `example-`, and the name or notes include `EXAMPLE`. |
| `world` | A world name from `data/location-schema.json`. The feature is drawn only while that world is selected. |
| `kind` | `surface`, `lake`, `river`, `ridge`, or `outcrop`. |
| `surface` | A palette id, or `null`. Required for `kind: "surface"`. A lake with `null` is drawn as water. An outcrop with `null` is drawn as rock. Rivers and ridges keep this `null`. |
| `name` | Short name, or `null`. |
| `notes` | What was surveyed, or `null`. |

| `kind` | Geometry |
| --- | --- |
| `surface`, `lake` | `Polygon` or `MultiPolygon`. |
| `river`, `ridge` | `LineString` or `MultiLineString`. |
| `outcrop` | `Point`, `MultiPoint`, `Polygon`, or `MultiPolygon`. |

Coordinates are `[east, north]` in display meters, the same plane as locations. A polygon ring is closed: the first position is repeated at the end. Lines and points are drawn above the surface fills and under the grid. Contours are drawn over the fills, and only inside explored ground.

```sh
node scripts/validate-terrain.mjs
```

## Explored ground

`data/explored.geojson` is a GeoJSON `FeatureCollection`. The topographic view reads it. The simple view ignores it. Fog covers every part of the sheet these features do not reach. Append a feature only when that ground was actually traveled. Do not invent a path.

A visited point reveals a circle. A walked line reveals a strip. A polygon reveals its area. `properties.radius_m` is the buffer in meters. `null` uses `default_radius_m` on the collection. The default in this file is 40. The buffer is how far the sheet clears around the track. It is not a surveyed boundary. Keep it at or under 5000 meters.

The page loads this file on open, again every 60 seconds, and when the tab gains focus. Each request bypasses the cache. The field-sheet block shows the share of the current view that is revealed, and the time of the last successful fetch. When `updated` is set to `YYYY-MM-DD` or an ISO timestamp, that stamp is shown too.

Example features stay hidden. Open the topographic view with `?demo=1` to draw them. That query is for checking the sheet. It is not a record of travel. The example track is on Maren, its notes include `EXAMPLE`, and it stays off the simple view.

The only real feature shipped here is the visit to Dragons Lair Base. Its coordinates are the previous Eden origin, east 0, north 0 in that old frame. `reanchor_pending` is true, so the sheet does not draw it. Talon's Public Outpost is the display origin now, and the offset has not been measured.

| Field | Meaning |
| --- | --- |
| `id` | Same string as the feature `id`. Non-empty, no whitespace, unique in the file. |
| `example` | `true` hides the feature unless the page is opened with `?demo=1`. An example id starts with `example-`, and the notes include `EXAMPLE`. |
| `world` | A world name from `data/location-schema.json`. The feature is used only while that world is selected. |
| `radius_m` | Meters to clear around the geometry, or `null` to use `default_radius_m`. |
| `date` | `YYYY-MM-DD`, or `null`. |
| `source` | Log path, such as `logs/YYYY-MM-DD.md`, for a real track. `null` for an example. The log file has to exist. |
| `notes` | What was walked, or `null`. A feature with `reanchor_pending` true must say that it is not drawn. |
| `reanchor_pending` | `true` when the coordinates are still in a previous origin frame. The sheet skips the feature. `false` for a track in the current display frame. |

Geometry is `Point`, `MultiPoint`, `LineString`, `MultiLineString`, `Polygon`, or `MultiPolygon`. Coordinates are `[east, north]` in display meters. A polygon ring is closed. A hole in a polygon uses the opposite winding from the outer ring.

```sh
node scripts/validate-explored.mjs
```

## How to add a location

The map reads `data/locations.geojson` only. Append one feature to the `features` array after a session when a place should be remembered. Keep the file a single `FeatureCollection`. Do not invent a bearing or a distance. An unknown value is JSON `null`, not `""`, `"unknown"`, or `"n/a"`.

A resource sighting is still a row in `data/resources.csv`. Add a map feature as well when that sighting has a place. The CSV `source` column is `bot` or `owner`. The GeoJSON `source` field is the log file that recorded the place, usually `logs/YYYY-MM-DD.md`. That file has to exist.

Then run:

```sh
node scripts/validate-locations.mjs
node scripts/validate-hints.mjs
node scripts/validate-bot-skills.mjs
node scripts/validate-bot-tutorials.mjs
node scripts/validate-terrain.mjs
node scripts/validate-explored.mjs
node scripts/validate-compass.mjs
node scripts/validate-points-sql.mjs
node --test scripts/place.test.mjs scripts/skills.test.mjs scripts/terrain.test.mjs scripts/explored.test.mjs scripts/contrib.test.mjs scripts/tutorials.test.mjs
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
| `origin` | `true` for the one display origin on that world. Stored at x 0, y 0. An example cannot be an origin. Eden's origin is Talon's Public Outpost. |
| `reanchor_pending` | `true` when this place was logged from a previous origin and the offset has not been applied. `x` and `y` stay null, and the place is not plotted. The info panel lists these places. `false` for a place in the current frame. |
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
    "reanchor_pending": false,
    "anchor": false,
    "anchor_id": "eden-2026-11-15-talons-public-outpost",
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

## Helpful hints

`data/hints.json` is a JSON array. Append one object when a session actually teaches a tip. Do not add a tip from guesswork. An unknown value is not used here: every field is required.

| Field | Meaning |
| --- | --- |
| `id` | Stable id. Non-empty, no whitespace, unique in the file. Suggested form: `first-flight-dismantle-pods`. |
| `category` | A short group name, such as `Performance` or `Etiquette`. The page groups by this text. |
| `tip` | The question or the short tip. |
| `details` | The rest of the tip. Non-empty. |
| `date_added` | The day the tip was added, `YYYY-MM-DD`. |
| `source` | `owner` when the human reported it. `bot` when the companion learned it in play. |

```json
{
  "id": "performance-refresh-tab",
  "category": "Performance",
  "tip": "If the game lags or glitches, refresh the tab.",
  "details": "Shrinking the browser window also helped a lot.",
  "date_added": "2026-11-12",
  "source": "owner"
}
```

The hints page has a search box and category checkboxes. It is `hints.html`.

## Bot skills

`bot-skills/` holds playbooks for the companion bot. Each skill is `bot-skills/<id>/SKILL.md`, with YAML frontmatter (`name`, `description`) and a Markdown body. `data/bot-skills.json` is the index the site reads. Categories are listed in that file, so a later group such as Combat, Mining, Trade, Ships, or Farming is a new entry there, not a change to the page.

A skill is `verified` when the steps have been seen in play, and `draft` while a step is still unchecked. `starwild-climbing-and-bed-spawn` is `draft` because the bed spawn step is not verified yet.

The skills page searches the name, description, tags, and body. Filters and sort are kept in the query string. `skills.html#<id>` opens that skill. A skill may set `tutorial_id` to a tutorial id. The card then links to that tutorial. `null` means the skill has no tutorial. The format and the steps for adding a skill are in `bot-skills/README.md`.

## Bot tutorials

`data/bot-tutorials.json` is the index for `tutorials.html`. Categories are listed in that file. The page searches the name, source, and steps, and filters by category. `tutorials.html#<id>` opens that tutorial.

| Field | Meaning |
| --- | --- |
| `id` | Stable id. Lowercase words separated by hyphens. |
| `name` | Short title. |
| `category` | An id from `categories`. |
| `source` | Where the steps were seen, such as `video by TalonDragon000`. |
| `video` | An `https` URL, or `null` when the link is not available yet. Do not commit a video file. |
| `steps` | The steps that were seen, as an array of strings. |

`lower-graphics-to-reduce-lag` is the first tutorial. Its video link is still null. `starwild-lag-and-browser-handling` points at it.

## Community points

Community points are optional. Leave `supabaseUrl` and `supabaseAnonKey` empty in `js/config.js` and the site keeps using only the static files. The sign-in block stays hidden.

To turn them on:

1. Create a Supabase project.
2. Open the SQL editor and run `supabase/migrations/0001_points.sql`. The file creates `public.points` and `public.landmark_sightings`, enables row-level security, and revokes the default grants before it grants back the ones the site uses.
3. In Authentication, keep email sign-in on. Magic links are the default for `signInWithOtp`. The site uses the implicit flow, so the default magic-link email template works. A signed-in visitor is created on the first link unless you later set `shouldCreateUser` to false.
4. Under Authentication → URL configuration, set the Site URL to `https://talondragon000.github.io/starwild-cartographer/`. Add redirect URLs for that site and for local viewing, including `http://localhost:8080/` and `http://localhost:8080/index.html`. The redirect has to match the page the visitor is on.
5. Copy the project URL and the public anon key, or the publishable key, into `js/config.js`. Never put the service role key or the secret key in that file. The anon key is public. The service role bypasses row-level security and stays off the site.
6. Serve the site with `python3 -m http.server 8080` and open the map. The Community block asks for an email and sends a magic link. After the visitor returns, **Add point** waits for a map click, then a tag, a name, and an optional note. The point is saved for the world selected in the filter, stored as a lowercase planet id (`Eden` is `eden`). It shows on the map immediately.

`points` columns: `id`, `created_at`, `created_by`, `tag`, `name`, `note`, `x`, `y`, `planet`, `status`, `verified_x`, `verified_y`, `verified_at`. `x` is east and `y` is north, in meters from that world's 0,0 anchor. `tag` is one of `poi`, `resource`, `base`, `crash_site`, `creature`, `plant`, `structure`, `landmark`, `other`. `planet` defaults to `eden`. `status` defaults to `unverified`.

Anyone can read points. A signed-in user can insert a row only as themselves. A trigger forces `status` to `unverified` and clears the verified columns for that insert. The public map does not show a verified or unverified badge. A verified or adjusted point is drawn at `verified_x` and `verified_y`. If those are null, it is not drawn. A `not_found` point is hidden. An unverified point is drawn at its submitted `x` and `y`, slightly faded, with no name label on the marker.

An owner may update the name, note, tag, and position of their own row. Changing `status` or the verified columns requires an admin, the service role, or the database owner (`postgres` in the SQL editor). Admin is `app_metadata.role` set to `admin`, not a value in `user_metadata`. After changing it, that person signs out and back in so the session picks up the claim:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where email = 'you@example.com';
```

To record a check, set the measured position. Do not copy the submitted coordinates unless they were actually checked, and do not fill in a guessed meter value. Replace the placeholders below. `adjusted` uses the same three fields when the checked position differs from the submission.

```sql
update public.points
set status = 'verified',
    verified_x = <measured east meters>,
    verified_y = <measured north meters>,
    verified_at = now()
where id = '<point id>';
```

`not_found` clears the verified fields:

```sql
update public.points
set status = 'not_found',
    verified_x = null,
    verified_y = null,
    verified_at = null
where id = '<point id>';
```

`landmark_sightings` is for a later triangulation. It stores the observer's `observer_x` and `observer_y`, the `landmark_point_id`, and optional `bearing_deg`, `distance_m`, `slope_note`, and `ground_type`. Anyone can read a sighting. A signed-in user can insert their own. Bearing and distance stay null until they are measured. The map does not draw sightings yet.

There is no admin screen in this version. Verification is the SQL above, run as an admin session or with the service role.

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
5. For ground that was actually traveled, append a point or a line to `data/explored.geojson`. Leave `radius_m` null to use the file's default buffer. Do not invent a path.
6. For each gameplay tip that was actually learned, append one object to `data/hints.json`.
7. For a bot playbook that was actually learned, add a skill under `bot-skills/` as described in `bot-skills/README.md`.
8. For a setting or control sequence that was actually seen, append one tutorial to `data/bot-tutorials.json`. Leave `video` null until there is a link.
9. When the day changes what is known about a world, write that under the matching heading in `worlds/`. Do not put a guess in a section to make it look finished.
10. When outpost crates change, update the status table in `outpost/eden-outpost.md`.
11. Run `node scripts/validate-locations.mjs`, `node scripts/validate-hints.mjs`, `node scripts/validate-bot-skills.mjs`, `node scripts/validate-bot-tutorials.mjs`, `node scripts/validate-terrain.mjs`, `node scripts/validate-explored.mjs`, `node scripts/validate-compass.mjs`, `node scripts/validate-points-sql.mjs`, and `node --test scripts/place.test.mjs scripts/skills.test.mjs scripts/terrain.test.mjs scripts/explored.test.mjs scripts/contrib.test.mjs scripts/tutorials.test.mjs`.
12. Commit with a [Conventional Commit](https://www.conventionalcommits.org/) message, for example `docs: log 2026-11-12 eden survey`.

The bot appends. The owner can edit any file the bot touched.

## Legend

### Worlds

| Name | What is known |
| --- | --- |
| Eden | Home world. Forests, iron, landing grounds. Talon's Public Outpost is the display origin. Dragons Lair Base, logged 2026-11-12, is a base. Its offset from the outpost has not been measured. |
| Hush | Eden's airless moon. Silica. Starfall was seen on 2026-11-12 at about 164 km. Bearing unknown. |
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
