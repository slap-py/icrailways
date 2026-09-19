import { test } from "node:test";
import assert from "node:assert/strict";
import { length, lineString } from "@turf/turf";
import { routeSelection } from "./routing";
import type { Corridor } from "./types";

function corridor(id: string, coordinates: number[][]): Corridor {
  const geometry = lineString(coordinates).geometry;
  return {
    id,
    name: id,
    geometry,
    length: length(lineString(coordinates), { units: "meters" }),
    osmWayIds: [],
  };
}

test("selection routes from a through corridor onto a connected dataset segment", () => {
  const main = corridor("main", [
    [15, 59],
    [15.02, 59],
  ]);
  const branch = corridor("branch", [
    [15.01, 59.0001],
    [15.01, 59.01],
  ]);
  const selection = routeSelection(
    [main, branch],
    { corridorId: "main", position: 100 },
    { corridorId: "branch", position: 500 },
  );
  assert.ok(selection);
  assert.deepEqual(
    new Set(selection.parts?.map((part) => part.corridorId)),
    new Set(["main", "branch"]),
  );
});

test("selection does not jump to a disconnected segment", () => {
  const a = corridor("a", [
    [15, 59],
    [15.01, 59],
  ]);
  const b = corridor("b", [
    [15.02, 59],
    [15.03, 59],
  ]);
  assert.equal(
    routeSelection(
      [a, b],
      { corridorId: "a", position: 100 },
      { corridorId: "b", position: 100 },
    ),
    undefined,
  );
});

test("shared interior vertices connect merged lines without requiring an endpoint", () => {
  const a = corridor("a", [[15, 59], [15.01, 59], [15.02, 59]]);
  const b = corridor("b", [[15.01, 58.99], [15.01, 59], [15.01, 59.01]]);
  const route = routeSelection([a, b], { corridorId: "a", position: 100 }, { corridorId: "b", position: 1500 });
  assert.ok(route);
  assert.deepEqual(route.parts?.map(p => p.corridorId), ["a", "b"]);
});

test("a geometric crossing alone does not invent a junction", () => {
  const a = corridor("a", [[15, 59], [15.02, 59]]);
  const b = corridor("b", [[15.01, 58.99], [15.01, 59.01]]);
  assert.equal(routeSelection([a, b], { corridorId: "a", position: 100 }, { corridorId: "b", position: 1500 }), undefined);
});

test("routing keeps the requested A and B in either direction and rejects invalid input", () => {
  const a = corridor("a", [[15, 59], [15.01, 59]]);
  const b = corridor("b", [[15.01, 59], [15.02, 59]]);
  const start = { corridorId: "a", position: 100 }, end = { corridorId: "b", position: 300 };
  const forward = routeSelection([a, b], start, end)!;
  const reverse = routeSelection([a, b], end, start)!;
  assert.deepEqual(reverse.endpoints, [end, start]);
  assert.deepEqual(reverse.parts, forward.parts?.slice().reverse());
  assert.equal(routeSelection([a, b], start, start), undefined);
  assert.equal(routeSelection([a, b], start, { corridorId: "b", position: NaN }), undefined);
  assert.equal(routeSelection([a, b], start, { corridorId: "missing", position: 100 }), undefined);
});

test("real Sweden route uses the interior Nässjö junction and builds all route parts", async () => {
  const { readFileSync } = await import("node:fs");
  const { emptyProject, replaceSection, selectionLength, sectionMatches, effectiveSections } = await import("./construction");
  const network: import("./types").Network = JSON.parse(readFileSync(new URL("../public/data/sweden.json", import.meta.url), "utf8"));
  const start = network.stations.find(s => s.name === "Skövde")!;
  const end = network.stations.find(s => s.name === "Nässjö C")!;
  const route = routeSelection(network.corridors, start, end, network.stations)!;
  assert.ok(route);
  assert.ok(selectionLength(route) > 140000 && selectionLength(route) < 150000, "must not take the old 296 km detour through Hallsberg");
  assert.ok(route.parts?.some(p => network.corridors.find(c => c.id === p.corridorId)?.name === "Jönköpingsbanan"));
  const built = replaceSection(emptyProject("test"), route, 2, 160);
  assert.equal(sectionMatches(effectiveSections(built), route, 2, 160), true);
  assert.equal(replaceSection(built, route, 0, 160).sections.length, 0);
});

test("same-line selections may take a shorter connected path regardless of data grouping", () => {
  const loop = corridor("loop", [[15, 59], [15, 59.02], [15.02, 59.02], [15.02, 59]]);
  const shortcut = corridor("shortcut", [[15, 59], [15.02, 59]]);
  const route = routeSelection([loop, shortcut], { corridorId: "loop", position: 10 }, { corridorId: "loop", position: loop.length - 10 });
  assert.ok(route?.parts);
  assert.ok(route.parts.some(p => p.corridorId === "shortcut"));
  assert.ok(route.parts.reduce((sum, p) => sum + p.end - p.start, 0) < 1500);
});
