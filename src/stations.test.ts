import { test } from "node:test";
import assert from "node:assert/strict";
import { resizeStationSpan, suggestDepotName, suggestStationName, stationPreviews } from "./stations";
import type { Corridor, Station } from "./types";
import { pointAt, stationAlignedLine, stationCenter, stationEnds, stationEnvelope, stationPlacement, stationPlatformLine } from "./geometry";
import { distance, lineString, polygon } from "@turf/turf";

const station: Station = { id: "s", name: "Kumla", coordinates: [15.14, 59.12], corridorId: "c", position: 50, lengthMeters: 100, platforms: 2 };
test("station names use the nearest settlement and unique suffixes, with an honest rural fallback", () => {
  const places = [{ id: "p", name: "Kumla", coordinates: station.coordinates }, { id: "q", name: "Örebro", coordinates: [15.21, 59.27] }];
  assert.equal(suggestStationName(station.coordinates, places, {}), "Kumla");
  assert.equal(suggestStationName(station.coordinates, places, { s: station }), "Kumla 2");
  assert.equal(suggestStationName([20, 68], places, {}), "New station");
});
test("yard names use the nearest settlement and remain unique", () => {
  const places = [{ id: "p", name: "Norrköping", coordinates: station.coordinates }];
  assert.equal(suggestDepotName(station.coordinates, places, {}), "Norrköping yard");
  assert.equal(suggestDepotName(station.coordinates, places, { d: { id: "d", name: "Norrköping yard", corridorId: "c", position: 0, tracks: 4, lengthMeters: 200, side: 1 } }), "Norrköping yard 2");
  assert.equal(suggestDepotName([20, 68], places, {}), "New rail yard");
});
test("map preview replaces the committed name immediately and cancel restores it", () => {
  const saved = { s: station };
  assert.deepEqual(stationPreviews(saved, { ...station, name: "New name" }).map(s => s.name), ["New name"]);
  assert.deepEqual(stationPreviews(saved).map(s => s.name), ["Kumla"]);
  assert.equal(stationPreviews({}, station).length, 1);
});

test("a containing town takes precedence over a closer neighboring town center", () => {
  const places = [
    { id: "near", name: "Neighbor", coordinates: [15.141, 59.12] },
    { id: "city", name: "City", coordinates: [15.2, 59.15], geometry: polygon([[[15.1, 59.1], [15.3, 59.1], [15.3, 59.2], [15.1, 59.2], [15.1, 59.1]]]).geometry },
  ];
  assert.equal(suggestStationName(station.coordinates, places, {}), "City");
});

test("station placement preserves a signed lateral offset from its ROW", () => {
  const geometry = lineString([[15, 59], [15.02, 59]]).geometry;
  const corridor: Corridor = { id: "c", name: "Test", geometry, osmWayIds: [], length: distance(geometry.coordinates[0], geometry.coordinates[1], { units: "meters" }) };
  const target = [15.01, 59.0005];
  const placement = stationPlacement(corridor, target);
  const center = stationCenter(corridor, placement);
  assert.ok(Math.abs(placement.lateralOffsetMeters) > 40);
  assert.ok(distance(center, target, { units: "meters" }) < 0.5);
  const ends = stationEnds(corridor, placement, 200);
  assert.ok(Math.abs(distance(ends[0], ends[1], { units: "meters" }) - 200) < 0.5);
});

test("station end resizing can stay symmetric or keep the opposite end fixed", () => {
  assert.deepEqual(resizeStationSpan(500, 200, 350, "start", true, 2000), {
    position: 500,
    lengthMeters: 300,
  });
  assert.deepEqual(resizeStationSpan(500, 200, 350, "start", false, 2000), {
    position: 475,
    lengthMeters: 250,
  });
  assert.deepEqual(resizeStationSpan(500, 200, 700, "end", false, 2000), {
    position: 550,
    lengthMeters: 300,
  });
});

test("platforms follow curved ROW geometry and shifted stations bend the display alignment", () => {
  const geometry = lineString([[15, 59], [15.004, 59], [15.004, 59.004]]).geometry;
  const corridor: Corridor = { id: "curve", name: "Curve", geometry, osmWayIds: [], length: 0 };
  corridor.length = distance(geometry.coordinates[0], geometry.coordinates[1], { units: "meters" }) +
    distance(geometry.coordinates[1], geometry.coordinates[2], { units: "meters" });
  const curved: Station = {
    ...station,
    corridorId: corridor.id,
    position: corridor.length / 2,
    coordinates: pointAt(corridor, corridor.length / 2),
    lateralOffsetMeters: 45,
    lengthMeters: 220,
  };
  const platform = stationPlatformLine(corridor, curved, curved.lengthMeters);
  assert.ok(platform.geometry.coordinates.length >= 3);
  assert.ok(stationEnvelope(corridor, curved, curved.lengthMeters, curved.platforms).geometry.coordinates.length > 0);

  const aligned = stationAlignedLine(corridor, 0, corridor.length, [curved]);
  assert.ok(distance(aligned.geometry.coordinates[0], geometry.coordinates[0], { units: "meters" }) < 0.5);
  assert.ok(distance(aligned.geometry.coordinates.at(-1)!, geometry.coordinates.at(-1)!, { units: "meters" }) < 0.5);
  const nearestMiddle = aligned.geometry.coordinates.reduce((best, coordinate) =>
    distance(coordinate, curved.coordinates, { units: "meters" }) < distance(best, curved.coordinates, { units: "meters" }) ? coordinate : best,
  aligned.geometry.coordinates[0]);
  assert.ok(distance(nearestMiddle, curved.coordinates, { units: "meters" }) > 35);
});

