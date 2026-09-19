import { test } from "node:test";
import assert from "node:assert/strict";
import { length, lineString } from "@turf/turf";
import { simplifyNetwork } from "./network";
import type { Corridor, Network } from "./types";

function corridor(id: string, coordinates: number[][], name = "Main line") {
  const geometry = lineString(coordinates).geometry;
  return {
    id,
    name,
    geometry,
    length: length(lineString(coordinates), { units: "meters" }),
    osmWayIds: [],
  } satisfies Corridor;
}

const baseNetwork = (corridors: Corridor[]): Network => ({
  corridors,
  stations: [],
  buildings: [],
  roads: [],
  meta: { fetchedAt: "test", bbox: [14, 58, 16, 60], attribution: "test" },
});

test("network cleanup removes parallel artifacts and joins continuous segments", () => {
  const network = baseNetwork([
    corridor("a", [
      [15, 59],
      [15.01, 59],
    ]),
    corridor("b", [
      [15.0101, 59],
      [15.02, 59],
    ]),
    corridor("passing-track", [
      [15.003, 59.0001],
      [15.008, 59.0001],
    ]),
  ]);
  network.stations.push({
    id: "station",
    name: "Station",
    coordinates: [15.015, 59],
    corridorId: "b",
    position: 0,
    lengthMeters: 100,
    platforms: 2,
  });

  const cleaned = simplifyNetwork(network);
  assert.equal(cleaned.corridors.length, 1);
  assert.ok(cleaned.corridors[0].length > 1100);
  assert.equal(cleaned.stations[0].corridorId, cleaned.corridors[0].id);
  assert.ok(cleaned.stations[0].position > cleaned.corridors[0].length / 2);
});

test("network cleanup keeps a true branch separate", () => {
  const cleaned = simplifyNetwork(
    baseNetwork([
      corridor("main", [
        [15, 59],
        [15.01, 59],
      ]),
      corridor(
        "branch",
        [
          [15.01, 59],
          [15.01, 59.01],
        ],
        "Branch",
      ),
    ]),
  );
  assert.equal(cleaned.corridors.length, 2);
});

test("network cleanup joins nearby endpoints at Sweden's northern latitude", () => {
  const cleaned = simplifyNetwork(baseNetwork([
    corridor("north-a", [[20, 68.4], [20.01, 68.4]]),
    corridor("north-b", [[20.011, 68.4], [20.02, 68.4]]),
    corridor("distant", [[20.04, 68.4], [20.05, 68.4]]),
  ]));
  assert.equal(cleaned.corridors.length, 2);
  assert.ok(cleaned.corridors.some(c => c.length > 800));
});
