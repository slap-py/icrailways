import {
  along,
  bearing,
  bbox,
  distance,
  length,
  lineString,
  lineSliceAlong,
  nearestPointOnLine,
} from "@turf/turf";
import type { Position } from "geojson";
import type { Corridor, Network } from "./types";

import { centerParallelTracks } from "./centerline";

const JOIN_DISTANCE_METERS = 55;

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
      // Ease small gaps into the alignment instead of adding a sideways or
      // backwards connector between the old track endpoints.
      ease = Math.min(30, Math.max(5, best.gap * 2)),
      aLine = lineString(best.aCoordinates),
      bLine = lineString(best.bCoordinates),
      aLength = length(aLine, { units: "meters" }),
      bLength = length(bLine, { units: "meters" }),
      aCoordinates = best.gap > 0.1 && aLength > ease * 2
        ? lineSliceAlong(aLine, 0, aLength - ease, { units: "meters" }).geometry.coordinates
        : best.aCoordinates,
      bCoordinates = best.gap > 0.1 && bLength > ease * 2
        ? lineSliceAlong(bLine, ease, bLength, { units: "meters" }).geometry.coordinates
        : best.bCoordinates,
      coordinates = [...aCoordinates, ...(best.gap < 0.1 ? bCoordinates.slice(1) : bCoordinates)];
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

function retainSharedJunctions(original: Corridor[], corridors: Corridor[]) {
  const vertices = new Map<string, { point: Position; owners: Set<Corridor> }>();
  for (const corridor of original) for (const point of corridor.geometry.coordinates) {
    const key = point.join(",");
    const entry = vertices.get(key) || { point, owners: new Set<Corridor>() };
    entry.owners.add(corridor);
    vertices.set(key, entry);
  }
  // Centering moves vertices. Restore only junctions that actually shared an
  // OSM vertex, including interior intersections; proximity alone is not proof.
  for (const { point, owners } of vertices.values()) {
    if (owners.size < 2) continue;
    const ids = new Set([...owners].flatMap(c => c.osmWayIds));
    const names = new Set([...owners].map(c => c.id));
    const candidates = corridors.flatMap(c => {
      if (!names.has(c.id) && !c.osmWayIds.some(id => ids.has(id))) return [];
      const bounds = bbox(c.geometry);
      const dy = 25 / 111195, dx = dy / Math.cos(point[1] * Math.PI / 180);
      if (point[0] < bounds[0] - dx || point[0] > bounds[2] + dx ||
          point[1] < bounds[1] - dy || point[1] > bounds[3] + dy) return [];
      const near = nearestPointOnLine(c.geometry, point, { units: "meters" });
      return near.properties.dist <= 25 ? [{ c, near }] : [];
    }).sort((a, b) => b.c.length - a.c.length);
    if (candidates.length < 2) continue;
    const anchor = candidates[0].near.geometry.coordinates;
    for (const { c } of candidates) {
      const near = nearestPointOnLine(c.geometry, anchor, { units: "meters" });
      const coordinates = c.geometry.coordinates;
      const endpoint = distance(coordinates[0], anchor, { units: "meters" }) < 25 ? 0
        : distance(coordinates.at(-1)!, anchor, { units: "meters" }) < 25 ? 1 : undefined;
      if (endpoint !== undefined) {
        easeEndpoint(c, endpoint, anchor);
        continue;
      }
      const i = near.properties.index;
      if (distance(coordinates[i], anchor, { units: "meters" }) < 0.01) coordinates[i] = anchor;
      else if (i + 1 < coordinates.length && distance(coordinates[i + 1], anchor, { units: "meters" }) < 0.01) coordinates[i + 1] = anchor;
      else coordinates.splice(i + 1, 0, anchor);
      c.length = length(lineString(coordinates), { units: "meters" });
    }
  }
}

// Move a short approach gradually to its junction, leaving the through line fixed.
function easeEndpoint(c: Corridor, end: 0 | 1, anchor: Position) {
  const coordinates = end === 0 ? c.geometry.coordinates : [...c.geometry.coordinates].reverse();
  const line = lineString(coordinates);
  const total = length(line, { units: "meters" });
  const span = Math.min(100, total / 2);
  const dx = anchor[0] - coordinates[0][0], dy = anchor[1] - coordinates[0][1];
  const approach: Position[] = [];
  for (let d = 0; d < span; d += 8) {
    const p = along(line, d, { units: "meters" }).geometry.coordinates;
    const t = d / span, weight = 1 - t * t * (3 - 2 * t);
    approach.push([p[0] + dx * weight, p[1] + dy * weight]);
  }
  const tail = lineSliceAlong(line, span, total, { units: "meters" }).geometry.coordinates;
  const joined = [...approach, ...tail];
  c.geometry = lineString(end === 0 ? joined : joined.reverse()).geometry;
  c.length = length(lineString(c.geometry.coordinates), { units: "meters" });
}

function connectCenteredBranches(corridors: Corridor[]) {
  for (const branch of [...corridors].sort((a, b) => a.length - b.length)) {
    for (const end of [0, 1] as const) {
      const p = end === 0 ? branch.geometry.coordinates[0] : branch.geometry.coordinates.at(-1)!;
      let best: { anchor: Position; gap: number; target: Corridor } | undefined;
      for (const target of corridors) {
        // Shared source ways establish a collapsed parallel-track relationship.
        // Mere proximity would also connect unrelated/grade-separated railways.
        if (target === branch || target.length <= branch.length || !target.osmWayIds.some(id => branch.osmWayIds.includes(id))) continue;
        const bounds = bbox(target.geometry), dy = 25 / 111195, dx = dy / Math.cos(p[1] * Math.PI / 180);
        if (p[0] < bounds[0] - dx || p[0] > bounds[2] + dx || p[1] < bounds[1] - dy || p[1] > bounds[3] + dy) continue;
        const near = nearestPointOnLine(target.geometry, p, { units: "meters" });
        if (near.properties.dist <= 25 && (!best || near.properties.dist < best.gap)) best = { anchor: near.geometry.coordinates, gap: near.properties.dist, target };
      }
      if (!best || best.gap < 0.01) continue;
      easeEndpoint(branch, end, best.anchor);
      const near = nearestPointOnLine(best.target.geometry, best.anchor, { units: "meters" });
      best.target.geometry.coordinates.splice(near.properties.index + 1, 0, best.anchor);
    }
  }
}

export function removeDepotTails(network: Network): Corridor[] {
  return network.corridors.filter(c => {
    if (c.length > 2500 || !/^(Connecting railway|Regional railway)$|depot|depå|verkstad|bangård/i.test(c.name)) return true;
    if (network.stations.some(s => nearestPointOnLine(c.geometry, s.coordinates, { units: "meters" }).properties.dist < 250)) return true;
    // Keep short links joining two other corridors; remove only local dead ends.
    return [c.geometry.coordinates[0], c.geometry.coordinates.at(-1)!].every(p =>
      network.corridors.some(other => other !== c && nearestPointOnLine(other.geometry, p, { units: "meters" }).properties.dist < 30));
  });
}

export function simplifyNetwork(network: Network): Network {
  const corridors = mergeConnectedCorridors(
    centerParallelTracks(network.corridors),
  );
  retainSharedJunctions(network.corridors, corridors);
  connectCenteredBranches(corridors);
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
