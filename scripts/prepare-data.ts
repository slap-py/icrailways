import fs from "node:fs";
import path from "node:path";
import {
  area,
  bearing,
  distance,
  length,
  lineString,
  nearestPointOnLine,
  point,
  centerOfMass,
} from "@turf/turf";
import osmtogeojson from "osmtogeojson";
import { buildingEstimate } from "../src/cost";
import { simplifyNetwork } from "../src/network";
import type { Corridor, Station } from "../src/types";
const raw = JSON.parse(
  fs.readFileSync(process.env.ROW_RAIL_FILE || "/tmp/rail-osm.json", "utf8"),
);
const ways = raw.elements.filter(
  (e: any) =>
    e.type === "way" &&
    e.tags?.railway === "rail" &&
    e.geometry?.length > 1 &&
    !/siding|spur|yard/.test(e.tags.service || "") &&
    !/industrial|military|test/.test(e.tags.usage || ""),
);
const nodes: number[][] = [];
const buckets = new Map<string, number[]>();
function endpoint(p: number[]) {
  const x = Math.round(p[0] * 3000),
    y = Math.round(p[1] * 6000);
  for (let dx = -2; dx <= 2; dx++)
    for (let dy = -2; dy <= 2; dy++)
      for (const i of buckets.get(`${x + dx},${y + dy}`) || [])
        if (distance(p, nodes[i], { units: "meters" }) < 32) return i;
  const id = nodes.length;
  nodes.push(p);
  const key = `${x},${y}`;
  buckets.set(key, [...(buckets.get(key) || []), id]);
  return id;
}
const edges: any[] = [];
const pairs = new Map<string, any[]>();
for (const w of ways) {
  const coords = w.geometry.map((p: any) => [p.lon, p.lat]);
  const a = endpoint(coords[0]),
    b = endpoint(coords.at(-1));
  if (a === b) continue;
  const len = length(lineString(coords), { units: "meters" });
  const key = [a, b].sort((x, y) => x - y).join("-");
  const same = pairs.get(key) || [];
  const old = same.find(
    (e) => Math.abs(e.len - len) < Math.max(60, len * 0.15),
  );
  if (old) {
    old.ids.push(w.id);
    continue;
  }
  const e = {
    a,
    b,
    coords,
    len,
    ids: [w.id],
    name: w.tags.name || w.tags["railway:line"] || "",
    used: false,
  };
  edges.push(e);
  pairs.set(key, [...same, e]);
}
const adjacent = new Map<number, any[]>();
for (const e of edges)
  for (const n of [e.a, e.b]) adjacent.set(n, [...(adjacent.get(n) || []), e]);
const corridors: Corridor[] = [];
for (const first of [...edges].sort((a, b) => b.len - a.len)) {
  if (first.used) continue;
  first.used = true;
  let coords = [...first.coords],
    ids = [...first.ids],
    names = [first.name],
    total = first.len;
  function extend(front: boolean) {
    let n = front ? first.a : first.b;
    for (let k = 0; k < 2000 && total < 180000; k++) {
      const p = front ? coords[0] : coords.at(-1),
        prev = front
          ? coords[Math.min(3, coords.length - 1)]
          : coords[Math.max(0, coords.length - 4)];
      const heading = bearing(prev, p);
      let choices = (adjacent.get(n) || [])
        .filter((e) => !e.used)
        .map((e) => {
          const next = e.a === n ? e.coords : [...e.coords].reverse();
          const angle = Math.abs(
            ((bearing(next[0], next[Math.min(3, next.length - 1)]) -
              heading +
              540) %
              360) -
              180,
          );
          return { e, next, angle };
        })
        .filter((v) => v.angle < 48)
        .sort((a, b) => a.angle - b.angle);
      if (!choices.length) break;
      const { e, next } = choices[0];
      e.used = true;
      if (front) coords = [...next.slice(1).reverse(), ...coords];
      else coords = [...coords, ...next.slice(1)];
      ids.push(...e.ids);
      names.push(e.name);
      total += e.len;
      n = e.a === n ? e.b : e.a;
    }
  }
  extend(false);
  extend(true);
  if (total < 200) continue;
  const geometry = lineString(coords).geometry;
  corridors.push({
    id: `row-${Math.min(...ids)}`,
    name:
      names
        .filter(Boolean)
        .sort(
          (a, b) =>
            names.filter((v) => v === b).length -
            names.filter((v) => v === a).length,
        )[0] || "Regional railway",
    geometry,
    osmWayIds: ids,
    length: length(geometry, { units: "meters" }),
  });
}
const stations: Station[] = [];
for (const n of raw.elements.filter(
  (e: any) =>
    e.tags?.railway === "station" &&
    e.lat &&
    e.tags?.station !== "subway" &&
    e.tags?.station !== "light_rail",
)) {
  const coordinates = [n.lon, n.lat];
  let best: any;
  for (const c of corridors) {
    const near = nearestPointOnLine(c.geometry, coordinates, {
      units: "meters",
    });
    if (!best || near.properties.dist < best.d)
      best = { c, d: near.properties.dist, position: near.properties.location };
  }
  if (best?.d < 250)
    stations.push({
      id: `station-${n.id}`,
      name: n.tags.name || "Unnamed station",
      coordinates,
      corridorId: best.c.id,
      position: best.position,
      lengthMeters: 100,
      platforms: 2,
    });
}
// Name unnamed chains by their nearest station endpoints where possible.
for (const c of corridors)
  if (c.name === "Regional railway") {
    const local = stations
      .filter((s) => s.corridorId === c.id)
      .sort((a, b) => a.position - b.position);
    c.name =
      local.length > 1
        ? `${local[0].name}–${local.at(-1)!.name}`
        : local.length
          ? `${local[0].name} corridor`
          : "Connecting railway";
  }
let buildings: any[] = [],
  roads: any[] = [];
const region = JSON.parse(fs.readFileSync("region.json", "utf8"));
if (
  region.bbox[0] < 15.1 &&
  region.bbox[2] > 15.13 &&
  region.bbox[1] < 59.06 &&
  region.bbox[3] > 59.07
) {
  const detail = JSON.parse(
    fs.readFileSync("scripts/data/hallsberg-osm.json", "utf8"),
  );
  const geo = osmtogeojson(detail) as any;
  for (const f of geo.features) {
    const t = f.properties;
    if (t.building && ["Polygon", "MultiPolygon"].includes(f.geometry.type))
      buildings.push({
        id: t.id,
        geometry: f.geometry,
        ...buildingEstimate(t, area(f)),
      });
    if (
      /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$/.test(
        t.highway || "",
      ) &&
      f.geometry.type === "LineString"
    )
      roads.push({
        id: t.id,
        name: t.name || t.highway + " road",
        highway: t.highway,
        geometry: f.geometry,
      });
  }
}
const network = {
  corridors,
  stations,
  buildings,
  roads,
  meta: {
    fetchedAt: new Date().toISOString(),
    bbox: JSON.parse(fs.readFileSync("region.json", "utf8")).bbox,
    attribution: "© OpenStreetMap contributors, ODbL 1.0",
    detail:
      "Buildings within 45 m of active railway; station buildings and roads within 500 m of railway stations.",
  },
};
const cleaned = simplifyNetwork(network);
const output = process.env.ROW_OUTPUT_FILE || "public/data/sweden.json";
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(cleaned));
console.log({
  corridors: cleaned.corridors.length,
  stations: cleaned.stations.length,
  buildings: buildings.length,
  roads: roads.length,
  km: Math.round(
    cleaned.corridors.reduce((n, c) => n + c.length, 0) / 1000,
  ),
});
