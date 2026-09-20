import fs from "node:fs";
import { bbox, centerOfMass, simplify } from "@turf/turf";

// Input: SCB WFS Tatorter_2023 GeoJSON requested in EPSG:4326.
const input = process.argv[2];
if (!input) throw new Error("Usage: node --import tsx scripts/prepare-places.ts <SCB towns GeoJSON>");
const data = JSON.parse(fs.readFileSync(input, "utf8"));
if (data.numberReturned !== data.totalFeatures) throw new Error("Incomplete SCB town download");
const places = data.features.map((f: any) => ({
  id: `scb-${f.properties.tatortskod}`,
  name: f.properties.tatort,
  coordinates: centerOfMass(f).geometry.coordinates.map(n => Math.round(n * 1e6) / 1e6),
  bounds: bbox(f),
  geometry: simplify(f, { tolerance: 0.0002, highQuality: true }).geometry,
})).filter((p: any) => p.name);
fs.writeFileSync("public/data/places.json", JSON.stringify({
  source: "SCB, Statistiska tätorter 2023, CC0",
  url: "https://www.scb.se/vara-tjanster/oppna-data/oppna-geodata/statistiska-tatorter/",
  fetchedAt: new Date().toISOString(), places,
}));
fs.mkdirSync("reports/data", { recursive: true });
fs.writeFileSync("reports/data/scb-town-examples.json", JSON.stringify({
  source: "SCB WFS stat:Tatorter_2023; properties copied without modification",
  examples: data.features.filter((f: any) => /^(Norrköping|Hallsberg|Kumla)$/.test(f.properties.tatort)).map((f: any) => f.properties),
}, null, 2));
console.log(`Prepared ${places.length} town names`);
