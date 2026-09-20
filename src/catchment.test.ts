import { test } from "node:test";
import assert from "node:assert/strict";
import { destination } from "@turf/turf";
import { calculateCatchment, calculateCatchments, stopIndex, urbanity } from "./catchment";
import type { PopulationCell } from "./catchment";
import type { Station } from "./types";
const origin = [15, 59];
const at = (km: number, bearing = 90) => destination(origin, km, bearing).geometry.coordinates;
const station = (id: string, coordinates = origin): Station => ({ id, coordinates, name: id, corridorId: "test", position: 0, lengthMeters: 100, platforms: 2 });
function cell(km: number, population = 1000): PopulationCell {
  const center = at(km), dx = 0.5 / (111.195 * Math.cos(center[1] * Math.PI / 180)), dy = 0.5 / 111.195;
  const [x, y] = center;
  const a = [x-dx, y-dy], b = [x+dx, y-dy], c = [x+dx, y+dy], d = [x-dx, y+dy];
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [[a,b,c,d,a]] }, properties: { id: String(km), population, center } };
}
const noStops = stopIndex([]);
test("competing stations share population without double counting it", () => {
  const a = station("a"), b = station("b");
  const cells = [cell(1)];
  const alone = calculateCatchment(cells, a, [], noStops);
  const first = calculateCatchment(cells, a, [a, b], noStops);
  const second = calculateCatchment(cells, b, [a, b], noStops);
  assert(first.residents < alone.residents);
  assert.equal(first.residents, second.residents);
  assert(first.residents + second.residents < 1000);
  assert.equal(first.cells.length, 1);
});
test("isolated stations can draw a nearby town by car beyond urban access", () => {
  const a = station("a"), b = station("b", at(1, 270));
  const rural = calculateCatchment([cell(20)], a, [], noStops);
  const urban = calculateCatchment([cell(20)], a, [b], noStops);
  assert(rural.residents > 0);
  assert.equal(rural.cells[0].properties.mode, "car");
  assert.equal(urban.residents, 0);
});
test("feeder access needs stops at both ends and uses proximity, not stop counts", () => {
  const a = station("a"), b = station("b", at(0.1, 270));
  const cells = [cell(8)];
  const stops = [{ id: "a", coordinates: origin }, { id: "home", coordinates: at(8) }];
  const withStops = calculateCatchment(cells, a, [b], stopIndex(stops));
  assert.equal(withStops.cells[0].properties.mode, "transit");
  assert.notEqual(calculateCatchment(cells, a, [b], stopIndex(stops.slice(1))).cells[0].properties.mode, "transit");
  assert.equal(calculateCatchment(cells, a, [b], stopIndex([...stops, ...stops])).residents, withStops.residents);
  assert(calculateCatchment([cell(5)], a, [b], stopIndex([{ id: "a", coordinates: origin }, { id: "home", coordinates: at(5) }])).residents > calculateCatchment([cell(5)], a, [b], noStops).residents);
});
test("population stays bounded, far cells are excluded, and a moved preview replaces its saved station", () => {
  const a = station("a");
  const cells = [cell(0, 0), cell(1), cell(100)];
  const result = calculateCatchment(cells, a, [station("a", at(100))], noStops);
  assert.equal(result.competitors, 0);
  assert.equal(result.cells.length, 2);
  assert(result.residents >= 0 && result.residents <= 1000);
  assert(Math.abs(Object.values(result.modes).reduce((a, b) => a + b, 0) - result.residents) < 1e-8);
  assert.equal(calculateCatchment([], a, [], noStops).residents, 0);
});

test("walking allocates part of a square inside the circle and leaves the rest to other modes", () => {
  const result = calculateCatchment([cell(0.9)], station("a"), [], noStops);
  assert(result.modes.walk > 0 && result.modes.walk < result.residents);
  assert(result.modes.car + result.modes.cycle > 0);
  assert(result.cells[0].properties.walkShare < result.cells[0].properties.share);
});
test("moving a station onto a grid boundary does not award extra whole squares", () => {
  const field = Array.from({ length: 5 }, (_, i) => cell(i - 2));
  const center = calculateCatchment(field, station("a"), [], noStops);
  const border = calculateCatchment(field, station("a", at(0.5)), [], noStops);
  assert(Math.abs(border.modes.walk - center.modes.walk) / center.modes.walk < 0.02);
});
test("rural density shifts cycling toward driving", () => {
  const a = station("a"), b = station("b", at(0.1, 270));
  const ruralCells = [cell(0, 10), cell(3.5, 1000)];
  const urbanCells = [cell(0, 40000), cell(3.5, 1000)];
  const rural = calculateCatchment(ruralCells, a, [b], noStops).cells.find(c => c.properties.id === "3.5")!;
  const urban = calculateCatchment(urbanCells, a, [b], noStops).cells.find(c => c.properties.id === "3.5")!;
  assert.equal(urbanity(ruralCells, origin), 0);
  assert.equal(urbanity(urbanCells, origin), 1);
  assert.equal(rural.properties.mode, "car");
  assert.equal(urban.properties.mode, "cycle");
});
test("all-station coverage merges overlaps, persists without selection, and disappears when stations are removed", () => {
  const cells = [cell(0), cell(2)], a = station("a"), b = station("b", at(2));
  const all = calculateCatchments(cells, [a, b], noStops);
  assert.equal(all.coverage.length, 2);
  for (const c of all.coverage) {
    const total = Object.values(all.byStation).reduce((sum, s) => sum + (s.cells.find(f => f.properties.id === c.properties.id)?.properties.residents || 0), 0);
    assert(Math.abs(c.properties.residents - total) < 1e-8);
    assert(c.properties.share <= 1 && c.properties.share > 0);
  }
  assert.equal(calculateCatchments(cells, [], noStops).coverage.length, 0);
});
