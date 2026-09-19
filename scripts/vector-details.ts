import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import RBush from "rbush";
import { area, bbox, polygon, feature, booleanIntersects } from "@turf/turf";
import { buildingEstimate } from "../src/cost";
const Z = 14,
  N = 2 ** Z;
const region = JSON.parse(fs.readFileSync("region.json", "utf8"));
const outputFile = process.env.ROW_OUTPUT_FILE || "public/data/sweden.json";
const network = JSON.parse(fs.readFileSync(outputFile, "utf8"));
const cache = path.join(process.env.ROW_CACHE_DIR || ".data-download/cache", "vector");
fs.mkdirSync(cache, { recursive: true });
const tiles = new Set<string>();
const tx = (lon: number) => Math.floor(((lon + 180) / 360) * N),
  ty = (lat: number) =>
    Math.floor(
      ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * N,
    );
const index = new RBush(),
  stationIndex = new RBush(),
  osmIndex = new RBush();
function addBox(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  target: any,
) {
  const box = { minX, minY, maxX, maxY };
  target.insert(box);
  for (let x = tx(minX); x <= tx(maxX); x++)
    for (let y = ty(maxY); y <= ty(minY); y++) tiles.add(`${x}/${y}`);
}
for (const c of network.corridors)
  for (let i = 1; i < c.geometry.coordinates.length; i++) {
    const a = c.geometry.coordinates[i - 1],
      b = c.geometry.coordinates[i];
    const dy = 60 / 111195;
    const dx = dy / Math.cos(Math.max(Math.abs(a[1]), Math.abs(b[1])) * Math.PI / 180);
    addBox(
      Math.min(a[0], b[0]) - dx,
      Math.min(a[1], b[1]) - dy,
      Math.max(a[0], b[0]) + dx,
      Math.max(a[1], b[1]) + dy,
      index,
    );
  }
for (const s of network.stations) {
  const dy = 650 / 111195;
  const dx = dy / Math.cos(s.coordinates[1] * Math.PI / 180);
  addBox(
    s.coordinates[0] - dx,
    s.coordinates[1] - dy,
    s.coordinates[0] + dx,
    s.coordinates[1] + dy,
    stationIndex,
  );
}
for (const b of network.buildings) {
  const bb = bbox(b.geometry);
  osmIndex.insert({
    minX: bb[0],
    minY: bb[1],
    maxX: bb[2],
    maxY: bb[3],
    building: b,
  });
}
console.log("Vector tiles needed", tiles.size);
const buildings = new Map(),
  roads = new Map();
let count = 0;
const work = [...tiles];
await Promise.all(
  [0, 1, 2, 3].map(async (worker) => {
    while (work.length) {
      const key = work.shift()!;
      const [x, y] = key.split("/").map(Number);
      const path = `${cache}/${x}-${y}.mvt`;
      const legacy = `/tmp/row-vector-cache/${x}-${y}.mvt`;
      if (!fs.existsSync(path) && fs.existsSync(legacy)) fs.copyFileSync(legacy, path);
      let tile: VectorTile | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          let bytes: Buffer;
          if (fs.existsSync(path)) bytes = fs.readFileSync(path);
          else {
            const response = await fetch(
              `https://tiles-${"abcd"[worker]}.basemaps.cartocdn.com/vectortiles/carto.streets/v1/${Z}/${key}.mvt`,
              { signal: AbortSignal.timeout(20000) },
            );
            if (!response.ok) throw new Error(`Tile ${key}: HTTP ${response.status}`);
            bytes = Buffer.from(await response.arrayBuffer());
          }
          if (bytes[0] === 31 && bytes[1] === 139)
            bytes = zlib.gunzipSync(bytes);
          tile = new VectorTile(new PbfReader(bytes));
          // Cache only a successfully decoded tile, using an atomic write.
          if (!fs.existsSync(path)) {
            const partial = `${path}.part-${process.pid}`;
            fs.writeFileSync(partial, bytes);
            fs.renameSync(partial, path);
          }
          break;
        } catch (e) {
          if (fs.existsSync(path)) fs.unlinkSync(path);
          if (attempt === 2) throw e;
        }
      }
      if (!tile) throw new Error(`Could not decode tile ${key}`);
      const buildingLayer = tile.layers.building;
      for (let i = 0; i < (buildingLayer?.length || 0); i++) {
        const vf = buildingLayer.feature(i),
          f = vf.toGeoJSON(x, y, Z);
        const polys =
          f.geometry.type === "MultiPolygon"
            ? f.geometry.coordinates
            : f.geometry.type === "Polygon"
              ? [f.geometry.coordinates]
              : [];
        for (const coords of polys) {
          const shape = polygon(coords);
          const bb = bbox(shape),
            box = { minX: bb[0], minY: bb[1], maxX: bb[2], maxY: bb[3] };
          if (!index.collides(box) && !stationIndex.collides(box)) continue;
          const cx = (bb[0] + bb[2]) / 2,
            cy = (bb[1] + bb[3]) / 2;
          if (tx(cx) !== x || ty(cy) !== y) continue;
          if (
            osmIndex
              .search(box)
              .some((b: any) =>
                booleanIntersects(shape, feature(b.building.geometry)),
              )
          )
            continue;
          const id = `tile-building-${cx.toFixed(6)}-${cy.toFixed(6)}`;
          const height = Number(vf.properties.render_height);
          const estimate = buildingEstimate(
            {
              building: "unknown",
              ...(height > 0 ? { height: String(height) } : {}),
            },
            area(shape),
          );
          estimate.levelSource =
            height > 0 ? "estimated from vector height" : "type default";
          buildings.set(id, { id, geometry: shape.geometry, ...estimate });
        }
      }
      const roadLayer = tile.layers.transportation;
      for (let i = 0; i < (roadLayer?.length || 0); i++) {
        const vf = roadLayer.feature(i),
          p = vf.properties;
        const category = String(p.subclass || p.class || "");
        if (
          !/^(motorway|trunk|primary|secondary|tertiary|minor|residential|unclassified|service|living_street)$/.test(
            category,
          )
        )
          continue;
        const f = vf.toGeoJSON(x, y, Z);
        const lines =
          f.geometry.type === "MultiLineString"
            ? f.geometry.coordinates
            : f.geometry.type === "LineString"
              ? [f.geometry.coordinates]
              : [];
        for (let j = 0; j < lines.length; j++) {
          const geometry = {
              type: "LineString" as const,
              coordinates: lines[j],
            },
            bb = bbox(geometry);
          if (
            !stationIndex.collides({
              minX: bb[0],
              minY: bb[1],
              maxX: bb[2],
              maxY: bb[3],
            })
          )
            continue;
          const id = `tile-road-${key}-${vf.id}-${i}-${j}`;
          roads.set(id, {
            id,
            name: category === "minor" ? "Local road" : `${category} road`,
            highway: category,
            geometry,
          });
        }
      }
      if (++count % 100 === 0)
        console.log(
          "Tiles",
          `${count}/${tiles.size} (${Math.round(count / tiles.size * 100)}%)`,
          "buildings",
          buildings.size,
        );
    }
  }),
);
network.buildings.push(...buildings.values());
network.roads.push(...roads.values());
network.meta.bbox = region.bbox;
network.meta.fetchedAt = new Date().toISOString();
network.meta.detail =
  "OSM Overpass railways and Hallsberg building tags; Sweden-wide OSM-derived CARTO/OpenMapTiles building footprints and station roads. Vector heights are estimates; unknown building types use defaults.";
network.meta.attribution = "© OpenStreetMap contributors (ODbL 1.0), © CARTO";
fs.writeFileSync(outputFile, JSON.stringify(network));
console.log(
  "Complete",
  network.buildings.length,
  "buildings",
  network.roads.length,
  "roads",
);
