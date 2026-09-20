import assert from "node:assert/strict";
import test from "node:test";
import { along, booleanPointInPolygon, buffer, distance, length, lineString, nearestPointOnLine, polygon } from "@turf/turf";
import { applyDepot, depotAffectedBuildings, depotFrame, depotGeometry, depotMetrics, depotOutline, normalizeDepot, validDepotOutline } from "./depots";
import { stationAlignedLine } from "./geometry";
import { emptyProject } from "./construction";
import { loadProject, saveProject } from "./persistence";
import type { Building, Corridor, Depot, Station } from "./types";

const geometry = lineString([[15, 59], [15.01, 59.002], [15.02, 59]]).geometry;
const corridor: Corridor = { id: "rail", name: "Rail", geometry, osmWayIds: [], length: length(lineString(geometry.coordinates), { units: "meters" }) };
const depot: Depot = { id: "yard", name: "North yard", corridorId: "rail", position: 500, tracks: 6, lengthMeters: 250, side: 1 };

test("depot sidings stay inside the polygon and connect to the displayed railway on either side", () => {
  const station: Station = { id: "station", name: "Station", coordinates: [15, 59], corridorId: "rail", position: 500, lateralOffsetMeters: 80, lengthMeters: 200, platforms: 2 };
  for (const side of [-1, 1] as const) for (const tracks of [1, 6, 12]) {
    const yard = depotGeometry(corridor, { ...depot, side, tracks }, [station]);
    const rail = stationAlignedLine(corridor, 475, 525, [station]);
    assert.ok(nearestPointOnLine(rail, yard.connector.geometry.coordinates[0], { units: "meters" }).properties.dist < 0.01);
    for (const siding of yard.sidings) {
      assert.deepEqual(siding.geometry.coordinates[0], yard.connector.geometry.coordinates.at(-1));
      assert.ok(booleanPointInPolygon(siding.geometry.coordinates.at(-1)!, yard.area));
    }
  }
});

test("depot saves round-trip, older projects load, and invalid depot data is rejected", () => {
  let saved = "";
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    setItem: (_key: string, value: string) => { saved = value; }, getItem: () => saved,
  } });
  try {
    const project = { ...emptyProject("test"), depots: { yard: { ...depot, through: true, direction: -1 as const, exit: { corridorId: "rail", position: 900 }, outline: [[35, 20], [250, 20], [250, 100], [35, 100]] as [number, number][] } } };
    saveProject(project);
    assert.deepEqual(loadProject("test").depots, { yard: normalizeDepot(project.depots.yard) });
    const restored = loadProject("test");
    saveProject(restored);
    assert.deepEqual(loadProject("test"), restored, "repeated save/load cannot grow or shrink the footprint");
    saved = JSON.stringify({ ...emptyProject("test"), depots: { yard: depot } });
    const legacy = loadProject("test").depots!.yard;
    assert.deepEqual(legacy.outline, depotOutline(depot));
    assert.equal(legacy.tracks, depotMetrics(legacy).tracks);
    saveProject(emptyProject("test"));
    assert.deepEqual(loadProject("test").depots, {});
    saved = JSON.stringify({ ...project, depots: { yard: { ...depot, tracks: 0 } } });
    assert.throws(() => loadProject("test"), /depot/);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("a through yard has two rail-anchored approaches and no terminal buffers", () => {
  const yard = depotGeometry(corridor, { ...depot, through: true, exit: { corridorId: corridor.id, position: 950 } });
  assert.equal(yard.connections.length, 2);
  assert.equal(yard.buffers.length, 0);
  const target = depotFrame(corridor, { ...depot, position: 950 }).origin;
  assert.deepEqual(yard.exitConnector!.geometry.coordinates.at(-1), target);
  for (const siding of yard.sidings) {
    assert.deepEqual(siding.geometry.coordinates[0], yard.connector.geometry.coordinates.at(-1));
    assert.deepEqual(siding.geometry.coordinates.at(-1), yard.exitConnector!.geometry.coordinates[0]);
  }
});

test("custom concave boundaries keep every track connected and inside the yard", () => {
  const outline: [number, number][] = [[35, 16], [300, 16], [300, 100], [200, 100], [200, 50], [100, 50], [100, 100], [35, 100]];
  assert.equal(validDepotOutline(outline), true);
  for (const through of [false, true]) {
    const yard = depotGeometry(corridor, { ...depot, outline, through });
    const tolerance = buffer(yard.area, 0.1, { units: "meters" })!;
    assert.equal(yard.sidings.length, 5);
    for (const siding of yard.sidings) {
      assert.deepEqual(siding.geometry.coordinates[0], yard.connector.geometry.coordinates.at(-1));
      if (through) assert.deepEqual(siding.geometry.coordinates.at(-1), yard.exitConnector!.geometry.coordinates[0]);
      const meters = length(siding, { units: "meters" });
      for (let i = 0; i <= 100; i++) assert.ok(booleanPointInPolygon(along(siding, meters * i / 100, { units: "meters" }), tolerance));
    }
  }
  assert.equal(validDepotOutline([[0, 0], [100, 100], [100, 0], [0, 100]]), false);
  assert.equal(validDepotOutline([[0, 0], [1, 0], [0, 1]]), false);
  assert.equal(validDepotOutline([[0, 0], [NaN, 10], [100, 100]]), false);
});

test("yard and approach acquisitions clear buildings once, preserve unrelated buildings", () => {
  const frame = depotFrame(corridor, depot);
  const building = (id: string, x: number, y: number): Building => ({ id,
    geometry: polygon([[[x - 2, y - 2], [x + 2, y - 2], [x + 2, y + 2], [x - 2, y + 2], [x - 2, y - 2]].map(([x, y]) => frame.local(x, y))]).geometry,
    buildingType: "house", levels: 1, footprintArea: 16, estimatedCost: 24000, levelSource: "test",
  });
  const buildings = [building("yard", 150, 50), building("approach", 18, 2), building("outside", -100, -100)];
  const yard = depotGeometry(corridor, depot);
  const affected = depotAffectedBuildings(yard, buildings, []);
  assert.deepEqual(affected.map(b => b.id).sort(), ["approach", "yard"]);
  const applied = applyDepot(emptyProject("test"), depot, affected);
  assert.equal(applied.spent, 48000);
  assert.deepEqual(applied.demolished.sort(), ["approach", "yard"]);
  assert.equal(depotAffectedBuildings(yard, buildings, applied.demolished).length, 0);
  assert.equal(applyDepot(applied, { ...depot, name: "Renamed yard" }, affected).spent, 48000);
});

// Vertex values transcribed from the user's distorted-yard screenshot.
const screenshotOutline: [number, number][] = [[-2, 10], [82, 22], [398, 168], [405, 194], [319, 181], [42, 49], [3, 25]];
test("the diagonal screenshot yard has ordered, forward-running tracks inside its polygon", () => {
  for (const direction of [1, -1] as const) for (const side of [1, -1] as const) {
    const draft = { ...depot, outline: screenshotOutline, through: true, direction, side };
    const yard = depotGeometry(corridor, draft), frame = depotFrame(corridor, draft);
    assert.equal(yard.layoutError, "");
    assert.equal(yard.sidings.length, 6);
    assert.ok(Math.abs(yard.axis[1]) > 0.3, "tracks follow the diagonal footprint");
    const tolerant = buffer(yard.area, 0.1, { units: "meters" })!;
    const projected = yard.sidings.map(siding => siding.geometry.coordinates.map(p => {
      assert.ok(booleanPointInPolygon(p, tolerant));
      const [x, y] = frame.fromMap(p);
      return [x * yard.axis[0] + y * yard.axis[1], -x * yard.axis[1] + y * yard.axis[0]];
    }));
    for (const path of projected) for (let i = 1; i < path.length; i++) assert.ok(path[i][0] > path[i - 1][0], "a siding must never reverse back through the yard");
    for (let lane = 1; lane < projected.length; lane++) for (let i = 1; i < projected[lane].length - 1; i++)
      assert.ok(projected[lane][i][1] >= projected[lane - 1][i][1] - 0.001, "track ordering cannot swap");
  }
});

test("approaches are bounded smooth curves attached to the displayed railway", () => {
  const yard = depotGeometry(corridor, { ...depot, outline: screenshotOutline, through: true });
  for (const connection of yard.connections) {
    assert.ok(connection.geometry.coordinates.length >= 25);
    const points = connection.geometry.coordinates;
    const chord = distance(points[0], points.at(-1)!, { units: "meters" });
    assert.ok(length(connection, { units: "meters" }) < chord * 1.6, "no approach spike or runaway detour");
    for (let i = 1; i < points.length; i++) assert.ok(distance(points[i - 1], points[i], { units: "meters" }) < 20);
  }
  const rail = stationAlignedLine(corridor, 0, corridor.length, []);
  assert.ok(nearestPointOnLine(rail, yard.connector.geometry.coordinates[0], { units: "meters" }).properties.dist < 0.001);
  assert.ok(nearestPointOnLine(rail, yard.exitConnector!.geometry.coordinates.at(-1)!, { units: "meters" }).properties.dist < 0.001);
});

test("reversing a yard reverses its longitudinal extent while keeping its physical side", () => {
  const forward = depotFrame(corridor, depot);
  const reverse = depotFrame(corridor, { ...depot, direction: -1 });
  const [x, y] = forward.fromMap(reverse.local(200, 60));
  assert.ok(Math.abs(x + 200) < 0.001);
  assert.ok(Math.abs(y - 60) < 0.001);
  assert.deepEqual(reverse.origin, forward.origin);
});

test("narrow footprints produce a useful error instead of overlapping track scribbles", () => {
  const yard = depotGeometry(corridor, { ...depot, tracks: 12, outline: [[0, 10], [300, 10], [300, 16], [0, 16]] });
  assert.match(yard.layoutError, /no usable track space/);
  assert.equal(yard.sidings.length, 0);
  assert.equal(yard.connections.length, 0);
});

test("inserting a collinear corner does not rotate or rearrange the track body", () => {
  const first = depotGeometry(corridor, { ...depot, outline: screenshotOutline });
  const outline = [...screenshotOutline];
  outline.splice(2, 0, [(82 + 398) / 2, (22 + 168) / 2]);
  const second = depotGeometry(corridor, { ...depot, outline });
  assert.deepEqual(first.axis, second.axis);
  assert.ok(Math.abs(length(first.sidings[0]) - length(second.sidings[0])) < 0.01);
});

test("yard capacity and length come from footprint dimensions, ignoring obsolete slider settings", () => {
  const rectangle = (length: number, width: number): Depot => ({ ...depot,
    outline: [[0, 0], [length, 0], [length, width], [0, width]],
  });
  const narrow = rectangle(200, 26), wide = rectangle(200, 38), longer = rectangle(400, 26);
  assert.equal(depotMetrics(narrow).tracks, 4);
  assert.equal(depotMetrics(wide).tracks, 6);
  assert.equal(depotMetrics(longer).tracks, 4);
  assert.ok(Math.abs(depotMetrics(longer).lengthMeters - depotMetrics(narrow).lengthMeters - 200) < 0.1);
  const outdated = { ...narrow, tracks: 12, lengthMeters: 600 };
  assert.deepEqual(depotMetrics(outdated), depotMetrics(narrow));
  const rendered = depotGeometry(corridor, outdated);
  assert.equal(rendered.sidings.length, 4);
  assert.equal(rendered.label.properties.tracks, 4);
  assert.match(rendered.label.properties.label, /4 tracks/);
  const normalized = normalizeDepot(outdated);
  assert.equal(normalized.tracks, 4);
  assert.deepEqual(normalized.outline, outdated.outline);
  assert.deepEqual(normalizeDepot(normalized), normalized);
});

test("automatic yards can exceed the old twelve-track and 600-metre slider limits", () => {
  const large: Depot = { ...depot, outline: [[0, 0], [1000, 0], [1000, 110], [0, 110]] };
  const metrics = depotMetrics(large);
  assert.equal(metrics.tracks, 18);
  assert.ok(metrics.lengthMeters > 990);
  assert.equal(depotGeometry(corridor, large).sidings.length, 18);
});

test("long curved footprints produce ordered parallel curves rather than straight chords", () => {
  const outline: [number, number][] = [[0, 10], [100, 10], [200, 25], [300, 55], [400, 95],
    [400, 135], [300, 95], [200, 65], [100, 50], [0, 50]];
  const draft = { ...depot, outline };
  const yard = depotGeometry(corridor, draft), frame = depotFrame(corridor, draft);
  assert.equal(yard.sidings.length, 6);
  const normal: [number, number] = [-yard.axis[1], yard.axis[0]];
  const projected = yard.sidings[0].geometry.coordinates.map(coordinate => {
    const local = frame.fromMap(coordinate);
    return [local[0] * yard.axis[0] + local[1] * yard.axis[1], local[0] * normal[0] + local[1] * normal[1]];
  });
  const first = projected[0], middle = projected[Math.floor(projected.length / 2)], last = projected.at(-1)!;
  const t = (middle[0] - first[0]) / (last[0] - first[0]);
  const chordY = first[1] + (last[1] - first[1]) * t;
  assert.ok(Math.abs(middle[1] - chordY) > 10, "the fitted siding should follow the curved centreline");
  const tolerance = buffer(yard.area, 0.1, { units: "meters" })!;
  for (const siding of yard.sidings) for (const coordinate of siding.geometry.coordinates)
    assert.ok(booleanPointInPolygon(coordinate, tolerance));
});
