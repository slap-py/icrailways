import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sectionMatches,
  effectiveSections,
  emptyProject,
  expansionError,
  replaceSection,
  removeExpansion,
} from "./construction";
import {
  trackAffectedBuildings,
  affectedBuildings,
  blockedRoads,
  envelope,
  junctionLinks,
  stationOnSections,
  stationEnvelope,
} from "./geometry";
import { buildingEstimate, trackCost } from "./cost";
import { lineString, length, polygon, destination } from "@turf/turf";
import type { Corridor, Building, Station } from "./types";
const selected = { corridorId: "c", start: 0, end: 1000 };
test("partial overwrite splits infrastructure and preserves speed outside the selected section", () => {
  let p = replaceSection(emptyProject("n"), selected, 2, 160);
  p = replaceSection(p, { ...selected, start: 200, end: 600 }, 4, 250);
  const s = effectiveSections(p).sort((a, b) => a.start - b.start);
  assert.deepEqual(
    s.map((x) => [x.start, x.end, x.tracks, x.maxSpeedKph]),
    [
      [0, 200, 2, 160],
      [200, 600, 4, 250],
      [600, 1000, 2, 160],
    ],
  );
  p = replaceSection(p, { ...selected, start: 300, end: 500 }, 1, 80);
  assert.equal(effectiveSections(p).find((s) => s.start === 300)?.tracks, 1);
});
test("passing and overtaking sections require continuous correct base track", () => {
  let p = replaceSection(emptyProject("n"), selected, 1, 120);
  assert.equal(expansionError(p, selected, "passing"), "");
  assert.ok(expansionError(p, selected, "overtaking"));
  p = replaceSection(p, { ...selected, start: 400, end: 600 }, 0, 120);
  assert.ok(expansionError(p, selected, "passing"));
});
test("expansions add tracks locally; overwrite and deletion clip expansions", () => {
  let p = replaceSection(emptyProject("n"), selected, 2, 160);
  p.expansions.push({
    ...selected,
    id: "e",
    start: 100,
    end: 900,
    addedTracks: 2,
    type: "overtaking",
  });
  assert.deepEqual(
    effectiveSections(p).map((s) => s.tracks),
    [2, 4, 2],
  );
  p = replaceSection(p, { ...selected, start: 300, end: 700 }, 1, 100);
  assert.deepEqual(
    p.expansions.map((e) => [e.start, e.end]),
    [
      [100, 300],
      [700, 900],
    ],
  );
  p = removeExpansion(p, { ...selected, start: 0, end: 1000 });
  assert.equal(p.expansions.length, 0);
});
const geometry = lineString([
  [15, 59],
  [15.02, 59],
]).geometry;
const corridor: Corridor = {
  id: "c",
  name: "Test",
  geometry,
  length: length(lineString(geometry.coordinates), { units: "meters" }),
  osmWayIds: [],
};
const center = [15.01, 59];
function rectangle(offset: number) {
  const p = destination(center, offset, 0, { units: "meters" }).geometry
    .coordinates;
  const corners = [
    [-2, -2],
    [2, -2],
    [2, 2],
    [-2, 2],
    [-2, -2],
  ].map(([x, y]) => [p[0] + x / 57000, p[1] + y / 111000]);
  return polygon([corners]).geometry;
}
const building: Building = {
  id: "b",
  geometry: rectangle(10),
  ...buildingEstimate({ building: "house" }, 16),
};
test("widening intersects footprints; narrowing clears highlights; demolished properties are excluded", () => {
  assert.equal(
    affectedBuildings(envelope(corridor, 0, corridor.length, 8), [building], [])
      .length,
    0,
  );
  assert.equal(
    affectedBuildings(
      envelope(corridor, 0, corridor.length, 26),
      [building],
      [],
    ).length,
    1,
  );
  assert.equal(
    affectedBuildings(
      envelope(corridor, 0, corridor.length, 26),
      [building],
      ["b"],
    ).length,
    0,
  );
});
test("station roads block both longitudinal and lateral expansion", () => {
  const station: Station = {
    id: "s",
    name: "Test",
    coordinates: center,
    corridorId: "c",
    position: corridor.length / 2,
    lengthMeters: 100,
    platforms: 1,
  };
  const east = destination(center, 125, 90, { units: "meters" }).geometry
    .coordinates;
  const road = {
    id: "r",
    name: "Road",
    highway: "residential",
    geometry: lineString([
      [east[0], 58.999],
      [east[0], 59.001],
    ]).geometry,
  };
  assert.equal(
    blockedRoads(stationEnvelope(corridor, station, 100, 1), [road]).length,
    0,
  );
  assert.equal(
    blockedRoads(stationEnvelope(corridor, station, 300, 1), [road]).length,
    1,
  );
  const north = destination(center, 20, 0, { units: "meters" }).geometry
    .coordinates;
  const side = {
    ...road,
    geometry: lineString([
      [14.999, north[1]],
      [15.021, north[1]],
    ]).geometry,
  };
  assert.equal(
    blockedRoads(stationEnvelope(corridor, station, 100, 1), [side]).length,
    0,
  );
  assert.equal(
    blockedRoads(stationEnvelope(corridor, station, 100, 6), [side]).length,
    1,
  );
});
test("costs increase with track count and speed and building level fallbacks work", () => {
  assert.ok(trackCost(1000, 4, 320) > trackCost(1000, 2, 160));
  assert.ok(trackCost(1000, 2, 160) > trackCost(1000, 2, 120));
  assert.equal(buildingEstimate({ building: "office" }, 100).levels, 3);
  assert.equal(
    buildingEstimate({ building: "house", height: "15" }, 100).levels,
    5,
  );
  assert.equal(
    buildingEstimate(
      { building: "house", "building:levels": "2", height: "15" },
      100,
    ).estimatedCost,
    300000,
  );
});

test("indexed track impacts detect widening and exclude previously acquired buildings", () => {
  assert.equal(
    trackAffectedBuildings(corridor, 0, corridor.length, 8, [building], [])
      .length,
    0,
  );
  assert.equal(
    trackAffectedBuildings(corridor, 0, corridor.length, 26, [building], [])
      .length,
    1,
  );
  assert.equal(
    trackAffectedBuildings(corridor, 0, corridor.length, 26, [building], ["b"])
      .length,
    0,
  );
  const crossing = { ...building, geometry: rectangle(0) };
  assert.equal(
    trackAffectedBuildings(corridor, 0, corridor.length, 8, [crossing], [])
      .length,
    1,
  );
});
test("identical settings cannot charge for duplicate work, but gaps and speed changes are edits", () => {
  const p = replaceSection(emptyProject("n"), selected, 2, 160);
  assert.equal(sectionMatches(effectiveSections(p), selected, 2, 160), true);
  assert.equal(sectionMatches(effectiveSections(p), selected, 2, 200), false);
  assert.equal(
    sectionMatches(effectiveSections(p), { ...selected, end: 1100 }, 2, 160),
    false,
  );
});

test("construction applies every part of a routed selection", () => {
  const route: import("./types").Selection = {
    corridorId: "a",
    start: 0,
    end: 100,
    parts: [
      { corridorId: "a", start: 0, end: 100 },
      { corridorId: "b", start: 50, end: 250 },
    ],
  };
  const project = replaceSection(emptyProject("n"), route, 2, 160);
  assert.deepEqual(
    project.sections.map((section) => [
      section.corridorId,
      section.start,
      section.end,
    ]),
    [
      ["a", 0, 100],
      ["b", 50, 250],
    ],
  );
});

test("stations appear near built or preview sections on adjacent OSM track chains", () => {
  const station: Station = {
    id: "nearby",
    name: "Nearby",
    coordinates: [15.01, 59.0002],
    corridorId: "parallel",
    position: 500,
    lengthMeters: 100,
    platforms: 2,
  };
  assert.equal(stationOnSections(station, [corridor], [selected]), true);
  assert.equal(
    stationOnSections(
      { ...station, coordinates: [15.01, 59.002] },
      [corridor],
      [selected],
    ),
    false,
  );
});

test("built branch endpoints receive a physical link to nearby built track", () => {
  const branchGeometry = lineString([
    [15.01, 59.00015],
    [15.01, 59.01],
  ]).geometry;
  const branch: Corridor = {
    id: "branch",
    name: "Branch",
    geometry: branchGeometry,
    length: length(lineString(branchGeometry.coordinates), { units: "meters" }),
    osmWayIds: [],
  };
  const links = junctionLinks(
    [corridor, branch],
    [
      { ...selected, tracks: 2 },
      { corridorId: "branch", start: 0, end: branch.length, tracks: 1 },
    ],
  );
  assert.equal(links.length, 1);
  assert.ok(length(links[0], { units: "meters" }) < 40);
});
