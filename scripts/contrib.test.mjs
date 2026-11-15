import assert from "node:assert/strict";
import test from "node:test";
import { reanchorCopy } from "../js/anchor.js";
import { compassPanelText, compassRose, compassSheetLabel, readCompass } from "../js/compass.js";
import { contribConfigured, magicLinkRedirect, supabaseAnonKey, supabaseUrl } from "../js/config.js";
import {
  POINT_TAGS,
  communityVisible,
  planetMatches,
  pointPlot,
  pointPopupRows,
} from "../js/contrib.js";

test("the shipped config is the public anon key and the pages redirect", () => {
  assert.equal(supabaseUrl, "https://avwbewbeyklpysfndxub.supabase.co");
  assert.equal(magicLinkRedirect, "https://talondragon000.github.io/starwild-cartographer/");
  const payload = JSON.parse(Buffer.from(supabaseAnonKey.split(".")[1], "base64url").toString());
  assert.equal(payload.role, "anon");
  assert.equal(payload.ref, "avwbewbeyklpysfndxub");
  assert.equal(contribConfigured(), true);
  assert.equal(contribConfigured("", ""), false);
  assert.equal(contribConfigured("https://example.supabase.co", "  "), false);
});

test("an uncalibrated compass claims no direction", () => {
  const compass = readCompass({ calibrated: false, north_offset_deg: null });
  assert.equal(compass.calibrated, false);
  assert.equal(compass.northOffsetDeg, null);
  assert.equal(compassSheetLabel(compass), "Uncalibrated");
  assert.deepEqual(compassRose(compass), { label: "", rotateDeg: null });
  const text = compassPanelText(compass, "Eden", false, null);
  assert.match(text, /uncalibrated/i);
  assert.doesNotMatch(text, /\bN\b/);
  assert.equal(readCompass({ calibrated: true, north_offset_deg: null }).calibrated, false);
  assert.equal(readCompass(null).calibrated, false);
});

test("a calibrated compass uses only the stored offset", () => {
  const compass = readCompass({ calibrated: true, north_offset_deg: 12 });
  assert.equal(compass.calibrated, true);
  assert.equal(compass.northOffsetDeg, 12);
  assert.equal(compassSheetLabel(compass), "Calibrated");
  assert.deepEqual(compassRose(compass), { label: "N", rotateDeg: 12 });
  assert.match(compassPanelText(compass, "Eden", false, null), /12°/);
});

test("re-anchor copy lists pending places and does not invent an offset", () => {
  const anchor = {
    name: "Talon's Public Outpost",
    offset_from_previous_m: null,
  };
  const pending = [
    { properties: { region: "Dragons Lair Base" } },
    { properties: { region: "V3KTR first spawn" } },
  ];
  const text = reanchorCopy(anchor, pending, true);
  assert.match(text, /Re-anchor pending/);
  assert.match(text, /Talon's Public Outpost is the 0,0 anchor/);
  assert.match(text, /has not been measured/);
  assert.match(text, /Dragons Lair Base, V3KTR first spawn/);
  assert.match(text, /not drawn/);
  assert.equal(reanchorCopy(anchor, [], false), "");
  const measured = reanchorCopy({ name: "Talon's Public Outpost", offset_from_previous_m: { x: -20, y: 5 } }, pending, false);
  assert.match(measured, /20 m west, 5 m north/);
});

test("community points plot without a public verification badge", () => {
  assert.equal(pointPlot({ status: "not_found", x: 1, y: 2 }), null);
  assert.equal(pointPlot({ status: "verified", x: 1, y: 2, verified_x: null, verified_y: null }), null);
  assert.deepEqual(pointPlot({ status: "unverified", x: 4, y: 5 }), {
    x: 4,
    y: 5,
    faded: true,
    labeled: false,
  });
  assert.deepEqual(pointPlot({ status: "adjusted", x: 1, y: 2, verified_x: 8, verified_y: 9 }), {
    x: 8,
    y: 9,
    faded: false,
    labeled: true,
  });
  assert.equal(pointPlot({ status: "mystery", x: 1, y: 2 }), null);

  const rows = pointPopupRows(
    { name: "Berry", note: "red", status: "unverified" },
    { label: "Plant" },
    { x: 3, y: 4 },
  );
  const flat = rows.flat().join(" ");
  assert.match(flat, /Plant/);
  assert.match(flat, /red/);
  assert.doesNotMatch(flat, /unverified|verified|not_found|adjusted/i);

  const categories = new Set(["plants", "other"]);
  const visible = communityVisible(
    [
      { name: "Berry", note: "", tag: "plant", planet: "eden", status: "unverified", x: 1, y: 2 },
      { name: "Gone", tag: "poi", planet: "eden", status: "not_found", x: 3, y: 4 },
      { name: "Hush rock", tag: "landmark", planet: "hush", status: "unverified", x: 5, y: 6 },
    ],
    { world: "Eden", query: "berry", categories },
  );
  assert.equal(visible.length, 1);
  assert.equal(visible[0].point.name, "Berry");
  assert.equal(planetMatches("Eden", "eden"), true);
  assert.equal(POINT_TAGS.some((tag) => tag.id === "crash_site"), true);
});
