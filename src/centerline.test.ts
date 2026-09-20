import { test } from "node:test";
import assert from "node:assert/strict";
import { bearing, distance, length, lineString, nearestPointOnLine } from "@turf/turf";
import { centerParallelTracks } from "./centerline";
import { simplifyNetwork } from "./network";
import { routeSelection } from "./routing";
import type { Corridor } from "./types";

function track(id: string, coordinates: number[][], osmWayIds = [Number(id)]): Corridor {
  const geometry = lineString(coordinates).geometry;
  return { id, name: "Main line", geometry, length: length(lineString(coordinates), { units: "meters" }), osmWayIds };
}
test("parallel tracks become the midpoint regardless of direction and sampling", () => {
  const result = centerParallelTracks([
    track("1", [[15, 59], [15.02, 59]]),
    track("2", [[15.02, 59.0001], [15.008, 59.0001], [15, 59.0001]]),
  ]);
  assert.equal(result.length, 1);
  for (const p of result[0].geometry.coordinates) assert.ok(Math.abs(p[1] - 59.00005) < 1e-8);
  assert.deepEqual(result[0].osmWayIds.sort(), [1, 2]);
});
test("three unequally spaced tracks use the center of the entire formation", () => {
  const result = centerParallelTracks([0, 0.00004, 0.00016].map((y, i) =>
    track(String(i), [[15, 59 + y], [15.02, 59 + y]])));
  assert.equal(result.length, 1);
  assert.ok(result[0].geometry.coordinates.every(p => Math.abs(p[1] - 59.00008) < 1e-8));
});
test("partial parallel overlap preserves both continuations and routes along one ROW", () => {
  const cleaned = simplifyNetwork({ corridors: [
    track("1", [[15, 59], [15.02, 59]]),
    track("2", [[15.01, 59.0001], [15.03, 59.0001]]),
  ], stations: [], buildings: [], roads: [], meta: { bbox: [], fetchedAt: "test", attribution: "test" } });
  assert.equal(cleaned.corridors.length, 1);
  const c = cleaned.corridors[0];
  assert.ok(c.length > 1700 && c.length < 1750);
  assert.ok(nearestPointOnLine(c.geometry, [15.015, 59.00005], { units: "meters" }).properties.dist < 0.1);
  const route = routeSelection(cleaned.corridors, { corridorId: c.id, position: 0 }, { corridorId: c.id, position: c.length });
  assert.ok(route);
});
test("crossings and separated parallel rights-of-way remain distinct", () => {
  const result = centerParallelTracks([
    track("1", [[15, 59], [15.02, 59]]),
    track("2", [[15.01, 58.999], [15.01, 59.001]]),
    track("3", [[15, 59.0004], [15.02, 59.0004]]),
  ]);
  assert.equal(result.length, 3);
});
test("a diverging branch retains its independent tail", () => {
  const result = centerParallelTracks([
    track("1", [[15, 59], [15.02, 59]]),
    track("2", [[15.005, 59.0001], [15.01, 59.0001], [15.015, 59.002]]),
  ]);
  assert.equal(result.length, 2);
  assert.ok(result.some(c => c.geometry.coordinates.some(p => p[1] === 59.002)));
});

test("different OSM split points still yield one centered corridor", () => {
  const cleaned = simplifyNetwork({ corridors: [
    track("1", [[15, 59], [15.02, 59]]),
    track("2", [[15, 59.0001], [15.007, 59.0001]]),
    track("3", [[15.02, 59.0001], [15.007, 59.0001]]),
  ], stations: [], buildings: [], roads: [], meta: { bbox: [], fetchedAt: "test", attribution: "test" } });
  assert.equal(cleaned.corridors.length, 1);
  assert.ok(cleaned.corridors[0].geometry.coordinates.every(p => Math.abs(p[1] - 59.00005) < 1e-8));
  assert.deepEqual(cleaned.corridors[0].osmWayIds.sort(), [1, 2, 3]);
});

test("parallel detection uses meter distances in northern Sweden", () => {
  const result = centerParallelTracks([
    track("1", [[20, 68], [20, 68.01]]),
    track("2", [[20.00024, 68], [20.00024, 68.01]]),
  ]);
  assert.equal(result.length, 1);
  assert.ok(result[0].geometry.coordinates.every(p => Math.abs(p[0] - 20.00012) < 1e-8));
});

test("centering preserves an actual shared interior junction", () => {
  const cleaned = simplifyNetwork({ corridors: [
    track("1", [[15, 59], [15.01, 59], [15.02, 59]]),
    track("2", [[15, 59.0001], [15.02, 59.0001]]),
    track("3", [[15.01, 58.998], [15.01, 59], [15.01, 59.002]]),
  ], stations: [], buildings: [], roads: [], meta: { bbox: [], fetchedAt: "test", attribution: "test" } });
  assert.equal(cleaned.corridors.length, 2);
  const [a, b] = cleaned.corridors;
  assert.ok(routeSelection(cleaned.corridors, { corridorId: a.id, position: 0 }, { corridorId: b.id, position: b.length }));
});

test("a parallel track ending does not create a sharp sideways step", () => {
  const result = centerParallelTracks([
    track("1", [[15, 59], [15.04, 59]]),
    track("2", [[15.01, 59.00016], [15.03, 59.00016]]),
  ]);
  const coordinates = result[0].geometry.coordinates;
  const headings = coordinates.slice(1).map((p, i) => bearing(coordinates[i], p));
  const turns = headings.slice(1).map((h, i) => Math.abs(((h - headings[i] + 540) % 360) - 180));
  assert.ok(Math.max(...turns) < 4, `Maximum turn ${Math.max(...turns)}`);
});

test("a collapsed parallel branch meets the through centerline without a gap", () => {
  const cleaned = simplifyNetwork({ corridors: [
    track("1", [[15, 59], [15.04, 59]]),
    track("2", [[15.01, 59.0001], [15.02, 59.0001], [15.025, 59.002]]),
  ], stations: [], buildings: [], roads: [], meta: { bbox: [], fetchedAt: "test", attribution: "test" } });
  const [main, branch] = [...cleaned.corridors].sort((a, b) => b.length - a.length);
  assert.ok(nearestPointOnLine(main.geometry, branch.geometry.coordinates[0], { units: "meters" }).properties.dist < 0.01);
  assert.ok(main.geometry.coordinates.some(p => distance(p, branch.geometry.coordinates[0], { units: "meters" }) < 0.01));
});
