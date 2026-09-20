import { distance, length, lineString } from "@turf/turf";
import RBush from "rbush";
import type { Position } from "geojson";
import type { Corridor } from "./types";

// Tracks sharing a formation are close and locally aligned. Test segments,
// not whole OSM ways: parallel tracks rarely have matching way boundaries.
const WIDTH = 20;
const STEP = 15;
const COS_ANGLE = Math.cos(12 * Math.PI / 180);
interface Segment {
  minX: number; minY: number; maxX: number; maxY: number;
  a: Position; b: Position; owner: number;
}

export function centerParallelTracks(input: Corridor[]): Corridor[] {
  const tracks = [...input].sort((a, b) => b.length - a.length || a.id.localeCompare(b.id));
  const index = new RBush<Segment>();
  index.load(tracks.flatMap((c, owner) => c.geometry.coordinates.slice(1).map((b, i) => {
    const a = c.geometry.coordinates[i];
    return { a, b, owner, minX: Math.min(a[0], b[0]), minY: Math.min(a[1], b[1]),
      maxX: Math.max(a[0], b[0]), maxY: Math.max(a[1], b[1]) };
  })));

  function neighbors(p: Position, a: Position, b: Position, owner: number) {
    const sy = 111195, sx = sy * Math.cos(p[1] * Math.PI / 180);
    const vx = (b[0] - a[0]) * sx, vy = (b[1] - a[1]) * sy;
    const norm = Math.hypot(vx, vy);
    if (norm < 0.001) return [];
    const found = new Map<number, { owner: number; offset: number }>();
    for (const s of index.search({ minX: p[0] - WIDTH / sx, maxX: p[0] + WIDTH / sx,
      minY: p[1] - WIDTH / sy, maxY: p[1] + WIDTH / sy })) {
      if (s.owner === owner) continue;
      const dx = (s.b[0] - s.a[0]) * sx, dy = (s.b[1] - s.a[1]) * sy;
      const size = Math.hypot(dx, dy);
      if (size < 0.001 || Math.abs(vx * dx + vy * dy) / (norm * size) < COS_ANGLE) continue;
      const px = (p[0] - s.a[0]) * sx, py = (p[1] - s.a[1]) * sy;
      const t = (px * dx + py * dy) / (size * size);
      // Do not collapse an end-to-end continuation onto its neighbor's endpoint.
      if (t < -1e-6 || t > 1 + 1e-6) continue;
      const qx = dx * t - px, qy = dy * t - py;
      if (Math.hypot(qx, qy) > WIDTH) continue;
      const offset = (vx * qy - vy * qx) / norm;
      const old = found.get(s.owner);
      if (!old || Math.abs(offset) < Math.abs(old.offset)) found.set(s.owner, { owner: s.owner, offset });
    }
    return [...found.values()];
  }

  const result: Corridor[] = [];
  const vertices = new Set(input.flatMap(c => c.geometry.coordinates.map(p => p.join(","))));
  tracks.forEach((track, owner) => {
    const points: Position[] = [];
    track.geometry.coordinates.slice(1).forEach((b, i) => {
      const a = track.geometry.coordinates[i];
      const count = Math.max(1, Math.ceil(distance(a, b, { units: "meters" }) / STEP));
      for (let j = 0; j < count; j++) points.push([a[0] + (b[0] - a[0]) * j / count, a[1] + (b[1] - a[1]) * j / count]);
    });
    points.push(track.geometry.coordinates.at(-1)!);
    let run: Position[] = [], part = 0;
    let ids = new Set(track.osmWayIds);
    const flush = () => {
      if (run.length > 1) {
        // Drop added collinear samples; retain source vertices for junctions.
        const compact: Position[] = [];
        for (const p of run) {
          while (compact.length > 1 && !vertices.has(compact.at(-1)!.join(","))) {
            const a = compact.at(-2)!, b = compact.at(-1)!;
            const sx = Math.cos(p[1] * Math.PI / 180);
            const dx = (p[0] - a[0]) * sx, dy = p[1] - a[1];
            const bx = (b[0] - a[0]) * sx, by = b[1] - a[1];
            const norm = Math.hypot(dx, dy), dot = bx * dx + by * dy;
            if (!norm || dot < 0 || dot > norm * norm || Math.abs(dx * by - dy * bx) / norm * 111195 > 0.01) break;
            compact.pop();
          }
          compact.push(p);
        }
        const geometry = lineString(compact).geometry;
        const meters = length(lineString(compact), { units: "meters" });
        if (meters > 0.1) result.push({ ...track, id: part ? `${track.id}-part-${part}` : track.id,
          geometry, length: meters, osmWayIds: [...ids] });
        part++;
      }
      run = []; ids = new Set(track.osmWayIds);
    };
    const centered = (p: Position, a: Position, b: Position) => {
      const matches = neighbors(p, a, b, owner);
      const offsets = [0, ...matches.map(m => m.offset)];
      // Midpoint of the outer tracks, independent of track count or vertex density.
      const shift = (Math.min(...offsets) + Math.max(...offsets)) / 2;
      const sy = 111195, sx = sy * Math.cos(p[1] * Math.PI / 180);
      const dx = (b[0] - a[0]) * sx, dy = (b[1] - a[1]) * sy, n = Math.hypot(dx, dy);
      return n ? [p[0] - dy / n * shift / sx, p[1] + dx / n * shift / sy] : p;
    };
    const offsets = points.map((p, i) => {
      const q = centered(p, points[Math.max(0, i - 1)], points[Math.min(points.length - 1, i + 1)]);
      return [q[0] - p[0], q[1] - p[1]];
    });
    const chainage = [0];
    for (let i = 1; i < points.length; i++) chainage.push(chainage[i - 1] + distance(points[i - 1], points[i], { units: "meters" }));
    // Smooth only the centering displacement, preserving surveyed bends. A
    // compact cosine kernel eases formation-width changes over ~180 metres.
    const smooth = points.map((p, i) => {
      let x = 0, y = 0, weight = 0;
      let first = i;
      while (first > 0 && chainage[i] - chainage[first - 1] < 90) first--;
      for (let j = first; j < points.length && chainage[j] - chainage[i] < 90; j++) {
        const span = ((chainage[j + 1] ?? chainage[j]) - (chainage[j - 1] ?? chainage[j])) / 2;
        const w = (1 + Math.cos(Math.PI * Math.abs(chainage[j] - chainage[i]) / 90)) * span;
        x += offsets[j][0] * w; y += offsets[j][1] * w; weight += w;
      }
      return weight ? [p[0] + x / weight, p[1] + y / weight] : p;
    });
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (neighbors(mid, a, b, owner).some(m => m.owner < owner)) { flush(); continue; }
      neighbors(mid, a, b, owner).forEach(m => tracks[m.owner].osmWayIds.forEach(id => ids.add(id)));
      if (!run.length) run.push(smooth[i - 1]);
      run.push(smooth[i]);
    }
    flush();
  });
  return result;
}
