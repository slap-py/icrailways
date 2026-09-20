// Independent display data; never modifies the railway snapshot or saved projects.
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { gunzipSync } from "node:zlib";
const exec = promisify(execFile);
const cache = ".data-download/catchment";
await fs.mkdir(cache, { recursive: true });
async function download(url, file, data) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch {}
  await exec(process.platform === "win32" ? "curl.exe" : "curl", ["-fsSL", "--retry", data ? "0" : "3", "--connect-timeout", "15", "--max-time", data ? "110" : "180", ...(data ? ["--data-urlencode", `data=${data}`] : []), url, "-o", `${file}.part`]);
  const result = JSON.parse(await fs.readFile(`${file}.part`, "utf8"));
  if (result.remark) throw Error(result.remark);
  await fs.rename(`${file}.part`, file);
  return result;
}
const tiles = new Map(), ids = new Set();
let total = Infinity;
for (let start = 0; start < total; start += 10000) {
  const params = new URLSearchParams({ service: "WFS", version: "2.0.0", request: "GetFeature", typeNames: "stat:befolkning_1km_2025", count: "10000", startIndex: String(start), sortBy: "rutid_scb", propertyName: "sp_geometry,rutid_scb,beftotalt,referenstid", outputFormat: "application/json", srsName: "EPSG:4326" });
  const page = await download(`https://geodata.scb.se/geoserver/stat/wfs?${params}`, `${cache}/population-${start}.json`);
  total = Number(page.numberMatched);
  if (!Number.isFinite(total) || !page.features?.length) throw Error("Incomplete SCB response");
  for (const f of page.features) {
    const p = f.properties;
    if (ids.has(p.rutid_scb)) throw Error("Duplicate SCB cell");
    ids.add(p.rutid_scb);
    const ring = f.geometry.coordinates[0];
    const center = [0, 1].map(axis => ring.slice(0, 4).reduce((sum, c) => sum + c[axis], 0) / 4);
    const key = `${Math.floor(center[0])}_${Math.floor(center[1])}`;
    const cell = { type: "Feature", geometry: f.geometry, properties: { id: p.rutid_scb, population: p.beftotalt, center } };
    if (!Number.isFinite(p.beftotalt) || p.beftotalt < 0) throw Error("Invalid population");
    if (!tiles.has(key)) tiles.set(key, []);
    tiles.get(key).push(cell);
  }
  console.log(`SCB: ${ids.size}/${total}`);
}
if (ids.size !== total) throw Error("SCB cell count mismatch");
await fs.mkdir("public/data/population", { recursive: true });
for (const [key, features] of tiles) await fs.writeFile(`public/data/population/${key}.json`, JSON.stringify({ type: "FeatureCollection", features }));
await fs.writeFile("public/data/population/index.json", JSON.stringify({ year: 2025, referenceDate: "2025-12-31", source: "https://www.scb.se/vara-tjanster/oppna-data/oppna-geodata/statistik-pa-rutor/", attribution: "SCB, CC0", cells: ids.size, tiles: [...tiles.keys()] }));
const elements = new Map();
const completedStrips = [];
let cachedOnly = process.argv.includes("--cached-stops");
for (let south = 55; south < 70; south += 1) {
  const bounds = `${south},10.5,${south + 1},24.5`;
  const query = `[out:json][timeout:90];area["ISO3166-1"="SE"][admin_level=2]->.se;(nwr["highway"="bus_stop"](area.se)(${bounds});nwr["railway"="tram_stop"](area.se)(${bounds});nwr["public_transport"="platform"]["train"!="yes"](area.se)(${bounds}););out center;`;
  let stops;
  try { stops = JSON.parse(await fs.readFile(`${cache}/stops-${south}.json`, "utf8")); } catch {}
  for (const endpoint of stops || cachedOnly ? [] : ["https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]) {
    try { stops = await download(endpoint, `${cache}/stops-${south}.json`, query); break; }
    catch (error) { console.warn(String(error)); }
  }
  if (!Array.isArray(stops?.elements)) { cachedOnly = true; continue; }
  for (const e of stops.elements) elements.set(`${e.type}/${e.id}`, e);
  completedStrips.push(south);
  console.log(`OSM stops: ${south - 54}/15 strips`);
}
const points = [...elements.values()].flatMap(e => {
  const c = e.center || e;
  return Number.isFinite(c.lon) && Number.isFinite(c.lat) ? [{ id: `${e.type}/${e.id}`, coordinates: [c.lon, c.lat] }] : [];
});
// Existing OSM-derived tiles provide a useful local fallback without inventing stops
// or claiming that the limited cached footprint is nationwide coverage.
const vectorStops = new Map();
const vectorDir = ".data-download/cache/vector";
let vectorFiles = [];
try { vectorFiles = (await fs.readdir(vectorDir)).filter(f => /^\d+-\d+\.mvt$/.test(f)); } catch {}
if (completedStrips.length < 15) for (const file of vectorFiles) {
  const [x, y] = file.replace(".mvt", "").split("-").map(Number);
  let bytes = await fs.readFile(`${vectorDir}/${file}`);
  if (bytes[0] === 31 && bytes[1] === 139) bytes = gunzipSync(bytes);
  const layer = new VectorTile(new PbfReader(bytes)).layers.poi;
  for (let i = 0; i < (layer?.length || 0); i++) {
    const f = layer.feature(i);
    if (!["bus_stop", "bus_station", "tram_stop"].includes(f.properties.subclass)) continue;
    const geo = f.toGeoJSON(x, y, 14);
    if (geo.geometry.type !== "Point") continue;
    const id = `carto/${f.id ?? geo.geometry.coordinates.join(",")}`;
    vectorStops.set(id, { id, coordinates: geo.geometry.coordinates });
  }
}
points.push(...vectorStops.values());
if (!points.length) throw Error("OSM stops unavailable and no cached stop points exist; existing stops file preserved");
const output = { source: "OpenStreetMap / Overpass; OSM-derived CARTO/OpenMapTiles cache", attribution: "© OpenStreetMap contributors, ODbL 1.0; © CARTO; OpenMapTiles", fetchedAt: new Date().toISOString(), coverage: completedStrips.length === 15 ? "Sweden" : "partial", completedLatitudeStrips: completedStrips, cachedVectorTiles: vectorFiles.length, detail: "Partial stop coverage uses cached map tiles near the bundled railways plus completed Overpass strips. Missing points do not establish absence of transit. Cached vector snapshot date is unknown.", stops: points };
await fs.writeFile("public/data/transit-stops.json.part", JSON.stringify(output));
await fs.rename("public/data/transit-stops.json.part", "public/data/transit-stops.json");
console.log(`Published ${ids.size} SCB cells and ${points.length} OSM stop objects.`);
