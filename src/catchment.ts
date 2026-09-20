import { distance } from "@turf/turf";
import RBush from "rbush";
import type { Feature, Polygon, Position } from "geojson";
import type { Station } from "./types";

export type PopulationCell = Feature<Polygon, { id: string; population: number; center: Position }>;
export interface TransitStop { id: string; coordinates: Position }
export type AccessMode = "walk" | "cycle" | "transit" | "car";
export interface CatchmentCell extends Feature<Polygon> {
  properties: PopulationCell["properties"] & { share: number; residents: number; mode: AccessMode; minutes: number; walkShare: number };
}
export interface Catchment { cells: CatchmentCell[]; residents: number; modes: Record<AccessMode, number>; competitors: number }
export type CoverageCell = Feature<Polygon, PopulationCell["properties"] & { share: number; residents: number; stationId: string; stationName: string }>;
const km = (a: Position, b: Position) => distance(a, b);
const modes: AccessMode[] = ["walk", "cycle", "transit", "car"];
const emptyModes = (): Record<AccessMode, number> => ({ walk: 0, cycle: 0, transit: 0, car: 0 });
export function surroundingBounds(p: Position, radiusKm: number): [number, number, number, number] {
  const lat = radiusKm / 110;
  const lon = lat / Math.cos((p[1] + lat) * Math.PI / 180);
  return [p[0] - lon, p[1] - lat, p[0] + lon, p[1] + lat];
}
export function stopIndex(stops: TransitStop[]) {
  return new RBush<{ minX: number; minY: number; maxX: number; maxY: number; coordinates: Position }>().load(
    stops.map(s => ({ minX: s.coordinates[0], maxX: s.coordinates[0], minY: s.coordinates[1], maxY: s.coordinates[1], coordinates: s.coordinates })),
  );
}
function nearestStop(p: Position, index: ReturnType<typeof stopIndex>) {
  const [minX, minY, maxX, maxY] = surroundingBounds(p, 1);
  return Math.min(Infinity, ...index.search({ minX, minY, maxX, maxY }).map(s => km(p, s.coordinates)));
}
// A density proxy, not a claim about observed cycling behaviour. Smooth rather than a rural/urban cutoff.
export function urbanity(cells: PopulationCell[], coordinates: Position) {
  const residents = cells.reduce((sum, c) => sum + (km(c.properties.center, coordinates) <= 3 ? c.properties.population : 0), 0);
  return Math.max(0, Math.min(1, (residents / (Math.PI * 9) - 100) / 900));
}
// Integrate uniform population across the original rotated SCB square near a walking circle.
// 10 × 10 equal-area samples approximate overlap to about 100 m, without whole-cell awards.
function samples(cell: PopulationCell, subdivide: boolean): Position[] {
  if (!subdivide) return [cell.properties.center];
  const [a, b, c, d] = cell.geometry.coordinates[0];
  const points: Position[] = [];
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
    const u = (i + 0.5) / 10, v = (j + 0.5) / 10;
    points.push([0, 1].map(axis => (1-u)*(1-v)*a[axis] + u*(1-v)*b[axis] + u*v*c[axis] + (1-u)*v*d[axis]));
  }
  return points;
}

export function calculateCatchments(cells: PopulationCell[], stations: Station[], stops: ReturnType<typeof stopIndex>) {
  const all = [...new Map(stations.map(s => [s.id, s])).values()];
  const byStation: Record<string, Catchment> = {};
  const candidates = all.map(station => {
    const separation = Math.min(30, ...all.filter(s => s.id !== station.id).map(s => km(s.coordinates, station.coordinates)));
    byStation[station.id] = { cells: [], residents: 0, modes: emptyModes(), competitors: all.filter(s => s.id !== station.id && km(s.coordinates, station.coordinates) <= 80).length };
    const urban = urbanity(cells, station.coordinates);
    return { station, stop: nearestStop(station.coordinates, stops), carPenalty: 15 - Math.min(10, separation / 3), cycleWeight: 0.3 + 0.5 * urban, carWeight: 0.5 - 0.1 * urban };
  });
  const coverage: CoverageCell[] = [];
  for (const cell of cells) {
    const nearby = candidates.filter(s => km(cell.properties.center, s.station.coordinates) <= 40);
    if (!nearby.length) continue;
    const points = samples(cell, nearby.some(s => km(cell.properties.center, s.station.coordinates) <= 2));
    const sums = nearby.map(() => ({ share: 0, minutes: 0, modes: emptyModes() }));
    for (const point of points) {
      const stop = nearestStop(point, stops);
      const weights = nearby.map(s => {
        const d = km(point, s.station.coordinates);
        const options: [AccessMode, number, number][] = d <= 1 ? [["walk", d * 1.25 / 4.8 * 60, 1]] : [
          ["cycle", 3 + d * 1.25 / 15 * 60, s.cycleWeight],
          ["car", s.carPenalty + d * 1.3 / 45 * 60, s.carWeight],
        ];
        if (d > 1 && stop <= 0.8 && s.stop <= 0.8) options.push(["transit", 8 + (stop + s.stop) * 1.25 / 4.8 * 60 + d * 1.3 / 30 * 60, 0.7]);
        const score = ([, minutes, availability]: typeof options[number]) => minutes <= 45 ? Math.exp(-minutes / 18) * availability : 0;
        options.sort((a, b) => score(b) - score(a));
        return { mode: options[0][0], minutes: options[0][1], weight: score(options[0]) };
      });
      const total = 0.35 + weights.reduce((sum, w) => sum + w.weight, 0);
      weights.forEach((w, i) => {
        const share = w.weight / total / points.length;
        sums[i].share += share;
        sums[i].modes[w.mode] += share;
        sums[i].minutes += w.minutes * share;
      });
    }
    let coverageShare = 0, strongest = -1, stationId = "", stationName = "";
    sums.forEach((sum, i) => {
      if (!sum.share) return;
      const s = nearby[i].station, result = byStation[s.id];
      const residents = cell.properties.population * sum.share;
      const mode = modes.reduce((a, b) => sum.modes[b] > sum.modes[a] ? b : a);
      result.cells.push({ ...cell, properties: { ...cell.properties, share: sum.share, residents, mode, minutes: sum.minutes / sum.share, walkShare: sum.modes.walk } });
      result.residents += residents;
      for (const m of modes) result.modes[m] += cell.properties.population * sum.modes[m];
      coverageShare += sum.share;
      if (sum.share > strongest) { strongest = sum.share; stationId = s.id; stationName = s.name; }
    });
    if (coverageShare) coverage.push({ ...cell, properties: { ...cell.properties, share: coverageShare, residents: cell.properties.population * coverageShare, stationId, stationName } });
  }
  return { byStation, coverage };
}
export function calculateCatchment(cells: PopulationCell[], selected: Station, stations: Station[], stops: ReturnType<typeof stopIndex>): Catchment {
  return calculateCatchments(cells, [...stations.filter(s => s.id !== selected.id), selected], stops).byStation[selected.id];
}
