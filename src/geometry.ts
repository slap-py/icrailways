import RBush from "rbush";
import {
  booleanPointInPolygon,
  bbox,
  along,
  bearing,
  booleanIntersects,
  buffer,
  destination,
  distance,
  feature,
  lineSliceAlong,
  lineOffset,
  lineString,
  nearestPointOnLine,
} from "@turf/turf";
import type {
  Feature,
  LineString,
  Polygon,
  MultiPolygon,
  Position,
} from "geojson";
import type { Corridor, Building, Road, Section, Station } from "./types";
export const slice = (c: Corridor, start: number, end: number) =>
  lineSliceAlong(
    c.geometry,
    Math.max(0, start),
    Math.min(c.length, Math.max(start + 0.01, end)),
    { units: "meters" },
  );
export const pointAt = (c: Corridor, meters: number) =>
  along(c.geometry, Math.max(0, Math.min(c.length, meters)), {
    units: "meters",
  }).geometry.coordinates;
export const snap = (c: Corridor, coordinates: Position) =>
  Math.max(
    0,
    Math.min(
      c.length,
      nearestPointOnLine(c.geometry, coordinates, { units: "meters" })
        .properties.location,
    ),
  );

export function stationDirection(c: Corridor, position: number) {
  return bearing(pointAt(c, position - 25), pointAt(c, position + 25));
}

export function stationCenter(c: Corridor, station: Pick<Station, "position" | "lateralOffsetMeters">) {
  const onRow = pointAt(c, station.position);
  const offset = station.lateralOffsetMeters || 0;
  return offset
    ? destination(onRow, Math.abs(offset), stationDirection(c, station.position) + (offset > 0 ? 90 : -90), {
        units: "meters",
      }).geometry.coordinates
    : onRow;
}

export function stationEnds(
  c: Corridor,
  station: Pick<Station, "position" | "lateralOffsetMeters">,
  lengthMeters: number,
) {
  const coordinates = stationPlatformLine(c, station, lengthMeters).geometry.coordinates;
  return [coordinates[0], coordinates[coordinates.length - 1]];
}

export function stationPlatformLine(
  c: Corridor,
  station: Pick<Station, "position" | "lateralOffsetMeters">,
  lengthMeters: number,
) {
  const line = slice(c, station.position - lengthMeters / 2, station.position + lengthMeters / 2);
  const offset = station.lateralOffsetMeters || 0;
  return offset ? lineOffset(line, offset, { units: "meters" }) : line;
}

const corridorMeasures = new WeakMap<Corridor, { position: number; coordinates: Position }[]>();
function measuredCoordinates(c: Corridor) {
  let cached = corridorMeasures.get(c);
  if (cached) return cached;
  let meters = 0;
  cached = c.geometry.coordinates.map((coordinates, index, all) => {
    if (index) meters += distance(all[index - 1], coordinates, { units: "meters" });
    return { position: meters, coordinates };
  });
  const scale = meters ? c.length / meters : 1;
  cached = cached.map(item => ({ ...item, position: item.position * scale }));
  corridorMeasures.set(c, cached);
  return cached;
}

/** Display alignment that eases the ROW toward any laterally shifted station. */
export function stationAlignedLine(
  c: Corridor,
  start: number,
  end: number,
  stations: Station[],
  approachMeters = 120,
) {
  const relevant = stations.filter(station =>
    station.corridorId === c.id &&
    !!station.lateralOffsetMeters &&
    station.position + station.lengthMeters / 2 + approachMeters >= start &&
    station.position - station.lengthMeters / 2 - approachMeters <= end,
  );
  if (!relevant.length) return slice(c, start, end);

  const entries = measuredCoordinates(c)
    .filter(item => item.position > start && item.position < end)
    .map(item => ({ ...item }));
  entries.push({ position: start, coordinates: pointAt(c, start) });
  entries.push({ position: end, coordinates: pointAt(c, end) });
  for (const station of relevant) {
    const from = Math.max(start, station.position - station.lengthMeters / 2 - approachMeters);
    const to = Math.min(end, station.position + station.lengthMeters / 2 + approachMeters);
    for (let position = from; position <= to; position += 20)
      entries.push({ position, coordinates: pointAt(c, position) });
    for (const position of [
      station.position - station.lengthMeters / 2,
      station.position,
      station.position + station.lengthMeters / 2,
      to,
    ]) if (position >= start && position <= end)
      entries.push({ position, coordinates: pointAt(c, position) });
  }
  entries.sort((a, b) => a.position - b.position);
  const unique = entries.filter((item, index) => !index || item.position - entries[index - 1].position > 0.01);
  const coordinates = unique.map(item => {
    let strongest = 0;
    let offset = 0;
    for (const station of relevant) {
      const half = station.lengthMeters / 2;
      const distanceFromCenter = Math.abs(item.position - station.position);
      const weight = distanceFromCenter <= half
        ? 1
        : Math.max(0, 1 - (distanceFromCenter - half) / approachMeters);
      if (weight > strongest) {
        strongest = weight;
        offset = (station.lateralOffsetMeters || 0) * weight;
      }
    }
    return offset
      ? destination(item.coordinates, Math.abs(offset), stationDirection(c, item.position) + (offset > 0 ? 90 : -90), { units: "meters" }).geometry.coordinates
      : item.coordinates;
  });
  return lineString(coordinates);
}

/** Projects a freely dragged station centre onto its corridor and retains the signed lateral error. */
export function stationPlacement(c: Corridor, coordinates: Position, maxOffsetMeters = 250) {
  const position = snap(c, coordinates);
  const onRow = pointAt(c, position);
  const meters = Math.min(maxOffsetMeters, distance(onRow, coordinates, { units: "meters" }));
  if (meters < 0.1) return { position, lateralOffsetMeters: 0, coordinates: onRow };
  const direction = stationDirection(c, position);
  const right = destination(onRow, meters, direction + 90, { units: "meters" }).geometry.coordinates;
  const left = destination(onRow, meters, direction - 90, { units: "meters" }).geometry.coordinates;
  const lateralOffsetMeters = distance(right, coordinates, { units: "meters" }) <=
    distance(left, coordinates, { units: "meters" }) ? meters : -meters;
  const center = destination(onRow, meters, direction + (lateralOffsetMeters > 0 ? 90 : -90), {
    units: "meters",
  }).geometry.coordinates;
  return { position, lateralOffsetMeters, coordinates: center };
}

export function stationOnSections(
  station: Station,
  corridors: Corridor[],
  sections: Pick<Section, "corridorId" | "start" | "end">[],
  toleranceMeters = 60,
) {
  const stationCorridor = corridors.find((c) => c.id === station.corridorId);
  const coordinates = stationCorridor
    ? stationCenter(stationCorridor, station)
    : station.coordinates;
  return sections.some((section) => {
    const corridor = corridors.find((c) => c.id === section.corridorId);
    if (!corridor) return false;
    return (
      nearestPointOnLine(
        slice(corridor, section.start, section.end),
        coordinates,
        { units: "meters" },
      ).properties.dist <= toleranceMeters
    );
  });
}

// OSM commonly ends a branch a few metres beside the through track. Preserve
// those topology hints as short links once both adjoining sections are built.
export function junctionLinks(
  corridors: Corridor[],
  sections: Pick<Section, "corridorId" | "start" | "end" | "tracks">[],
  toleranceMeters = 60,
): Feature<LineString>[] {
  const corridorById = new Map(corridors.map((c) => [c.id, c]));
  const built = sections.flatMap((section) => {
    const corridor = corridorById.get(section.corridorId);
    return corridor ? [{ section, corridor, line: slice(corridor, section.start, section.end) }] : [];
  });
  const links: Feature<LineString>[] = [];
  const seen = new Set<string>();

  for (const current of built) {
    const endpoints = [
      pointAt(current.corridor, current.section.start),
      pointAt(current.corridor, current.section.end),
    ];

    for (const endpoint of endpoints) {
      let nearest:
        | { coordinates: Position; distance: number; tracks: number }
        | undefined;
      for (const other of built) {
        if (other.section.corridorId === current.section.corridorId) continue;
        const snapped = nearestPointOnLine(other.line, endpoint, {
          units: "meters",
        });
        const distance = snapped.properties.dist;
        if (
          distance <= toleranceMeters &&
          (!nearest || distance < nearest.distance)
        )
          nearest = {
            coordinates: snapped.geometry.coordinates,
            distance,
            tracks: other.section.tracks,
          };
      }
      if (!nearest || nearest.distance < 0.1) continue;
      const key = [endpoint, nearest.coordinates]
        .map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`)
        .sort()
        .join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      links.push(
        feature(lineString([endpoint, nearest.coordinates]).geometry, {
          tracks: Math.min(current.section.tracks, nearest.tracks),
        }),
      );
    }
  }
  return links;
}
export function envelope(
  c: Corridor,
  start: number,
  end: number,
  width: number,
) {
  return buffer(slice(c, start, end), width / 2, {
    units: "meters",
    steps: 4,
  })!;
}
export function stationEnvelope(
  c: Corridor,
  station: Station,
  length: number,
  platforms: number,
) {
  const halfWidth = (8 + platforms * 6) / 2;
  return buffer(stationPlatformLine(c, station, length), halfWidth, {
    units: "meters",
    steps: 4,
  })!;
}
const boundsCache = new WeakMap<object, number[]>();
function intersectsBounds(shape: number[], geometry: object) {
  let bounds = boundsCache.get(geometry);
  if (!bounds) {
    bounds = bbox(geometry as Polygon);
    boundsCache.set(geometry, bounds);
  }
  return (
    shape[0] <= bounds[2] &&
    shape[2] >= bounds[0] &&
    shape[1] <= bounds[3] &&
    shape[3] >= bounds[1]
  );
}
export function affectedBuildings(
  shape: Feature<Polygon | MultiPolygon> | undefined,
  buildings: Building[],
  demolished: string[],
) {
  if (!shape) return [];
  const removed = new Set(demolished);
  const bounds = bbox(shape);
  return buildings.filter(
    (b) =>
      !removed.has(b.id) &&
      intersectsBounds(bounds, b.geometry) &&
      booleanIntersects(shape, feature(b.geometry)),
  );
}
export function blockedRoads(
  shape: Feature<Polygon | MultiPolygon> | undefined,
  roads: Road[],
) {
  if (!shape) return [];
  const bounds = bbox(shape);
  return roads.filter(
    (r) =>
      intersectsBounds(bounds, r.geometry) &&
      booleanIntersects(shape, lineString(r.geometry.coordinates)),
  );
}

// Query short centerline segments instead of intersecting each building with a
// many-thousand-vertex regional buffer. Distances use a local metric projection.
export function trackAffectedBuildings(
  c: Corridor,
  start: number,
  end: number,
  width: number,
  buildings: Building[],
  demolished: string[],
) {
  const coordinates = slice(c, start, end).geometry.coordinates;
  const radius = width / 2;
  const segments = coordinates.slice(1).map((b, i) => {
    const a = coordinates[i],
      dy = radius / 111195,
      dx =
        dy /
        Math.cos((Math.max(Math.abs(a[1]), Math.abs(b[1])) * Math.PI) / 180);
    return {
      a,
      b,
      minX: Math.min(a[0], b[0]) - dx,
      minY: Math.min(a[1], b[1]) - dy,
      maxX: Math.max(a[0], b[0]) + dx,
      maxY: Math.max(a[1], b[1]) + dy,
    };
  });
  const tree = new RBush<(typeof segments)[number]>();
  tree.load(segments);
  const removed = new Set(demolished);
  return buildings.filter((building) => {
    if (removed.has(building.id)) return false;
    let bounds = boundsCache.get(building.geometry);
    if (!bounds) {
      bounds = bbox(building.geometry);
      boundsCache.set(building.geometry, bounds);
    }
    const candidates = tree.search({
      minX: bounds[0],
      minY: bounds[1],
      maxX: bounds[2],
      maxY: bounds[3],
    });
    if (!candidates.length) return false;
    const origin = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
    const kx = 111195 * Math.cos((origin[1] * Math.PI) / 180);
    const project = (p: Position) => [
      (p[0] - origin[0]) * kx,
      (p[1] - origin[1]) * 111195,
    ];
    const rings = (
      building.geometry.type === "Polygon"
        ? [building.geometry.coordinates]
        : building.geometry.coordinates
    )
      .flat()
      .map((ring) => ring.map(project));
    const shape = feature(building.geometry);
    return candidates.some(({ a, b }) => {
      if (booleanPointInPolygon(a, shape) || booleanPointInPolygon(b, shape))
        return true;
      const p = project(a),
        q = project(b);
      return rings.some((ring) =>
        ring
          .slice(1)
          .some((v, i) => segmentDistance(p, q, ring[i], v) <= radius),
      );
    });
  });
}
function segmentDistance(a: number[], b: number[], c: number[], d: number[]) {
  const cross = (p: number[], q: number[], r: number[]) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  if (
    cross(a, b, c) * cross(a, b, d) < 0 &&
    cross(c, d, a) * cross(c, d, b) < 0
  )
    return 0;
  const distance = (p: number[], q: number[], r: number[]) => {
    const x = r[0] - q[0],
      y = r[1] - q[1];
    const t = Math.max(
      0,
      Math.min(
        1,
        ((p[0] - q[0]) * x + (p[1] - q[1]) * y) / (x * x + y * y || 1),
      ),
    );
    return Math.hypot(p[0] - q[0] - t * x, p[1] - q[1] - t * y);
  };
  return Math.min(
    distance(a, c, d),
    distance(b, c, d),
    distance(c, a, b),
    distance(d, a, b),
  );
}
