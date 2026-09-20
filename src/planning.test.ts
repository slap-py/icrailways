import assert from "node:assert/strict";
import test from "node:test";
import { length, lineString } from "@turf/turf";
import { demoProject, estimatedDailyDemand, serviceOpportunities, stationConnection } from "./planning";
import { emptyProject } from "./construction";
import type { Corridor, Network, Station } from "./types";

const geometry = lineString([[15, 59], [15.4, 59]]).geometry;
const corridor: Corridor = { id: "main", name: "Main", geometry, osmWayIds: [], length: length(lineString(geometry.coordinates), { units: "meters" }) };
const network: Network = { corridors: [corridor], stations: [], buildings: [], roads: [], places: [
  { id: "a", name: "Alpha", coordinates: geometry.coordinates[0] },
  { id: "b", name: "Beta", coordinates: geometry.coordinates[1] },
], meta: { fetchedAt: "test", bbox: [15, 59, 15.4, 59], attribution: "test" } };
const station = (id: string, position: number): Station => ({ id, name: id, coordinates: geometry.coordinates[id === "a" ? 0 : 1], corridorId: corridor.id, position, lengthMeters: 200, platforms: 2 });

test("city-pair demand is distinct from potential reach and needs continuous built track", () => {
  const a = station("a", 1000), b = station("b", corridor.length - 1000);
  const project = { ...emptyProject("test"), stations: { a, b }, sections: [{ id: "track", corridorId: corridor.id,
    start: 0, end: corridor.length, tracks: 2 as const, maxSpeedKph: 160, electrified: true }] };
  const [connected] = serviceOpportunities(network, project, { a: 100_000, b: 60_000 });
  assert.equal(connected.connected, true);
  assert.ok((connected.estimatedDailyTrips || 0) > 0);
  assert.ok((connected.estimatedDailyTrips || 0) < 60_000);
  assert.equal(stationConnection(a, project.sections), true);
  const [gap] = serviceOpportunities(network, { ...project, sections: [{ ...project.sections[0], end: corridor.length / 3 }] }, { a: 100_000, b: 60_000 });
  assert.equal(gap.connected, false);
  assert.equal(gap.estimatedDailyTrips, null);
  assert.ok(estimatedDailyDemand(100_000, 60_000, 100, 60, 8) < estimatedDailyDemand(100_000, 60_000, 20, 20, 8));
  assert.ok(estimatedDailyDemand(100_000, 60_000, 20, 20, 4) < estimatedDailyDemand(100_000, 60_000, 20, 20, 16));
});

test("the demo project is deterministic and immediately exposes two stations and a yard", () => {
  const first = demoProject(network, "network-key"), second = demoProject(network, "network-key");
  assert.deepEqual(first, second);
  assert.equal(first.networkKey, "network-key");
  assert.equal(Object.keys(first.stations).length, 2);
  assert.equal(Object.keys(first.depots || {}).length, 1);
  assert.equal(first.sections.length, 1);
  assert.ok(first.spent > 0);
});
