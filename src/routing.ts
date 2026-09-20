import { distance, nearestPointOnLine } from "@turf/turf";
import RBush from "rbush";
import type {
  Corridor,
  RouteEndpoint,
  Selection,
  SelectionPart,
  Station,
} from "./types";

const CONNECTION_DISTANCE_METERS = 60;

interface Transfer {
  a: RouteEndpoint;
  b: RouteEndpoint;
  distance: number;
}

const NO_STATIONS: Station[] = [];
const graphCache = new WeakMap<Corridor[], { stations: Station[]; links: Transfer[] }>();

function transfers(corridors: Corridor[], stations: Station[]) {
  const cached = graphCache.get(corridors);
  if (cached?.stations === stations) return cached.links;
  // Keep the along-corridor position on each indexed segment. Projecting onto
  // a nearby segment avoids rescanning a national corridor for every junction.
  type Segment = { minX: number; minY: number; maxX: number; maxY: number;
    corridorId: string; start: number; a: number[]; b: number[] };
  const segmentIndex = new RBush<Segment>();
  const segments: Segment[] = [];
  const positionsByCorridor = new Map<string, number[]>();
  for (const corridor of corridors) {
    const positions = [0];
    const points = corridor.geometry.coordinates;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      segments.push({ minX: Math.min(a[0], b[0]), minY: Math.min(a[1], b[1]),
        maxX: Math.max(a[0], b[0]), maxY: Math.max(a[1], b[1]),
        corridorId: corridor.id, start: positions[i - 1], a, b });
      positions.push(positions[i - 1] + distance(a, b, { units: "meters" }));
    }
    positionsByCorridor.set(corridor.id, positions);
  }
  segmentIndex.load(segments);
  const nearby = (coordinates: number[], exclude?: string) => {
    const dy = CONNECTION_DISTANCE_METERS / 111195;
    const dx = dy / Math.cos(coordinates[1] * Math.PI / 180);
    const nearestByCorridor = new Map<string, { endpoint: RouteEndpoint; coordinates: number[]; distance: number }>();
    for (const segment of segmentIndex.search({ minX: coordinates[0] - dx, minY: coordinates[1] - dy,
      maxX: coordinates[0] + dx, maxY: coordinates[1] + dy })) {
      if (segment.corridorId === exclude) continue;
      const nearest = nearestPointOnLine({ type: "LineString", coordinates: [segment.a, segment.b] }, coordinates, { units: "meters" });
      const previous = nearestByCorridor.get(segment.corridorId);
      if (nearest.properties.dist > CONNECTION_DISTANCE_METERS || (previous && previous.distance <= nearest.properties.dist)) continue;
      nearestByCorridor.set(segment.corridorId, {
        endpoint: { corridorId: segment.corridorId, position: segment.start + nearest.properties.location },
        coordinates: nearest.geometry.coordinates, distance: nearest.properties.dist,
      });
    }
    return [...nearestByCorridor.values()];
  };
  const result: Transfer[] = [];
  const pairs = new Map<string, Transfer[]>();
  for (const corridor of corridors) for (const position of [0, corridor.length]) {
    const coordinates = position === 0 ? corridor.geometry.coordinates[0] : corridor.geometry.coordinates.at(-1)!;
    for (const other of nearby(coordinates, corridor.id)) {
      const key = [corridor.id, other.endpoint.corridorId].sort().join("|");
      const existing = pairs.get(key) || [];
      if (existing.some(link => link.a.corridorId === other.endpoint.corridorId &&
        Math.abs(link.a.position - other.endpoint.position) < 1 && Math.abs(link.b.position - position) < 1)) continue;
      const link = { a: { corridorId: corridor.id, position }, b: other.endpoint, distance: other.distance };
      result.push(link);
      existing.push(link);
      pairs.set(key, existing);
    }
  }
  // A merged data line can run through a junction without ending there.
  // Shared vertices and station approaches retain those interior connections.
  const vertices = new Map<string, RouteEndpoint>();
  for (const corridor of corridors) {
    corridor.geometry.coordinates.forEach((coordinates, i) => {
      const position = positionsByCorridor.get(corridor.id)![i];
      const key = coordinates.join(",");
      const other = vertices.get(key);
      const here = { corridorId: corridor.id, position };
      if (other && other.corridorId !== corridor.id)
        result.push({ a: other, b: here, distance: 0 });
      else vertices.set(key, here);
    });
  }
  for (const station of stations) {
    const approaches = nearby(station.coordinates);
    for (let i = 0; i < approaches.length; i++)
      for (let j = i + 1; j < approaches.length; j++) {
        const a = approaches[i], b = approaches[j];
        const gap = distance(a.coordinates, b.coordinates, { units: "meters" });
        if (gap <= CONNECTION_DISTANCE_METERS)
          result.push({ a: a.endpoint, b: b.endpoint, distance: gap });
      }
  }
  graphCache.set(corridors, { stations, links: result });
  return result;
}

/** Prepare the reusable junction index while the network loading screen is up. */
export function prepareRouting(corridors: Corridor[], stations: Station[] = NO_STATIONS) {
  transfers(corridors, stations);
}

const nodeId = (point: RouteEndpoint) =>
  `${point.corridorId}@${point.position.toFixed(3)}`;

export function routeSelection(
  corridors: Corridor[],
  a: RouteEndpoint,
  b: RouteEndpoint,
  stations: Station[] = NO_STATIONS,
): Selection | undefined {
  for (const endpoint of [a, b]) {
    const c = corridors.find(c => c.id === endpoint.corridorId);
    if (!c || !Number.isFinite(endpoint.position) || endpoint.position < 0 || endpoint.position > c.length) return;
  }
  const links = transfers(corridors, stations);
  const positions = new Map<string, number[]>();
  for (const corridor of corridors)
    positions.set(corridor.id, [0, corridor.length]);
  for (const link of links)
    for (const point of [link.a, link.b])
      positions.get(point.corridorId)?.push(point.position);
  positions.get(a.corridorId)?.push(a.position);
  positions.get(b.corridorId)?.push(b.position);

  type Edge = {
    to: string;
    cost: number;
    part?: { corridorId: string; from: number; to: number };
  };
  const edges = new Map<string, Edge[]>();
  const add = (from: string, edge: Edge) =>
    edges.set(from, [...(edges.get(from) || []), edge]);
  for (const [corridorId, values] of positions) {
    const sorted = [...new Set(values.map((v) => +v.toFixed(3)))].sort(
      (x, y) => x - y,
    );
    for (let i = 1; i < sorted.length; i++) {
      const from = { corridorId, position: sorted[i - 1] },
        to = { corridorId, position: sorted[i] };
      add(nodeId(from), {
        to: nodeId(to),
        cost: to.position - from.position,
        part: { corridorId, from: from.position, to: to.position },
      });
      add(nodeId(to), {
        to: nodeId(from),
        cost: to.position - from.position,
        part: { corridorId, from: to.position, to: from.position },
      });
    }
  }
  for (const link of links) {
    add(nodeId(link.a), { to: nodeId(link.b), cost: link.distance });
    add(nodeId(link.b), { to: nodeId(link.a), cost: link.distance });
  }

  const start = nodeId(a),
    goal = nodeId(b),
    costs = new Map<string, number>([[start, 0]]),
    previous = new Map<string, { node: string; edge: Edge }>(),
    open = new Set([start]);
  while (open.size) {
    let current = "";
    for (const candidate of open)
      if (!current || costs.get(candidate)! < costs.get(current)!)
        current = candidate;
    if (current === goal) break;
    open.delete(current);
    for (const edge of edges.get(current) || []) {
      const next = costs.get(current)! + edge.cost;
      if (next >= (costs.get(edge.to) ?? Infinity)) continue;
      costs.set(edge.to, next);
      previous.set(edge.to, { node: current, edge });
      open.add(edge.to);
    }
  }
  if (!costs.has(goal)) return;
  const path: Edge[] = [];
  for (let node = goal; node !== start; ) {
    const step = previous.get(node);
    if (!step) return;
    path.unshift(step.edge);
    node = step.node;
  }
  const ordered = path.flatMap((edge) => (edge.part ? [edge.part] : []));
  const parts: SelectionPart[] = [];
  for (const part of ordered) {
    const last = parts.at(-1);
    const start = Math.min(part.from, part.to),
      end = Math.max(part.from, part.to);
    if (
      last?.corridorId === part.corridorId &&
      (Math.abs(last.end - start) < 1 || Math.abs(last.start - end) < 1)
    ) {
      last.start = Math.min(last.start, start);
      last.end = Math.max(last.end, end);
    }
    else if (end - start >= 0.01) parts.push({ corridorId: part.corridorId, start, end });
  }
  if (!parts.length) return;
  return { ...parts[0], parts, endpoints: [a, b] };
}

export function routeSelectionVia(
  corridors: Corridor[],
  points: RouteEndpoint[],
  stations: Station[] = NO_STATIONS,
): Selection | undefined {
  if (points.length < 2) return;
  const parts: SelectionPart[] = [];
  for (let i = 1; i < points.length; i++) {
    const leg = routeSelection(corridors, points[i - 1], points[i], stations);
    if (!leg) return;
    for (const part of selectionPartsForRoute(leg)) {
      const previous = parts.at(-1);
      if (
        previous?.corridorId === part.corridorId &&
        (Math.abs(previous.end - part.start) < 1 ||
          Math.abs(previous.start - part.end) < 1)
      ) {
        previous.start = Math.min(previous.start, part.start);
        previous.end = Math.max(previous.end, part.end);
      } else parts.push({ ...part });
    }
  }
  if (!parts.length) return;
  return {
    ...parts[0],
    parts,
    endpoints: [points[0], points.at(-1)!],
    waypoints: points.slice(1, -1),
  };
}

const selectionPartsForRoute = (selection: Selection) =>
  selection.parts?.length
    ? selection.parts
    : [{ corridorId: selection.corridorId, start: selection.start, end: selection.end }];

export function selectionEndpoints(selection: Selection): [RouteEndpoint, RouteEndpoint] {
  return (
    selection.endpoints || [
      { corridorId: selection.corridorId, position: selection.start },
      { corridorId: selection.corridorId, position: selection.end },
    ]
  );
}

