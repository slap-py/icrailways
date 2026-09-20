import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import parseOSM from "osm-pbf-parser";

const exec = promisify(execFile);
const inputArgument = process.argv[2] || process.env.ROW_PBF_FILE;
if (!inputArgument) throw new Error("Usage: npm run data:import-pbf -- <path-to-sweden.osm.pbf>");
const input = path.resolve(inputArgument);

const stat = await fs.stat(input).catch(() => undefined);
if (!stat?.isFile()) throw new Error(`PBF file not found: ${input}`);

const region = JSON.parse(await fs.readFile("region.json", "utf8"));
const [west, south, east, north] = region.bbox;
const insideRegion = ([lon, lat]) =>
  lon >= west && lon <= east && lat >= south && lat <= north;
const isTransitStop = (tags = {}) =>
  tags.highway === "bus_stop" ||
  tags.railway === "tram_stop" ||
  (tags.public_transport === "platform" && tags.train !== "yes");
const center = (coordinates) => {
  if (!coordinates.length) return undefined;
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const [lon, lat] of coordinates) {
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }
  return [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
};

async function scan(label, visit) {
  const stream = createReadStream(input);
  const parser = stream.pipe(parseOSM());
  let lastPercent = -1;
  await new Promise((resolve, reject) => {
    parser.on("data", (items) => {
      for (const item of items) visit(item);
      const percent = Math.floor((stream.bytesRead / stat.size) * 100);
      if (percent >= lastPercent + 10) {
        lastPercent = percent;
        console.log(`${label}: ${Math.min(percent, 100)}%`);
      }
    });
    parser.on("end", resolve);
    parser.on("error", reject);
    stream.on("error", reject);
  });
}

const railWays = new Map();
const stations = new Map();
const stopNodes = new Map();
const stopWays = new Map();
const stopRelations = new Map();
const relationWayIds = new Set();
const wantedNodeIds = new Set();

await scan("Indexing PBF", (item) => {
  if (item.type === "node") {
    if (!insideRegion([item.lon, item.lat])) return;
    if (item.tags?.railway === "station") stations.set(item.id, item);
    if (isTransitStop(item.tags)) stopNodes.set(item.id, item);
    return;
  }
  if (item.type === "way") {
    if (item.tags?.railway === "rail") {
      railWays.set(item.id, item);
      for (const id of item.refs) wantedNodeIds.add(id);
    }
    if (isTransitStop(item.tags)) {
      stopWays.set(item.id, item);
      for (const id of item.refs) wantedNodeIds.add(id);
    }
    return;
  }
  if (item.type === "relation" && isTransitStop(item.tags)) {
    stopRelations.set(item.id, item);
    for (const member of item.members) {
      if (member.type === "node") wantedNodeIds.add(member.id);
      if (member.type === "way") relationWayIds.add(member.id);
    }
  }
});

console.log(
  `Indexed ${railWays.size} railway ways, ${stations.size} stations, ` +
  `${stopNodes.size + stopWays.size + stopRelations.size} transit-stop objects.`,
);

const coordinates = new Map();
const relationWays = new Map();
await scan("Resolving geometry", (item) => {
  if (item.type === "node" && wantedNodeIds.has(item.id))
    coordinates.set(item.id, [item.lon, item.lat]);
  if (item.type === "way" && relationWayIds.has(item.id)) {
    relationWays.set(item.id, item.refs);
    for (const id of item.refs) wantedNodeIds.add(id);
  }
});

const unresolvedRelationNodes = new Set();
for (const refs of relationWays.values())
  for (const id of refs)
    if (!coordinates.has(id)) unresolvedRelationNodes.add(id);
if (unresolvedRelationNodes.size) {
  await scan("Resolving stop relations", (item) => {
    if (item.type === "node" && unresolvedRelationNodes.has(item.id))
      coordinates.set(item.id, [item.lon, item.lat]);
  });
}

const railElements = [];
let incompleteRailWays = 0;
for (const way of railWays.values()) {
  const geometry = way.refs.map((id) => coordinates.get(id)).filter(Boolean);
  if (geometry.length !== way.refs.length || geometry.length < 2) {
    incompleteRailWays++;
    continue;
  }
  railElements.push({
    type: "way",
    id: way.id,
    tags: way.tags,
    geometry: geometry.map(([lon, lat]) => ({ lon, lat })),
  });
}
for (const station of stations.values())
  railElements.push({
    type: "node",
    id: station.id,
    lat: station.lat,
    lon: station.lon,
    tags: station.tags,
  });
if (!railElements.length || incompleteRailWays)
  throw new Error(
    incompleteRailWays
      ? `Could not resolve ${incompleteRailWays} railway ways from the PBF.`
      : "No railway geometry was found in the PBF.",
  );

const stops = new Map();
for (const item of stopNodes.values()) {
  const point = [item.lon, item.lat];
  if (insideRegion(point)) stops.set(`node/${item.id}`, { id: `node/${item.id}`, coordinates: point });
}
for (const item of stopWays.values()) {
  const point = center(item.refs.map((id) => coordinates.get(id)).filter(Boolean));
  if (point && insideRegion(point)) stops.set(`way/${item.id}`, { id: `way/${item.id}`, coordinates: point });
}
for (const item of stopRelations.values()) {
  const points = [];
  for (const member of item.members) {
    if (member.type === "node" && coordinates.has(member.id)) points.push(coordinates.get(member.id));
    if (member.type === "way")
      for (const id of relationWays.get(member.id) || [])
        if (coordinates.has(id)) points.push(coordinates.get(id));
  }
  const point = center(points);
  if (point && insideRegion(point)) stops.set(`relation/${item.id}`, { id: `relation/${item.id}`, coordinates: point });
}
if (!stops.size) throw new Error("No public-transport stops were found in the PBF.");

const workDir = path.resolve(".data-download/pbf-import");
await fs.mkdir(workDir, { recursive: true });
const railFile = path.join(workDir, "rail.json");
const networkTemp = path.join(workDir, `sweden-${process.pid}.json`);
await fs.writeFile(railFile, JSON.stringify({ elements: railElements }));

const networkTarget = path.resolve(process.env.ROW_OUTPUT_FILE || "public/data/sweden.json");
const stopsTarget = path.resolve(process.env.ROW_STOPS_OUTPUT_FILE || "public/data/transit-stops.json");
let previous;
try { previous = JSON.parse(await fs.readFile(networkTarget, "utf8")); } catch {}

console.log("Preparing railway network from local PBF…");
const prepared = await exec(process.execPath, ["--import", "tsx", "scripts/prepare-data.ts"], {
  env: { ...process.env, ROW_RAIL_FILE: railFile, ROW_OUTPUT_FILE: networkTemp },
  maxBuffer: 4e6,
});
if (prepared.stdout.trim()) console.log(prepared.stdout.trim());

const network = JSON.parse(await fs.readFile(networkTemp, "utf8"));
if (previous) {
  network.buildings = previous.buildings || [];
  network.roads = previous.roads || [];
}
const importedAt = new Date().toISOString();
network.meta = {
  ...network.meta,
  fetchedAt: importedAt,
  sourceFile: path.basename(input),
  detail: previous
    ? "Railways and stations imported from a local Sweden OSM PBF; packaged building footprints and station-area roads retained from the previous snapshot."
    : "Railways and stations imported from a local Sweden OSM PBF.",
};

if (!network.corridors?.length || !network.stations?.length)
  throw new Error("Prepared PBF network is missing corridors or stations; existing data was not replaced.");
await fs.mkdir(path.dirname(networkTarget), { recursive: true });
await fs.writeFile(`${networkTarget}.part`, JSON.stringify(network));

const stopOutput = {
  source: "OpenStreetMap local PBF extract",
  sourceFile: path.basename(input),
  attribution: "© OpenStreetMap contributors, ODbL 1.0",
  fetchedAt: importedAt,
  coverage: "Sweden",
  detail: "Nationwide OSM bus stops, tram stops, and non-train public-transport platforms imported from the local Sweden PBF. Stop proximity does not establish a service connection.",
  stops: [...stops.values()],
};
await fs.mkdir(path.dirname(stopsTarget), { recursive: true });
await fs.writeFile(`${stopsTarget}.part`, JSON.stringify(stopOutput));
await fs.rename(`${networkTarget}.part`, networkTarget);
await fs.rename(`${stopsTarget}.part`, stopsTarget);
await fs.rm(networkTemp, { force: true });

console.log(
  `Imported ${network.corridors.length} corridors, ${network.stations.length} stations, ` +
  `${network.buildings.length} retained buildings, ${network.roads.length} retained roads, ` +
  `and ${stops.size} transit-stop objects.`,
);
