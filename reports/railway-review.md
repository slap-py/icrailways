# Railway geometry, costs, and catchment data review

Reviewed 20 September 2026. Code and bundled regional snapshot updated; nationwide download remains a separate job.

## Track area and right of way

14 m was an arbitrary prototype constant, not a verified Swedish requirement. Trafikverket's *Ostkustbanan, dubbelspår Gävle–Kringlan, samrådshandling 2017-03-24*, section 6.2, specifies at least 4.5 m between tracks and at least 15 m for the double-track area, potentially much wider with terrain. [Trafikverket source](https://bransch.trafikverket.se/contentassets/181e9220f5e24b68842e40916447c989/samradshandling_val_av_lokalisering_inkl_mkb.pdf).

That is a project cross-section, not a universal legal ROW width. Drainage, cuttings, embankments, maintenance roads, power equipment, structures and noise barriers need additional land. Curves and high speeds can require different spacing. This editor does not model those requirements.

The new **planning track-area allowances** are 10.5 / 15 / 21 / 25.5 m for 1–4 tracks: 10.5 m outside allowance plus 4.5 m within track pairs and 6 m between pairs. The source recommends aiming for at least 6 m between alternate pairs when there are more than two tracks. The 15 m double-track anchor and these spacing values come from that reference; the other overall widths are explicit extrapolations. The UI calls this a planning width. These are used consistently for construction previews and property intersections, not represented as cadastral boundaries or engineering certification.

## Cost changes

Electrification adds a transparent prototype allowance of **€250,000 per track-km**, independent of the speed multiplier. At 160 km/h, 1 km of double track costs €2.07m without overhead power and €2.57m with it. This rate is a game/planning assumption, not a tender-derived cost. Power-supply and overhead equipment are bundled into it; no operational simulation is added.

Passing/overtaking additions inherit electrification and charge only for their added track-km over electrified base sections, including selections crossing mixed sections. Ordinary track edits retain the existing replacement-work pricing rule; switching electrification on an already-built selection prices replacement works, not just a retrofit. No refunds are introduced.

## Geometry and stations

- Formation-center shifts now use a 90 m radius cosine-weighted transition applied to displacement, preserving the original surveyed bends. Abrupt changes in the number of adjacent tracks no longer immediately move the center sideways.
- Branch endpoints within 25 m can reconnect where shared original vertices or collapsed source-way relationships establish a connection. The approach is eased over up to 100 m and the through line receives the exact junction vertex. Proximity alone is insufficient for this new welding step.
- Import excludes siding, spur, yard and explicitly named depot/workshop tracks. Crossovers remain available for connectivity. Short unnamed/depot-like dead ends up to 2.5 km are removed unless they serve a station or connect at both ends. Named branch/heritage routes are retained. This is a conservative heuristic, not a complete depot inventory.
- The regenerated regional snapshot has 98 corridors, 2,824.22 km, all 136 station references, 8,984 buildings and 30,253 roads. Previously: 100 corridors and 2,825.78 km. Length differences include changed centering and joins as well as removed tails.
- New station names use the containing SCB 2023 town (simplified boundary), or the closest of its 2,017 town centroids within 15 km, plus a unique suffix. Rural locations without a nearby listed town use “New station.” Centroids approximate locality; they do not provide address-level geocoding or small hamlet coverage.
- Map station labels substitute the live preview for the saved record, so both new and existing station names change immediately and cancel restores the committed name.

Geometry changes alter corridor IDs and distances. The network key is now `centerline-network-v3`, so older saves are rejected instead of silently placing construction on changed geometry.

Verification: all 39 automated tests pass, including the real Nässjö route, exact branch endpoint connections, gradual center shifts, depot-tail preservation cases, electrified expansions and station preview replacement. The production build passes (Vite retains its existing large-bundle warning). Browser checks verified 15 m double-track planning width, the electrification price change, and both draft and built station labels updating before Apply. Test construction was not saved.

## Recommended catchment inputs

| Input | What it supplies | Use and limits |
| --- | --- | --- |
| [SCB population grids](https://www.scb.se/vara-tjanster/oppna-data/oppna-geodata/statistik-pa-rutor/) | Resident counts on 1 km polygons, age and sex groups | Use total population for reachability sums. Public 1 km data is coarser than individual neighborhoods; do not claim 250 m precision. Finer custom geodata may require a paid order. |
| [SCB towns](https://www.scb.se/vara-tjanster/oppna-data/oppna-geodata/statistiska-tatorter/) | Town polygons, names, codes, population, area | Town population context and naming; not a station catchment. 2023 boundaries and their matching population are a separate reference year from the 2025 grid. |
| [SCB small localities](https://www.scb.se/vara-tjanster/oppna-data/oppna-geodata/statistiska-smaorter/) | Polygons for settlements of 50–199 people | Complements rural coverage; do not assume every polygon has a usable town-name field. |
| [Trafiklab GTFS Sweden 3](https://www.trafiklab.se/api/gtfs-datasets/gtfs-sweden) / [GTFS Regional](https://www.trafiklab.se/sv/api/gtfs-datasets/gtfs-regional/) | Stops, routes, journeys, stop times, calendars and service exceptions | Use bus/tram/metro/ferry schedules, waits, transfers and walking access. Static Sweden data is updated daily and requires an API key. Verify regional/operator coverage. No key was available in this review, so no live Swedish GTFS sample or measured transit catchment is claimed. |
| [OpenStreetMap Sweden extract](https://download.geofabrik.de/europe/sweden.html) | Routable streets, paths, crossings, bridges, access and bicycle tags | Walk/cycle access and barriers. Retain topology and access restrictions; a road drawn near a path does not imply a crossing. ODbL attribution applies. Current bundled motor-road snippets near stations are insufficient for this graph. |

SCB open data is [CC0](https://www.scb.se/vara-tjanster/oppna-data/); the bundled town-name file retains provenance. Town centroids and simplified boundaries are derived from WFS EPSG:4326 polygons. Refresh with `node --import tsx scripts/prepare-places.ts <complete SCB GeoJSON>` and regenerate the network to incorporate the new names.

## Actual dataset outputs

Fetched from SCB WFS during this review. Full sample properties are in `data/scb-town-examples.json`, and three unmodified population features with geometry are in `data/scb-population-examples.geojson`.

| SCB town | Code | Population (2023) | Land area (ha) |
| --- | --- | ---: | ---: |
| Norrköping | 0581TC116 | 98,229 | 3,851 |
| Hallsberg | 1861TC101 | 8,321 | 975 |
| Kumla | 1881TC103 | 17,889 | 1,203 |

The live `stat:befolkning_1km_2025` layer reported 115,118 features. Example fields, copied from the first returned feature:

```json
{
  "rutid_inspire": "SE_CRS3006RES1000mN6133000E394000",
  "rutid_scb": "3940006133000",
  "rutstorl": 1000,
  "beftotalt": 7,
  "man": 4,
  "kvinna": 4,
  "referenstid": "20251231"
}
```

The next two returned grid totals are 22 and 7. The sex counts in the first record sum to 8 while the published total is 7: SCB applies statistical disclosure protection. Use `beftotalt`, not the sum of independently protected subgroups. Samples are actual dataset rows, not station catchment counts.

Reproducible sample request:

```text
https://geodata.scb.se/geoserver/stat/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=stat:befolkning_1km_2025&count=3&outputFormat=application/json&srsName=EPSG:4326
```

## Catchment calculation and proposed output

Use a multimodal travel-time calculation, not a distance circle. [Conveyal R5](https://github.com/conveyal/r5/) is an appropriate analysis engine. [OpenTripPlanner's own documentation](https://docs.opentripplanner.org/en/latest/Analysis/) recommends R5 for time-window analytics; OTP2 focuses on passenger journey planning and does not carry over the old isochrone analysis APIs.

1. Connect each candidate station entrance to legal pedestrian/cycle links. A point on the rail centerline alone does not establish pedestrian access across the tracks.
2. Build a full regional OSM street graph plus the applicable dated GTFS feeds. Do not use the editor's limited station-road layer.
3. Route **from homes to the station** for a defined weekday arrival window, and separately outward for the return journey. Include walks to stops, scheduled waits, rides, transfer walks and final access. Evaluate multiple departure times so one perfectly timed bus does not overstate coverage.
4. Evaluate walking, cycling and walk+local-transit scenarios separately, e.g. 15/30/45 minutes, plus median and conservative travel-time percentiles. Thresholds are user-selected travel budgets. Exclude the proposed railway itself from feeder access, or it would inflate its own catchment.
5. Sum reachable grid population without double-counting overlapping modes. A coarse cell-centroid method can be the baseline; finer residential-weighted sampling inside cells improves boundary allocation but must preserve the published cell total. Never assume uniform population everywhere in a 1 km square. Report uncertainty and source years.
6. For multiple stations, show unique additional coverage and overlapping coverage. Keep “town population,” “reachable residents,” and “predicted ridership” distinct; the last requires a demand model.

Illustrative output schema below — **not a measured Norrköping catchment**. Null population values intentionally indicate that GTFS/street routing has not been run:

```json
{
  "station": "Example candidate",
  "direction": "homes_to_station",
  "arrivalWindowLocal": "weekday 07:00–09:00 Europe/Stockholm",
  "populationReference": "2025-12-31",
  "scenarios": [
    { "modes": ["WALK"], "budgetMinutes": 15, "reachableResidents": null },
    { "modes": ["BICYCLE"], "budgetMinutes": 15, "reachableResidents": null },
    { "modes": ["WALK", "LOCAL_TRANSIT"], "budgetMinutes": 30,
      "reachableResidentsMedian": null, "reachableResidentsConservative": null }
  ],
  "geometryOutput": "GeoJSON MultiPolygon with reachable network and barriers respected",
  "deduplicatedResidents": null,
  "status": "requires regional street graph and dated GTFS feed"
}
```

For example, an illustrative journey with 5 minutes walking + 8 waiting + 12 on a bus + 3 walking reaches the station in 28 minutes and qualifies for a 30-minute budget. A nearby home across a river with no usable crossing may fail the same budget. Population must come from the actual reached cells, not a guessed count based on distance.
