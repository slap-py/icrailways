import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
const exec = promisify(execFile);
const region = JSON.parse(fs.readFileSync("region.json", "utf8"));
const [west, south, east, north] = region.bbox;
const chunkWidth = Number(process.env.ROW_CHUNK_WIDTH || 0.8);
if (!Number.isFinite(chunkWidth) || chunkWidth <= 0) throw new Error("ROW_CHUNK_WIDTH must be positive.");
const cache = path.join(
  process.env.ROW_CACHE_DIR || path.resolve(".data-download/cache"),
  "right-of-way-" +
    createHash("sha256")
      .update(JSON.stringify({ bbox: region.bbox, country: "SE", chunkWidth }))
      .digest("hex")
      .slice(0, 12),
);
fs.mkdirSync(cache, { recursive: true });
const endpoints = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
async function query(body, file) {
  const legacy = path.join(os.tmpdir(), path.basename(cache), path.basename(file));
  if (!fs.existsSync(file) && fs.existsSync(legacy)) fs.copyFileSync(legacy, file);
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (data.elements && !data.remark) return data;
  } catch {}
  const partial = `${file}.part-${process.pid}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await exec("curl", [
        "-fsSL",
        "-A",
        "RightOfWay/0.1 (Sweden railway prototype; OpenStreetMap data import)",
        "--connect-timeout",
        "20",
        "--max-time",
        "70",
        "--data-urlencode",
        `data=[out:json][timeout:45];${body}out geom;`,
        endpoints[attempt % endpoints.length],
        "-o", partial,
      ]);
      const data = JSON.parse(fs.readFileSync(partial, "utf8"));
      if (!data.elements || data.remark)
        throw Error(data.remark || "Invalid OSM response");
      fs.renameSync(partial, file);
      return data;
    } catch {
      try { fs.unlinkSync(partial); } catch {}
      console.log(
        `OSM request retry ${attempt + 1}/5. Successful chunks are cached.`,
      );
    }
  }
  throw Error(
    `OSM is unavailable. Rerun later to resume from ${cache}. The existing bundled data is unchanged.`,
  );
}
const all = [],
  chunks = Math.ceil((east - west) / chunkWidth);
for (let i = 0; i < chunks; i++) {
  const bbox = [
    south,
    west + i * chunkWidth,
    north,
    Math.min(east, west + (i + 1) * chunkWidth),
  ]
    .map((n) => n.toFixed(5))
    .join(",");
  const result = await query(
    `area["ISO3166-1"="SE"][admin_level=2]->.sweden;(way[railway=rail](area.sweden)(${bbox});node[railway=station](area.sweden)(${bbox}););`,
    path.join(cache, `rail-${i}.json`),
  );
  all.push(...result.elements);
  console.log(`Railways: ${i + 1}/${chunks} chunks (${Math.round((i + 1) / chunks * 100)}%)`);
}
const railFile = path.join(cache, "rail.json");
fs.writeFileSync(
  railFile,
  JSON.stringify({
    elements: [...new Map(all.map((e) => [`${e.type}/${e.id}`, e])).values()],
  }),
);
const requestedOutput = process.env.ROW_OUTPUT_FILE;
const output = requestedOutput ||
  path.join("public", "data", `.sweden.json.tmp-${process.pid}`);
try {
  console.log("Preparing railway network…");
  console.log(
    (
      await exec(process.execPath, ["--import", "tsx", "scripts/prepare-data.ts"], {
        env: { ...process.env, ROW_RAIL_FILE: railFile, ROW_OUTPUT_FILE: output },
        maxBuffer: 2e6,
      })
    ).stdout,
  );
  if (process.env.ROW_RUN_VECTOR !== "0") {
    // Only a narrow band around railway corridors and station areas is downloaded.
    const childEnv = { ...process.env, ROW_OUTPUT_FILE: output };
    const child = execFile(process.execPath, [
      "--import",
      "tsx",
      "scripts/vector-details.ts",
    ], { env: childEnv });
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
    await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0 ? resolve() : reject(Error("Vector data import failed.")),
      );
    });
    console.log("Trimming building footprints to playable railway and station areas…");
    console.log(
      (
        await exec(process.execPath, ["--import", "tsx", "scripts/trim-data.ts"], {
          env: childEnv,
          maxBuffer: 2e6,
        })
      ).stdout,
    );
  }
  const completed = JSON.parse(fs.readFileSync(output, "utf8"));
  if (!completed.corridors?.length || !completed.stations?.length ||
      (process.env.ROW_RUN_VECTOR !== "0" && (!completed.buildings?.length || !completed.roads?.length)))
    throw new Error("Import is missing required map layers; existing map has not been replaced.");
  if (!requestedOutput) fs.renameSync(output, "public/data/sweden.json");
  console.log(`Complete: ${completed.corridors.length} corridors, ${completed.stations.length} stations, ${completed.buildings.length} buildings, ${completed.roads.length} roads.`);
} catch (error) {
  if (!requestedOutput) try { fs.unlinkSync(output); } catch {}
  throw error;
}
