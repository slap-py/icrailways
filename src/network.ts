import {
  along,
  bearing,
  bbox,
  distance,
  length,
  lineString,
  nearestPointOnLine,
} from "@turf/turf";
import type { Position } from "geojson";
import type { Corridor, Network } from "./types";

const PARALLEL_DISTANCE_METERS = 45;
const JOIN_DISTANCE_METERS = 55;

function boxesOverlap(a: number[], b: number[], padding = 0.001) {
  return (
    a[0] <= b[2] + padding &&
    a[2] >= b[0] - padding &&
    a[1] <= b[3] + padding &&
    a[3] >= b[1] - padding
  );
}

function samples(corridor: Corridor) {
  const count = Math.max(5, Math.min(25, Math.ceil(corridor.length / 500)));
  return Array.from({ length: count }, (_, i) =>
    along(corridor.geometry, (corridor.length * i) / (count - 1), {
      units: "meters",
    }).geometry.coordinates,
  );
}

const corridorBoundsCache = new WeakMap<Corridor, number[]>();
function corridorBounds(corridor: Corridor) {
  let bounds = corridorBoundsCache.get(corridor);
  if (!bounds) {
    bounds = bbox(corridor.geometry);
    corridorBoundsCache.set(corridor, bounds);
  }
  return bounds;
}

function isParallelDuplicate(corridor: Corridor, longer: Corridor) {
  if (!boxesOverlap(corridorBounds(corridor), corridorBounds(longer))) return false;
  const points = samples(corridor);
  let nearby = 0;
  for (const point of points) {
    const d = nearestPointOnLine(longer.geometry, point, {
      units: "meters",
    }).properties.dist;
    if (d <= PARALLEL_DISTANCE_METERS) nearby++;
  }
  return nearby / points.length >= 0.8;
}

function removeParallelDuplicates(corridors: Corridor[]) {
  const kept: Corridor[] = [];
  for (const corridor of [...corridors].sort((a, b) => b.length - a.length)) {
    if (!kept.some((longer) => isParallelDuplicate(corridor, longer)))
      kept.push(corridor);
  }
  return kept;
}

const turnAngle = (a: number, b: number) =>
  Math.abs(((b - a + 540) % 360) - 180);

function orientedCoordinates(corridor: Corridor, connectionEnd: 0 | 1) {
  const coordinates = corridor.geometry.coordinates;
  return connectionEnd === 1 ? [...coordinates] : [...coordinates].reverse();
}

function mergeCandidate(
  a: Corridor,
  aEnd: 0 | 1,
  b: Corridor,
  bEnd: 0 | 1,
) {
  const aPoint = aEnd === 0 ? a.geometry.coordinates[0] : a.geometry.coordinates.at(-1)!;
  const bPoint = bEnd === 0 ? b.geometry.coordinates[0] : b.geometry.coordinates.at(-1)!;
  const dy = JOIN_DISTANCE_METERS / 111195;
  const dx = dy / Math.cos(Math.max(Math.abs(aPoint[1]), Math.abs(bPoint[1])) * Math.PI / 180);
  if (Math.abs(aPoint[0] - bPoint[0]) > dx || Math.abs(aPoint[1] - bPoint[1]) > dy) return;
  const gap = distance(aPoint, bPoint, {
    units: "meters",
  });
  if (gap > JOIN_DISTANCE_METERS) return;
  const aCoordinates = orientedCoordinates(a, aEnd);
  const bCoordinates = orientedCoordinates(b, bEnd === 0 ? 1 : 0);
  const incoming = bearing(
    aCoordinates[Math.max(0, aCoordinates.length - 4)],
    aCoordinates.at(-1)!,
  );
  const outgoing = bearing(
    bCoordinates[0],
    bCoordinates[Math.min(3, bCoordinates.length - 1)],
  );
  const turn = turnAngle(incoming, outgoing);
  const generic = (name: string) =>
    name === "Connecting railway" || name === "Regional railway";
  if (turn > 55 || (a.name !== b.name && !generic(a.name) && !generic(b.name) && turn > 18))
    return;
  return { aCoordinates, bCoordinates, gap, turn };
}

function mergeConnectedCorridors(corridors: Corridor[]) {
  const work = [...corridors];
  while (true) {
    let best:
      | {
          a: number;
          b: number;
          aCoordinates: Position[];
          bCoordinates: Position[];
          gap: number;
          score: number;
        }
      | undefined;
    for (let a = 0; a < work.length; a++)
      for (let b = a + 1; b < work.length; b++)
        for (const aEnd of [0, 1] as const)
          for (const bEnd of [0, 1] as const) {
            const candidate = mergeCandidate(
              work[a],
              aEnd,
              work[b],
              bEnd,
            );
            if (!candidate) continue;
            const score = candidate.turn * 2 + candidate.gap;
            if (!best || score < best.score)
              best = { a, b, ...candidate, score };
          }
    if (!best) return work;
    const a = work[best.a],
      b = work[best.b],
      primary = a.length >= b.length ? a : b,
      coordinates = [
        ...best.aCoordinates,
        ...(best.gap < 0.1
          ? best.bCoordinates.slice(1)
          : best.bCoordinates),
      ];
    const geometry = lineString(coordinates).geometry;
    const merged: Corridor = {
      id: primary.id,
      name:
        primary.name === "Connecting railway"
          ? a === primary
            ? b.name
            : a.name
          : primary.name,
      geometry,
      osmWayIds: [...new Set([...a.osmWayIds, ...b.osmWayIds])],
      length: length(lineString(coordinates), { units: "meters" }),
    };
    work.splice(best.b, 1);
    work.splice(best.a, 1, merged);
  }
}

export function simplifyNetwork(network: Network): Network {
  const corridors = mergeConnectedCorridors(
    removeParallelDuplicates(network.corridors),
  );
  const corridorBounds = corridors.map((corridor) => ({
    corridor,
    bounds: bbox(corridor.geometry),
  }));
  const stations = network.stations.flatMap((station) => {
    let best:
      | { corridor: Corridor; distance: number; position: number }
      | undefined;
    for (const candidate of corridorBounds) {
      const [x, y] = station.coordinates;
      if (
        x < candidate.bounds[0] - 0.01 ||
        x > candidate.bounds[2] + 0.01 ||
        y < candidate.bounds[1] - 0.006 ||
        y > candidate.bounds[3] + 0.006
      )
        continue;
      const nearest = nearestPointOnLine(
        candidate.corridor.geometry,
        station.coordinates,
        { units: "meters" },
      );
      if (!best || nearest.properties.dist < best.distance)
        best = {
          corridor: candidate.corridor,
          distance: nearest.properties.dist,
          position: nearest.properties.location,
        };
    }
    return best && best.distance < 250
      ? [
          {
            ...station,
            corridorId: best.corridor.id,
            position: best.position,
          },
        ]
      : [];
  });
  return { ...network, corridors, stations };
}
