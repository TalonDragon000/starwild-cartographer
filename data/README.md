# Map data

Coordinates in the Eden files are metres from Talon's Public Outpost. `x` is true east and `y` is true north. North is the sun-referenced estimate, about plus or minus 15 degrees.

Do not add, name, or place another player's base. Record your own places and neutral NPCs only.

## Add an aerial footprint

A new aerial shot does not need a code change. Edit data files, then run the validators in the main README.

1. Reveal the ground the shot covers. Append one feature to `data/eden/coverage.geojson`. Copy the shape below. Replace the id, the ring, and the notes. The ring is `[east, north]` pairs. Repeat the first pair at the end. Run the outer ring counter-clockwise. A hole, if you need one, is a later ring wound the other way.

```json
{
  "type": "Feature",
  "id": "eden-YYYY-MM-DD-short-name",
  "geometry": {
    "type": "Polygon",
    "coordinates": [
      [
        [0, 0],
        [100, 0],
        [100, 80],
        [0, 80],
        [0, 0]
      ]
    ]
  },
  "properties": {
    "id": "eden-YYYY-MM-DD-short-name",
    "world": "Eden",
    "kind": "revealed",
    "source": "logs/YYYY-MM-DD.md",
    "date": "YYYY-MM-DD",
    "notes": "Footprint of the aerial shot. What ground it covers."
  }
}
```

`kind` must be `revealed`. The survey fog clears every revealed polygon for the world that is on screen and leaves the rest fogged. Set `updated` on the collection to the day you edited it.

2. Add ground cover the shot actually showed. Append a polygon to `data/terrain.geojson` using the fields already in that file. The topographic sheet draws it only where explored ground and this polygon overlap. Do not invent a surface.

3. Add a place the shot actually showed. Append a feature to `data/locations.geojson` using the location schema in the main README. Leave the bearing or the distance null when it was not measured.

`data/eden/poi-estimate.json` is the relief plate's own public points and its `extent`. `extent.image` is the full picture, including the title and the legend, and it is what the Topography layer uses. `extent.axes` is the plot window. Do not move those corners unless the picture itself changes. New places from a later shot belong in `data/locations.geojson`, not in the plate file.

The seeded revealed polygon outlines the non-hatched part of `data/eden-lair-relief-estimate.png`. The hatched area on that plate was not in the ground views.
