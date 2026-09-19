import RBush from "rbush";
import {
  booleanPointInPolygon,
  bbox,
  along,
  bearing,
  booleanIntersects,
  buffer,
  destination,
  feature,
  lineSliceAlong,
  lineString,
  nearestPointOnLine,
  polygon,
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

export function stationOnSections(
  station: Station,
  corridors: Corridor[],
  sections: Pick<Section, "corridorId" | "start" | "end">[],
  toleranceMeters = 60,
) {
  const stationCorridor = corridors.find((c) => c.id === station.corridorId);
  const coordinates = stationCorridor
    ? pointAt(stationCorridor, station.position)
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
  const center = pointAt(c, station.position);
  const direction = bearing(
    pointAt(c, station.position - 25),
    pointAt(c, station.position + 25),
  );
  const halfWidth = (8 + platforms * 6) / 2;
  const ends = [-length / 2, length / 2].map(
    (d) =>
      destination(center, Math.abs(d), direction + (d < 0 ? 180 : 0), {
        units: "meters",
      }).geometry.coordinates,
  );
  const corners = [
    [0, -90],
    [0, 90],
    [1, 90],
    [1, -90],
  ].map(
    ([i, angle]) =>
      destination(ends[i], halfWidth, direction + angle, { units: "meters" })
        .geometry.coordinates,
  );
  return polygon([[...corners, corners[0]]]);
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
