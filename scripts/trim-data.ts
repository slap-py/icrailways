import fs from "node:fs";
import {
  trackAffectedBuildings,
  affectedBuildings,
  stationEnvelope,
} from "../src/geometry";
import type { Network } from "../src/types";
const outputFile = process.env.ROW_OUTPUT_FILE || "public/data/sweden.json";
const network: Network = JSON.parse(
  fs.readFileSync(outputFile, "utf8"),
);
const keep = new Set(
  network.buildings.filter((b) => !b.id.startsWith("tile-")).map((b) => b.id),
);
for (const c of network.corridors)
  for (const b of trackAffectedBuildings(
    c,
    0,
    c.length,
    60,
    network.buildings,
    [],
  ))
    keep.add(b.id);
for (const s of network.stations) {
  const c = network.corridors.find((c) => c.id === s.corridorId)!;
  for (const b of affectedBuildings(
    stationEnvelope(c, s, 450, 16),
    network.buildings,
    [],
  ))
    keep.add(b.id);
}
network.buildings = network.buildings.filter((b) => keep.has(b.id));
network.meta.bbox = JSON.parse(fs.readFileSync("region.json", "utf8")).bbox;
fs.writeFileSync(outputFile, JSON.stringify(network));
console.log(
  "Relevant coverage:",
  network.buildings.length,
  "buildings,",
  network.roads.length,
  "roads",
);
