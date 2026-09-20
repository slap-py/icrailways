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
2. After A and B are placed, clicking near either side moves the closest endpoint; either marker can also be dragged. Drag the middle of the amber route onto another ROW to add a waypoint, and click a waypoint marker to remove it. Fine-tune distances in the editor, choose 1–4 tracks, speed, and electrification, then apply construction to the entire path. Use the affected-building scroller to review and locate property impacts. **Start a new route**, ×, or Escape clears the preview.
3. **Select** (**1**) a built section to edit its track count or speed. Downgrades are allowed. A partial edit splits the stored section and preserves its neighbors.
4. **Passing section** (**3**) adds one track to a continuously built single-track section. **Overtaking section** (**4**) adds two to double track. Set section endpoints before applying. Additional tracks are stored separately and are clipped when replacement track is built over them.
5. Choose **Station** (**5**) and click any available ROW to place a fictional station. Drag its green centre handle to move it along the railway or up to 250 m beside an inaccurate mapped centreline. Drag platform ends A and B to resize in 10 m steps; **Resize both ends together** switches between centred and one-ended expansion. Edit its suggested name and platform count before building. Red roads block Apply; red buildings can be acquired and demolished. Built stations open read-only and require **Edit station** before handles or controls activate; they can also be removed with no refund. Only user-built stations appear on the map.
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

Progress and errors are saved in `.data-download/download.log` and `.data-download/status.json`. On macOS/Linux, watch live with `tail -f .data-download/download.log`. The existing `public/data/sweden.json` is replaced atomically only after all stages succeed. Reload the game when status says **complete**; run `npm run build` again if serving `dist` through preview. Changing the map dataset can invalidate older browser saves. The centerline-network-v3 dataset requires a new project because corridor IDs and distances have changed.

`npm run data:fetch` runs the same import in the foreground; do not run it alongside the background job. Configure the scope name and bounds in `region.json` before starting. The importer limits railways to Sweden even when the rectangular bounds include neighboring countries. Background job tests run with `npm run data:test` and use local fixtures, with no downloads.

To rebuild railways, reference stations, and nationwide public-transport stops from a local Sweden extract without using Overpass, run `npm run data:import-pbf -- path/to/sweden.osm.pbf`. The streaming importer accepts standard `.osm.pbf` files, retains the already-packaged building and station-road layers, and atomically replaces `public/data/sweden.json` and `public/data/transit-stops.json` only after validation succeeds.

Railway geometry and station nodes come from OpenStreetMap. The bundled snapshot was imported from a local Sweden PBF; the online refresh path uses Overpass. Only `railway=rail` is accepted; abandoned/disused/construction ways are excluded naturally, and siding/spur/yard and industrial/military/test uses are filtered out. Raw track geometry is retained until locally parallel portions within 20 m and 12 degrees are combined into one ROW midway between the outer tracks. Matching is independent of OSM way boundaries and direction; non-overlapping continuations and diverging branches remain. Original shared junctions are retained, stations are reprojected, and smooth continuations are chained into selectable corridors. This is a geometric approximation of the railway formation, not a surveyed property boundary. Routing crosses those corridor boundaries using shared vertices, nearby endpoints, and station approaches within 60 m. This remains an approximate infrastructure editor: station transfers assume a connection between nearby tracks, and disconnected railways are reported rather than bridged across open terrain. No new alignment can be drawn.

Building polygons and station-area roads across the configured Swedish bounds come from **CARTO/OpenMapTiles' OSM-derived zoom-14 vector data**, packaged into the local snapshot. Hallsberg also includes an original OSM extract with building types and level/height tags. Vector data omits most building-type tags, so those properties are explicitly unknown and use prototype defaults; vector render heights are estimates, not verified OSM floor counts. Tile geometry has limited precision and may clip very large buildings. Roads include meaningful motor-road classes; paths and rail crossings away from station upgrades do not constrain construction. Grade separation is intentionally ignored.

Data: [OpenStreetMap contributors, ODbL 1.0](https://www.openstreetmap.org/copyright). Vector packaging and basemap: [CARTO](https://carto.com/attributions), [OpenMapTiles](https://openmaptiles.org/). The bundled OSM-derived data is provided under ODbL; attribution remains visible on the map. Railway and property snapshots may have different update dates.

## Prototype rules

- Planning track-area widths: 10.5 / 15 / 21 / 25.5 m for 1–4 tracks, symmetric around the centerline. These are planning allowances, not legal ROW boundaries; terrain and engineering requirements may need more land. See reports/railway-review.md for the Trafikverket reference and extrapolation.
- Railway cost: €1m/km × track multipliers 1 / 1.8 / 2.5 / 3.1 × interpolated speed multiplier. Track changes price the selected section as replacement works; downgrades cost money and there are no refunds. Reapplying identical properties is disabled.
- Maximum speed is simply the chosen 80–320 km/h infrastructure property. Curve limits are not calculated. Passing/overtaking additions retain the underlying section speed.
- Electrification adds €250,000 per track-km as an explicit prototype estimate. Passing/overtaking additions inherit base electrification and price only additional wired track-km. It has no operating effect.
- Acquisitions: footprint area × estimated levels × €1,500 × type multiplier. Original levels take precedence over height estimates, then type defaults.
- Station footprint: a buffered slice that follows the ROW's curvature, 50–800 m long and `8 + 6 × platforms` m wide. Presets cover 100–400 m; map handles allow 10 m adjustments and one-ended extensions. A station may be shifted up to 250 m perpendicular to the ROW to correct approximate source alignment; the displayed ROW and constructed tracks ease toward that offset over 120 m approaches. Platforms are abstract counts (1–12), not physical layouts.
- Any road-centerline intersection blocks a station upgrade. Building polygon intersection is a soft constraint with an acquisition cost. This is a planning prototype, not an engineering or property valuation tool.
- Save/Load is browser-local, versioned, and tied to the configured network. No accounts or cloud storage.

## Code map

- `scripts/prepare-data.ts`, `scripts/vector-details.ts`: OSM corridor grouping and data import.
- `src/centerline.ts`, `src/network.ts`: parallel-track centerlines, corridor joins, and station reprojection.
- `src/MapView.tsx`: MapLibre layers, map selection, draggable snapped handles.
- `src/construction.ts`: section replacement, clipping, expansion validity, effective track counts.
- `src/geometry.ts`: track envelopes, station footprints, building intersections, road constraints.
- `src/cost.ts`: railway and property costs.
- `src/persistence.ts`: local save/load.
- `src/App.tsx`, `src/styles.css`: editor state and UI.

## Verification

`npm test` covers section splitting, downgrades, expansion continuity, clipping/deletion, widening/narrowing building impacts, acquisition exclusion, station constraints in both axes, and cost/level calculations. `npm run build` checks TypeScript and the production bundle. Browser checks cover construction, a passing section, save/load, map themes, and station property/road previews.

## September railway review

See [the review and catchment research](reports/railway-review.md) for width assumptions, smoother center transitions, branch welding, depot-tail filtering, actual SCB sample outputs, and a proposed multimodal catchment calculation. Station suggestions use 2,017 SCB town boundaries/centers, with live name previews on the map. SCB-derived naming data is bundled in public/data/places.json and included by the rail importer. Rebuild it using scripts/prepare-places.ts and a complete SCB WFS Tatorter_2023 EPSG:4326 GeoJSON response.

## Population and station catchment display

The population layer bundles all 115,118 published cells from SCB's `stat:befolkning_1km_2025` WFS layer (reference date 2025-12-31). Original 1 km SWEREF99TM square geometry is transformed by SCB to WGS84; it is not replaced with degree-aligned boxes. Tiles load by viewport from zoom 7; cell totals label from zoom 10 and appear in click popups. Missing/unpublished cells are not represented as zero. Use the published `beftotalt` value: disclosure protection means subgroup totals need not add up. Source: [SCB population grids](https://www.scb.se/vara-tjanster/oppna-data/oppna-geodata/statistik-pa-rutor/), CC0. OSM stop data is attributed to OpenStreetMap contributors, ODbL 1.0.

Select or preview a fictional station for its catchment. Only stations built in the project (plus the active preview) compete; reference OSM railway stations are not treated as constructed game stations. The population and catchment displays never alter costs, construction, saves, routes, or operations.

The abstract model samples each square near a station and uses cell centres farther away. Its assumptions are deliberately heuristic, not calibrated ridership predictions:

- Walking: a 1 km straight-line circle around each station, with time estimated at distance × 1.25 / 4.8 km/h. Squares within 2 km are divided into 10 × 10 equal-area samples. Each sample carries 1% of the square population; samples inside the circle use walking, while the remainder chooses cycling, feeder transit or driving. This approximates fractional circle/square overlap at about 100 m resolution and assumes uniform population within a square. It avoids awarding entire squares merely because a station lies near their boundary.
- Cycling: distance × 1.25 at 15 km/h, plus 3 minutes.
- Feeder transit: an OSM bus stop, tram stop or non-train public transport platform must be within 800 m of both the population sample (or distant cell centre) and station. Estimated access is walking to/from those stops, 8 minutes waiting, and distance × 1.3 at 30 km/h. Stop proximity does **not** establish a service connection; no timetable or route is inferred. Duplicate stop objects do not boost the score.
- Car: distance × 1.3 at 45 km/h plus `15 − min(10, nearest other station distance in km / 3)` minutes. The lower penalty for isolated stations represents a greater willingness to drive from surrounding settlements.
- Population density within 3 km provides a rural/urban proxy. Urbanity increases linearly from 0 at 100 residents/km² to 1 at 1,000 residents/km². Cycling weight increases from 0.3 to 0.8 with urbanity; car weight decreases from 0.5 to 0.4. Walking weight is 1 and feeder weight is 0.7. These are explicit prototype preferences, not measured behavioural claims. Each mode's attraction is its weight × `exp(−minutes / 18)`, with a 45-minute ceiling. Inside the walking circle, walking is preferred; outside it, the strongest mode is selected per sample. A square can contribute residents to multiple modes, and its dominant contribution sets the selected-station colour. A 40 km search bound encloses every qualifying access journey under these assumptions.
- A station receives `its attraction / (0.35 + sum of station attractions)` of each sample's population, summed back into its square. The 0.35 outside option leaves residents unallocated. Competing station shares sum to less than the population, so overlap is not double-counted. Fractional residents are summed before rounding for display; independently rounded mode subtotals can differ slightly from the displayed total.

These are coarse spatial estimates: roads, water barriers, actual entrance access, car ownership and transit schedules are not modeled. Orange squares can extend toward a nearby town for an isolated station, while stations close together split the same population. Layers offers two population-map modes: Density shows SCB population per square; All catchments shows the combined reach of every built station plus an active preview, even without a selected station. Green shading indicates the combined share and overlapping station allocations are added only once. Clicking a square reports the combined residents and strongest station. The selected-station overlay and OSM stops remain separate toggles. Calculation details live here rather than filling the station editor. If stop data cannot load, calculations use walking, cycling and car access. No routes or train operation features are added.

Refresh these display datasets independently with `node scripts/fetch-catchment.mjs`. Requires curl and network access; SCB pages and OSM latitude strips are cached under `.data-download/catchment/`. Remove the relevant cached files before requesting a fresh snapshot. Population is packaged in `public/data/population/`, and stop locations in `public/data/transit-stops.json`. The railway snapshot is untouched. Catchment regression cases run with `npm test`.


The bundled stop layer currently contains 98,153 OSM stop/platform objects with Sweden-wide extract coverage, imported from `sweden-260919.osm.pbf`. An absent or nearby stop still must not be interpreted as absent or connected service. The online catchment importer remains available for later refreshes, but an incomplete Overpass run can produce a partial layer; `node scripts/fetch-catchment.mjs --cached-stops` only repackages the available stop caches. There is no runtime dependency on Overpass.
