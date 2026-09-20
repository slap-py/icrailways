import { along, area, bearing, buffer, destination, distance, kinks, lineString, nearestPointOnLine, point, polygon } from "@turf/turf";
import type { Feature, LineString, Position } from "geojson";
import type { Building, Corridor, Depot, Project, Station } from "./types";
import { affectedBuildings, stationAlignedLine } from "./geometry";

type XY = [number, number];
const add = (a: XY, b: XY): XY => [a[0] + b[0], a[1] + b[1]];
const scale = (v: XY, n: number): XY => [v[0] * n, v[1] * n];
const subtract = (a: XY, b: XY): XY => [a[0] - b[0], a[1] - b[1]];
const dot = (a: XY, b: XY) => a[0] * b[0] + a[1] * b[1];
const magnitude = (v: XY) => Math.hypot(...v);
const unit = (v: XY): XY => scale(v, 1 / (magnitude(v) || 1));
const smoothstep = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

export function defaultDepotOutline(): XY[] {
  return [[35, 16], [85, 32], [250, 32], [250, 90], [85, 90], [35, 30]];
}

// Legacy saves used these settings to generate the footprint. Materialize it before deriving capacity.
export function depotOutline(depot: Depot): XY[] {
  return depot.outline || [[35, 16], [85, 32], [depot.lengthMeters, 32],
    [depot.lengthMeters, 54 + depot.tracks * 6], [85, 54 + depot.tracks * 6], [35, 30]];
}

const displayRails = new WeakMap<Corridor, { key: string; line: Feature<LineString> }>();
/** Snap to the same displayed alignment as the map, including station offsets. */
function railAnchor(corridor: Corridor, position: number, stations: Station[]) {
  const key = stations.filter(s => s.corridorId === corridor.id && s.lateralOffsetMeters)
    .map(s => `${s.id}:${s.position}:${s.lengthMeters}:${s.lateralOffsetMeters}`).join("|");
  let cached = displayRails.get(corridor);
  if (!cached || cached.key !== key) {
    cached = { key, line: stationAlignedLine(corridor, 0, corridor.length, stations) };
    displayRails.set(corridor, cached);
  }
  position = Math.max(0, Math.min(corridor.length, position));
  const atEnd = position > corridor.length - 1;
  const sample = stationAlignedLine(corridor, atEnd ? Math.max(0, position - 1) : position, atEnd ? position : Math.min(corridor.length, position + 1), stations);
  const approximate = atEnd ? sample.geometry.coordinates.at(-1)! : sample.geometry.coordinates[0];
  const snapped = nearestPointOnLine(cached.line, approximate, { units: "meters" });
  const before = along(cached.line, Math.max(0, snapped.properties.location - 10), { units: "meters" }).geometry.coordinates;
  const after = along(cached.line, snapped.properties.location + 10, { units: "meters" }).geometry.coordinates;
  return { origin: snapped.geometry.coordinates, heading: bearing(before, after) };
}

export function depotFrame(corridor: Corridor, depot: Depot, stations: Station[] = []) {
  const { origin, heading } = railAnchor(corridor, depot.position, stations);
  const direction = depot.direction || 1;
  // Longitudinal reversal is independent of which physical side of the railway the yard occupies.
  const local = (x: number, y: number) => destination(origin, Math.hypot(x, y),
    heading + Math.atan2(y * depot.side, x * direction) * 180 / Math.PI, { units: "meters" }).geometry.coordinates;
  const fromMap = (coordinates: Position): XY => {
    const meters = distance(origin, coordinates, { units: "meters" });
    const angle = (bearing(origin, coordinates) - heading) * Math.PI / 180;
    return [meters * Math.cos(angle) * direction, meters * Math.sin(angle) * depot.side];
  };
  return { origin, local, fromMap };
}

export function validDepotOutline(outline: unknown): outline is XY[] {
  if (!Array.isArray(outline) || outline.length < 3 || outline.length > 32 ||
    outline.some(p => !Array.isArray(p) || p.length !== 2 || p.some(v => !Number.isFinite(v) || Math.abs(v) > 2000))) return false;
  const ring = (outline as number[][]).map(([x, y]) => [x / 111195, y / 111195]);
  const shape = polygon([[...ring, ring[0]]]);
  return area(shape) >= 100 && !kinks(shape).features.length &&
    ring.every((p, i) => distance(p, ring[(i + 1) % ring.length], { units: "meters" }) >= 1);
}

/** Minimum bounding-rectangle axis; adding a collinear corner cannot change it. */
function yardAxis(outline: XY[]): XY {
  let best = Infinity, axis: XY = [1, 0];
  for (let i = 0; i < outline.length; i++) {
    let u = unit(subtract(outline[(i + 1) % outline.length], outline[i]));
    let v: XY = [-u[1], u[0]];
    const x = outline.map(p => dot(p, u)), y = outline.map(p => dot(p, v));
    const width = Math.max(...x) - Math.min(...x), height = Math.max(...y) - Math.min(...y);
    if (width * height >= best - 0.001) continue;
    best = width * height;
    if (height > width) u = v;
    if (u[0] < 0 || (Math.abs(u[0]) < 1e-8 && u[1] < 0)) u = scale(u, -1);
    axis = u;
  }
  return axis;
}
function spansAt(x: number, ring: XY[]): XY[] {
  const hits: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if ((a[0] > x) !== (b[0] > x)) hits.push(a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]));
  }
  hits.sort((a, b) => a - b);
  return hits.filter((_, i) => i % 2 === 0).map((lo, i) => [lo, hits[i * 2 + 1]]);
}
type BodySample = { x: number; lo: number; hi: number; center?: number };
type TrackBody = { start: number; end: number; lo: number; hi: number; width: number; score: number; samples: BodySample[] };

/**
 * Fit one shared track body. The centre of the usable band is allowed to move
 * across the footprint, so a long, curved boundary produces parallel curved
 * sidings instead of a straight chord. Every lane still progresses along the
 * stable minimum-bounding-rectangle axis, which prevents loops and crossings.
 */
function trackBody(outline: XY[]) {
  const axis = yardAxis(outline), normal: XY = [-axis[1], axis[0]];
  const ring = outline.map(p => [dot(p, axis), dot(p, normal)] as XY);
  const min = Math.min(...ring.map(p => p[0])), max = Math.max(...ring.map(p => p[0]));
  const epsilon = Math.min(0.01, (max - min) / 1000);
  const sampleCount = Math.max(49, Math.min(241, Math.ceil((max - min) / 4) + 1));
  const steps = Array.from({ length: sampleCount }, (_, i) => min + epsilon + (max - min - epsilon * 2) * i / (sampleCount - 1));
  // Include both sides of each corner, so sampling cannot skip a narrow notch.
  const xs = [...new Set([...steps, ...ring.flatMap(p => [p[0] - epsilon, p[0] + epsilon]).filter(x => x > min && x < max)])].sort((a, b) => a - b);
  const bands = xs.map(x => spansAt(x, ring));
  const requiredWidth = 8;
  let best: TrackBody | undefined;
  for (let i = 0; i < xs.length; i++) {
    for (const initial of bands[i].filter(([lo, hi]) => hi - lo >= requiredWidth)) {
      const samples: BodySample[] = [{ x: xs[i], lo: initial[0], hi: initial[1] }];
      let previous = initial;
      let minimumWidth = initial[1] - initial[0];
      for (let j = i + 1; j < xs.length; j++) {
        const candidates = bands[j].filter(([lo, hi]) => hi - lo >= requiredWidth);
        if (!candidates.length) break;
        const previousCenter = (previous[0] + previous[1]) / 2;
        const next = candidates.sort((a, b) => Math.abs((a[0] + a[1]) / 2 - previousCenter) - Math.abs((b[0] + b[1]) / 2 - previousCenter))[0];
        // A discontinuous jump means the polygon split into a different lobe.
        const dx = Math.max(epsilon, xs[j] - xs[j - 1]);
        const overlapsPrevious = next[0] <= previous[1] && next[1] >= previous[0];
        if (!overlapsPrevious && Math.abs((next[0] + next[1] - previous[0] - previous[1]) / 2) > Math.max(12, dx * 4)) break;
        samples.push({ x: xs[j], lo: next[0], hi: next[1] });
        previous = next;
        minimumWidth = Math.min(minimumWidth, next[1] - next[0]);
        if (xs[j] - xs[i] < 45) continue;
        const tracks = 1 + Math.floor((minimumWidth - requiredWidth + 1e-6) / 6);
        const score = (xs[j] - xs[i] - 4) * tracks;
        if (!best || score > best.score) {
          const narrowest = samples.reduce((a, b) => b.hi - b.lo < a.hi - a.lo ? b : a);
          best = { start: xs[i], end: xs[j], lo: narrowest.lo, hi: narrowest.hi,
            width: minimumWidth, score, samples: samples.slice() };
        }
      }
    }
  }
  if (best) {
    const half = best.width / 2;
    const centers = best.samples.map(sample => (sample.lo + sample.hi) / 2);
    const lower = best.samples.map(sample => sample.lo + half);
    const upper = best.samples.map(sample => sample.hi - half);
    const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
    // Ease toward narrowing or offset portions before reaching them. This keeps
    // the complete lane bundle inside sharp concave corners without a kink.
    for (let pass = 0; pass < 6; pass++) {
      for (let j = 1; j < centers.length; j++) {
        const reach = Math.max(0.01, (best.samples[j].x - best.samples[j - 1].x) * 0.65);
        centers[j] = clamp(centers[j], Math.max(lower[j], centers[j - 1] - reach), Math.min(upper[j], centers[j - 1] + reach));
      }
      for (let j = centers.length - 2; j >= 0; j--) {
        const reach = Math.max(0.01, (best.samples[j + 1].x - best.samples[j].x) * 0.65);
        centers[j] = clamp(centers[j], Math.max(lower[j], centers[j + 1] - reach), Math.min(upper[j], centers[j + 1] + reach));
      }
    }
    best.samples.forEach((sample, index) => { sample.center = clamp(centers[index], lower[index], upper[index]); });
  }
  return { axis, normal, body: best };
}

function bodyCenter(body: TrackBody, x: number) {
  const samples = body.samples;
  const center = (sample: BodySample) => sample.center ?? (sample.lo + sample.hi) / 2;
  if (x <= samples[0].x) return center(samples[0]);
  if (x >= samples.at(-1)!.x) return center(samples.at(-1)!);
  let hi = 1;
  while (samples[hi].x < x) hi++;
  const a = samples[hi - 1], b = samples[hi];
  const t = (x - a.x) / (b.x - a.x || 1);
  return center(a) * (1 - t) + center(b) * t;
}

const layoutCache = new WeakMap<XY[], ReturnType<typeof trackBody>>();
/** Capacity uses fixed 6 m spacing and 4 m clearance at either side, never stored settings. */
export function depotMetrics(depot: Depot) {
  const outline = depotOutline(depot);
  let layout = layoutCache.get(outline);
  if (!layout) { layout = trackBody(outline); layoutCache.set(outline, layout); }
  const widthMeters = layout.body?.width || 0;
  return { ...layout,
    tracks: layout.body ? 1 + Math.floor((widthMeters - 8 + 1e-6) / 6) : 0,
    lengthMeters: layout.body ? layout.body.end - layout.body.start - 4 : 0,
    widthMeters,
  };
}

export function normalizeDepot(depot: Depot): Depot {
  const outline = depotOutline(depot).map(([x, y]) => [x, y] as XY);
  const { tracks, lengthMeters } = depotMetrics({ ...depot, outline });
  return { ...depot, outline, tracks, lengthMeters };
}

/** A bounded cubic, tangent to the rail at one end and the yard at the other. */
function approach(a: XY, b: XY, startDirection: XY, endDirection: XY): XY[] {
  const chord = subtract(b, a), length = magnitude(chord);
  const handle = Math.min(100, length / 3);
  const orient = (v: XY) => dot(v, chord) < 0 ? scale(v, -1) : v;
  const p = add(a, scale(orient(startDirection), handle));
  const q = add(b, scale(orient(endDirection), -handle));
  const segments = Math.max(24, Math.min(120, Math.ceil(length / 4)));
  return Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments, r = 1 - t;
    return add(add(scale(a, r ** 3), scale(p, 3 * r * r * t)), add(scale(q, 3 * r * t * t), scale(b, t ** 3)));
  });
}

export function depotExit(corridor: Corridor, depot: Depot, stations: Station[] = [], target?: XY) {
  if (depot.exit) return depot.exit;
  const frame = depotFrame(corridor, depot, stations);
  const aim = target || [Math.max(...depotOutline(depot).map(p => p[0])) + 70, 0];
  const nearest = nearestPointOnLine(corridor.geometry, frame.local(...aim as XY), { units: "meters" });
  return { corridorId: corridor.id, position: Math.max(0, Math.min(corridor.length, nearest.properties.location)) };
}

export function depotGeometry(corridor: Corridor, depot: Depot, stations: Station[] = [], corridors: Corridor[] = [corridor]) {
  const frame = depotFrame(corridor, depot, stations);
  const outline = depotOutline(depot), vertices = outline.map(p => frame.local(...p));
  const { axis, normal, body, tracks, lengthMeters } = depotMetrics(depot);
  const properties = { id: depot.id, name: depot.name, tracks, label: `${depot.name}\n${tracks} tracks` };
  const footprint = polygon([[...vertices, vertices[0]]], properties);
  const xy = (u: number, v: number) => add(scale(axis, u), scale(normal, v));
  const sidings: Feature<LineString>[] = [], buffers: Feature<LineString>[] = [];
  const center = body ? bodyCenter(body, (body.start + body.end) / 2) : dot(outline[0], normal);
  const first = body ? body.start + 2 : dot(outline[0], axis);
  const last = body ? body.end - 2 : first;
  const centerAt = (u: number) => body ? bodyCenter(body, u) : center;
  const throatCenter = centerAt(first), tailCenter = centerAt(last);
  const tangentAt = (u: number): XY => {
    const delta = Math.min(3, Math.max(0.5, (last - first) / 20));
    const before = centerAt(Math.max(first, u - delta)), after = centerAt(Math.min(last, u + delta));
    return unit(add(axis, scale(normal, (after - before) / Math.max(delta, Math.min(last, u + delta) - Math.max(first, u - delta)))));
  };
  const throatDirection = tangentAt(first), tailDirection = tangentAt(last);
  const throatXY = xy(first, throatCenter), tailXY = xy(last, tailCenter);
  const throat = frame.local(...throatXY), tail = frame.local(...tailXY);
  const connector = lineString(approach([0, 0], throatXY, [1, 0], throatDirection).map(p => frame.local(...p)), properties);
  const exit = depotExit(corridor, depot, stations, add(tailXY, scale(tailDirection, 80)));
  const exitCorridor = corridors.find(c => c.id === exit.corridorId);
  const exitAnchor = exitCorridor ? railAnchor(exitCorridor, exit.position, stations) : undefined;
  const exitPoint = exitAnchor?.origin;
  const exitDirection = exitAnchor ? unit(subtract(frame.fromMap(destination(exitAnchor.origin, 10, exitAnchor.heading, { units: "meters" }).geometry.coordinates), frame.fromMap(exitAnchor.origin))) : axis;
  const exitConnector = depot.through && exitPoint ? lineString(approach(tailXY, frame.fromMap(exitPoint), tailDirection, exitDirection).map(p => frame.local(...p)), properties) : undefined;
  // Pin endpoints exactly, avoiding round-trip projection gaps.
  connector.geometry.coordinates[0] = frame.origin;
  connector.geometry.coordinates[connector.geometry.coordinates.length - 1] = throat;
  if (exitConnector) { exitConnector.geometry.coordinates[0] = tail; exitConnector.geometry.coordinates[exitConnector.geometry.coordinates.length - 1] = exitPoint!; }
  if (body) {
    const spacing = 6;
    const samples = Math.max(48, Math.ceil((last - first) / 3));
    for (let i = 0; i < tracks; i++) {
      const offset = (i - (tracks - 1) / 2) * spacing;
      const path = Array.from({ length: samples + 1 }, (_, j) => {
        const t = j / samples;
        const fan = smoothstep(t / 0.22) * (depot.through ? smoothstep((1 - t) / 0.22) : 1);
        const u = first + (last - first) * t;
        return frame.local(...xy(u, centerAt(u) + offset * fan));
      });
      path[0] = throat;
      if (depot.through) path[path.length - 1] = tail;
      sidings.push(lineString(path, properties));
      if (!depot.through) buffers.push(lineString([frame.local(...xy(last, tailCenter + offset - 1.7)), frame.local(...xy(last, tailCenter + offset + 1.7))], properties));
    }
  }
  const connections = body ? [connector, ...(exitConnector ? [exitConnector] : [])] : [];
  const impacts = [footprint, ...connections.map(line => buffer(line, 5, { units: "meters", steps: 4 })!)];
  const layoutError = !body ? "This boundary has no usable track space. Widen or lengthen the yard."
    : depot.through && exitPoint && distance(frame.origin, exitPoint, { units: "meters" }) < 10
      ? "Choose an exit connection farther from the entrance." : "";
  return { area: footprint, connector, exitConnector, connections, impacts, sidings, buffers, vertices, exit,
    layoutError, tracks, lengthMeters, axis, label: point(frame.local(...xy((first + last) / 2, centerAt((first + last) / 2))), properties) };
}

export function depotAffectedBuildings(yard: ReturnType<typeof depotGeometry>, buildings: Building[], demolished: string[]) {
  return [...new Map(yard.impacts.flatMap(shape => affectedBuildings(shape, buildings, demolished)).map(b => [b.id, b])).values()];
}

export function applyDepot(project: Project, depot: Depot, affected: Building[]): Project {
  const cleared = new Set(project.demolished);
  const acquisitions = [...new Map(affected.filter(b => !cleared.has(b.id)).map(b => [b.id, b])).values()];
  return { ...project, depots: { ...project.depots, [depot.id]: normalizeDepot({ ...depot, name: depot.name.trim() }) },
    demolished: [...new Set([...project.demolished, ...acquisitions.map(b => b.id)])],
    spent: project.spent + acquisitions.reduce((sum, b) => sum + b.estimatedCost, 0),
  };
}
