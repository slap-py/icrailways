# Right of Way

A browser-based railway construction experiment. React, TypeScript, Vite, MapLibre GL JS, and Turf. No operational simulation.

## Run

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. `npm run build` creates a static build in `dist`; `npm run preview` serves that build. The last successfully imported railway network, building footprints, and station-area road constraints are bundled. An internet connection is needed for the CARTO vector basemap and web fonts, but no API key, account, or backend is needed.

## Try the experiment

1. Choose **Build track** (shortcut **2**). Click once to place A, then click your destination to place B. You can also choose either endpoint from a station list. The creator finds a continuous route across connected data segments; it never invents B from the first click.
2. Choose **Start** or **Destination** to move that endpoint with a map click, or drag either marker onto another railway. A stays fixed when changing B. Fine-tune distances in the editor, choose 1–4 tracks and a speed, then review the amber route and apply construction to the entire path. Alt-click red building footprints for property details. **Start a new route**, ×, or Escape clears the preview.
3. **Select** (**1**) a built section to edit its track count or speed. Downgrades are allowed. A partial edit splits the stored section and preserves its neighbors.
4. **Passing section** (**3**) adds one track to a continuously built single-track section. **Overtaking section** (**4**) adds two to double track. Set section endpoints before applying. Additional tracks are stored separately and are clipped when replacement track is built over them.
5. Choose **Station** (**5**) and click a station dot, or choose a station from the list. Length and platform count change its abstract footprint. Red roads block Apply; red buildings can be acquired and demolished. **Hallsberg**, 400 m and 6 platforms, demonstrates building acquisition; expanding toward 12 platforms encounters a service-road constraint.
6. **Delete** (**6**) removes only the selected built section, or just its passing/overtaking additions. ROW remains available.
7. **Save** stores the project in this browser. **Load** explicitly restores it. **New project** clears the working project but leaves the saved version intact until Save is used again.

Committed acquisition footprints are marked as cleared sites. Their buildings are no longer charged or included in later conflict previews. Station upgrades remain visible as green footprints. Layer switches control available ROW, building footprints, and station-area roads; conflicts always remain visible.

## Data and national scope

The configured download scope is **all of Sweden**. The existing bundled snapshot remains the earlier Göteborg–Örebro region until the nationwide download completes. The map controls already support national bounds and searchable stations.

### Download Sweden in the background

Requires Node.js 22+ and `curl` on your PATH. From this project folder:

```sh
npm run data:download  # Start a detached download; returns immediately
npm run data:status    # Show stage, chunk/tile progress, and recent log output
npm run data:stop      # Stop it, keeping cached downloads for later
```

Run `npm run data:download` again to resume. Duplicate starts are ignored. You can close your terminal and Codex; the downloader uses ordinary Node.js and public data services, with no AI calls or token usage. Keep the computer awake and connected. After a reboot, rerun the start command.

The program downloads Sweden-filtered OSM railways and stations, prepares the connected network, downloads buildings near railways and roads near stations, and trims the results. Successful chunks and tiles are cached in `.data-download/cache/`; existing temporary vector tiles are reused when available. Public-server failures trigger up to eight whole-job attempts with increasing delays, reusing cached downloads. After that, status reports failure; rerun start to retry later. Per-stage percentages appear in the log (they are not an overall ETA).

Progress and errors are saved in `.data-download/download.log` and `.data-download/status.json`. On macOS/Linux, watch live with `tail -f .data-download/download.log`. The existing `public/data/sweden.json` is replaced atomically only after all stages succeed. Reload the game when status says **complete**; run `npm run build` again if serving `dist` through preview. Changing the map dataset can invalidate older browser saves.

`npm run data:fetch` runs the same import in the foreground; do not run it alongside the background job. Configure the scope name and bounds in `region.json` before starting. The importer limits railways to Sweden even when the rectangular bounds include neighboring countries. Background job tests run with `npm run data:test` and use local fixtures, with no downloads.

Railway geometry and station nodes come from OpenStreetMap through Overpass. Only `railway=rail` is accepted; abandoned/disused/construction ways are excluded naturally, and siding/spur/yard and industrial/military/test uses are filtered out. Nearby endpoints are snapped within 32 m, duplicate parallel edges with comparable lengths are grouped, and smooth continuations are chained into selectable corridors. Routing crosses those corridor boundaries using shared vertices, nearby endpoints, and station approaches within 60 m. This remains an approximate infrastructure editor: station transfers assume a connection between nearby tracks, and disconnected railways are reported rather than bridged across open terrain. No new alignment can be drawn.

Building polygons and station-area roads across the configured Swedish bounds come from **CARTO/OpenMapTiles' OSM-derived zoom-14 vector data**, packaged into the local snapshot. Hallsberg also includes an original OSM extract with building types and level/height tags. Vector data omits most building-type tags, so those properties are explicitly unknown and use prototype defaults; vector render heights are estimates, not verified OSM floor counts. Tile geometry has limited precision and may clip very large buildings. Roads include meaningful motor-road classes; paths and rail crossings away from station upgrades do not constrain construction. Grade separation is intentionally ignored.

Data: [OpenStreetMap contributors, ODbL 1.0](https://www.openstreetmap.org/copyright). Vector packaging and basemap: [CARTO](https://carto.com/attributions), [OpenMapTiles](https://openmaptiles.org/). The bundled OSM-derived data is provided under ODbL; attribution remains visible on the map. Railway and property snapshots may have different update dates.

## Prototype rules

- Track widths: 8 / 14 / 20 / 26 m, symmetric around the corridor centerline.
- Railway cost: €1m/km × track multipliers 1 / 1.8 / 2.5 / 3.1 × interpolated speed multiplier. Track changes price the selected section as replacement works; downgrades cost money and there are no refunds. Reapplying identical properties is disabled.
- Maximum speed is simply the chosen 80–320 km/h infrastructure property. Curve limits are not calculated. Passing/overtaking additions retain the underlying section speed.
- Acquisitions: footprint area × estimated levels × €1,500 × type multiplier. Original levels take precedence over height estimates, then type defaults.
- Station footprint: a centered rectangle oriented along the local corridor tangent, 100–400 m long and `8 + 6 × platforms` m wide. Platforms are abstract counts (1–12), not physical layouts.
- Any road-centerline intersection blocks a station upgrade. Building polygon intersection is a soft constraint with an acquisition cost. This is a planning prototype, not an engineering or property valuation tool.
- Save/Load is browser-local, versioned, and tied to the configured network. No accounts or cloud storage.

## Code map

- `scripts/prepare-data.ts`, `scripts/vector-details.ts`: OSM corridor grouping and data import.
- `src/MapView.tsx`: MapLibre layers, map selection, draggable snapped handles.
- `src/construction.ts`: section replacement, clipping, expansion validity, effective track counts.
- `src/geometry.ts`: track envelopes, station footprints, building intersections, road constraints.
- `src/cost.ts`: railway and property costs.
- `src/persistence.ts`: local save/load.
- `src/App.tsx`, `src/styles.css`: editor state and UI.

## Verification

`npm test` covers section splitting, downgrades, expansion continuity, clipping/deletion, widening/narrowing building impacts, acquisition exclusion, station constraints in both axes, and cost/level calculations. `npm run build` checks TypeScript and the production bundle. Browser checks cover construction, a passing section, save/load, map themes, and station property/road previews.
