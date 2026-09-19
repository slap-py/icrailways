import fs from "node:fs";
import { simplifyNetwork } from "../src/network";
import type { Network } from "../src/types";

const path = "public/data/sweden.json";
const network = JSON.parse(fs.readFileSync(path, "utf8")) as Network;
const cleaned = simplifyNetwork(network);
fs.writeFileSync(path, JSON.stringify(cleaned));
console.log(
  `Cleaned ${network.corridors.length} corridors to ${cleaned.corridors.length}; retained ${cleaned.stations.length} stations.`,
);
