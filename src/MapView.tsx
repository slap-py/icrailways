import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
maplibregl.setWorkerUrl(mapWorkerUrl);
import type { GeoJSONSource, Map as GLMap } from "maplibre-gl";
import { bbox, featureCollection, feature } from "@turf/turf";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import { BASEMAPS, REGION } from "./config";
import {
  junctionLinks,
  pointAt,
  slice,
  snap,
  stationAlignedLine,
  stationCenter,
  stationEnds,
  stationEnvelope,
} from "./geometry";
import type { Network, Project, Selection, Section, Station, RouteEndpoint, TrackCount } from "./types";
import { compactMoney } from "./cost";
import { stationPreviews } from "./stations";
import type { Catchment, TransitStop, PopulationCell, CoverageCell } from "./catchment";
import { usePopulation } from "./population";
import { selectionParts } from "./construction";
import { selectionEndpoints } from "./routing";
import { routeSelection } from "./routing";
import "maplibre-gl/dist/maplibre-gl.css";
interface Props {
  network: Network;
  project: Project;
  selection: Selection | null;
  anchor: RouteEndpoint | null;
  effective: Section[];
  preview: Feature<Polygon | MultiPolygon>[];
  previewTracks: TrackCount;
  previewElectrified: boolean;
  affected: string[];
  blocked: string[];
  dark: boolean;
  layers: { row: boolean; buildings: boolean; roads: boolean; population: boolean; catchment: boolean; transit: boolean };
  catchment: Catchment | null;
  coverage: CoverageCell[] | null;
  populationMode: "density" | "catchment";
  coverageStatus: string;
  transitStops: TransitStop[];
  station: Station | undefined;
  stationEditable: boolean;
  constructing: boolean;
  focus: { id: string; nonce: number } | null;
  onCorridor: (id: string, position: number) => void;
  onStation: (id: string) => void;
  onHandle: (end: "start" | "end", target: RouteEndpoint) => void;
  onWaypoint: (index: number, target: RouteEndpoint | null) => void;
  onStationMove: (coordinates: number[]) => void;
  onStationResize: (end: "start" | "end", position: number) => void;
  onReady: () => void;
}
export function MapView(props: Props) {
  const [populationBounds, setPopulationBounds] = useState<[number, number, number, number] | null>(null);
  const population = usePopulation(props.layers.population && props.populationMode === "density" ? populationBounds : null);
  const populationRef = useRef(population);
  const sourceData = useRef<{
    population?: PopulationCell[];
    catchment?: Catchment | null;
    stops?: TransitStop[];
    coverage?: CoverageCell[] | null;
    built?: Section[];
    builtStationKey?: string;
    preview?: Feature<Polygon | MultiPolygon>[];
    selectedKey?: string;
    stationBuilt?: Project["stations"];
    stationMarkerKey?: string;
  }>({});
  populationRef.current = population;
  const container = useRef<HTMLDivElement>(null),
    mapRef = useRef<GLMap | null>(null),
    latest = useRef(props),
    markers = useRef<maplibregl.Marker[]>([]),
    dragging = useRef(false),
    routeDrag = useRef<{ leg: number; x: number; y: number } | null>(null),
    suppressClick = useRef(false),
    styleReady = useRef(false),
    staticData = useRef<{ network?: Network; demolished?: string[]; stationGeometryKey?: string }>({});
  latest.current = props;
  const render = () => {
    const map = mapRef.current;
    if (!map || !styleReady.current) return;
    const p = latest.current;
    const corridors = new Map(p.network.corridors.map((c) => [c.id, c]));
    const displayStations = stationPreviews(p.project.stations, p.station);
    const stationGeometryKey = displayStations
      .map(s => `${s.id}:${s.corridorId}:${s.position.toFixed(2)}:${(s.lateralOffsetMeters || 0).toFixed(1)}:${s.lengthMeters}`)
      .sort().join("|");
    const stationMarkerKey = displayStations
      .map(s => `${s.id}:${s.name}:${s.platforms}:${s.id === p.station?.id ? 1 : 0}`)
      .sort().join("|") + `|${stationGeometryKey}`;
    const set = (id: string, features: Feature[]) => {
      const data = featureCollection(features);
      if (map.getSource(id)) (map.getSource(id) as GeoJSONSource).setData(data);
      else map.addSource(id, { type: "geojson", data, ...(id === "coverage" ? { attribution: 'Population © <a href="https://www.scb.se/vara-tjanster/oppna-data/oppna-geodata/statistik-pa-rutor/">SCB 2025</a> (CC0)' } : {}) });
    };
    // Display sources are independent of construction, costs and saved projects.
    const populationData = populationRef.current.cells;
    const source = map.getSource("population") as GeoJSONSource | undefined;
    if (!source) map.addSource("population", { type: "geojson", data: featureCollection(populationData), attribution: 'Population © <a href="https://www.scb.se/vara-tjanster/oppna-data/oppna-geodata/statistik-pa-rutor/">SCB 2025</a> (CC0)' });
    else if (sourceData.current.population !== populationData) source.setData(featureCollection(populationData));
    if (!map.getSource("catchment") || sourceData.current.catchment !== p.catchment) set("catchment", p.catchment?.cells || []);
    if (!map.getSource("coverage") || sourceData.current.coverage !== p.coverage) set("coverage", p.coverage || []);
    if (!map.getSource("transit-stops") || sourceData.current.stops !== p.transitStops) set("transit-stops", p.transitStops.map(s => feature({ type: "Point", coordinates: s.coordinates }, { id: s.id })));
    sourceData.current.population = populationData;
    sourceData.current.catchment = p.catchment;
    sourceData.current.stops = p.transitStops;
    sourceData.current.coverage = p.coverage;
    if (
      staticData.current.network !== p.network ||
      staticData.current.stationGeometryKey !== stationGeometryKey ||
      !map.getSource("row")
    )
      set(
        "row",
        p.network.corridors.map((c) =>
          ({
            ...stationAlignedLine(c, 0, c.length, displayStations),
            properties: { id: c.id, name: c.name },
          }),
        ),
      );
    if (
      staticData.current.network !== p.network ||
      staticData.current.demolished !== p.project.demolished ||
      !map.getSource("buildings")
    )
      set(
        "buildings",
        p.network.buildings
          .filter((b) => !p.project.demolished.includes(b.id))
          .map((b) => feature(b.geometry, { id: b.id })),
      );
    if (staticData.current.network !== p.network || !map.getSource("roads"))
      set(
        "roads",
        p.network.roads.map((r) => feature(r.geometry, { id: r.id })),
      );
    if (
      !map.getSource("built") ||
      sourceData.current.built !== p.effective ||
      sourceData.current.builtStationKey !== stationGeometryKey
    ) {
      set(
        "built",
        p.effective.flatMap((s) => {
          const c = corridors.get(s.corridorId);
          return c
            ? [
                {
                  ...stationAlignedLine(c, s.start, s.end, displayStations),
                  properties: {
                    id: c.id,
                    tracks: s.tracks,
                    speed: s.maxSpeedKph,
                    electrified: s.electrified,
                  },
                },
              ]
            : [];
        }),
      );
      set("built-links", junctionLinks(p.network.corridors, p.effective));
      sourceData.current.built = p.effective;
      sourceData.current.builtStationKey = stationGeometryKey;
    }
    if (!map.getSource("hover-point")) set("hover-point", []);
    if (!map.getSource("preview") || sourceData.current.preview !== p.preview) {
      set("preview", p.preview);
      sourceData.current.preview = p.preview;
    }
    if (
      staticData.current.network !== p.network ||
      staticData.current.demolished !== p.project.demolished ||
      !map.getSource("acquired")
    )
      set(
        "acquired",
        p.network.buildings
          .filter((b) => p.project.demolished.includes(b.id))
          .map((b) => feature(b.geometry)),
      );
    if (!map.getSource("station-built") || sourceData.current.stationBuilt !== p.project.stations) {
      set(
        "station-built",
        Object.values(p.project.stations)
          .map((s) =>
            stationEnvelope(
              corridors.get(s.corridorId)!,
              s,
              s.lengthMeters,
              s.platforms,
            ),
          ),
      );
      sourceData.current.stationBuilt = p.project.stations;
    }
    const selectedKey = `${JSON.stringify(p.selection)}|${p.previewTracks}|${p.previewElectrified ? 1 : 0}|${stationGeometryKey}`;
    if (!map.getSource("selected") || sourceData.current.selectedKey !== selectedKey) {
      const controlPoints = p.selection?.waypoints?.length
        ? [
            selectionEndpoints(p.selection)[0],
            ...p.selection.waypoints,
            selectionEndpoints(p.selection)[1],
          ]
        : [];
      const selectedFeatures = controlPoints.length
        ? controlPoints.slice(1).flatMap((point, leg) => {
            const legSelection = routeSelection(
              p.network.corridors,
              controlPoints[leg],
              point,
              p.network.stations,
            );
            return legSelection
              ? selectionParts(legSelection).flatMap((part) => {
                  const selected = corridors.get(part.corridorId);
                  return selected
                    ? [{
                        ...stationAlignedLine(selected, part.start, part.end, displayStations),
                        properties: {
                          tracks: p.previewTracks,
                          electrified: p.previewElectrified,
                          leg,
                        },
                      }]
                    : [];
                })
              : [];
          })
        : p.selection
          ? selectionParts(p.selection).flatMap((part) => {
              const selected = corridors.get(part.corridorId);
              return selected
                ? [{
                    ...stationAlignedLine(selected, part.start, part.end, displayStations),
                    properties: {
                      tracks: p.previewTracks,
                      electrified: p.previewElectrified,
                      leg: 0,
                    },
                  }]
                : [];
            })
          : [];
      set("selected", selectedFeatures);
      set("selected-links", p.selection ? junctionLinks(p.network.corridors,
        selectionParts(p.selection).map(part => ({ ...part, tracks: p.previewTracks }))) : []);
      sourceData.current.selectedKey = selectedKey;
    }
    if (!map.getSource("stations") || sourceData.current.stationMarkerKey !== stationMarkerKey) {
      set(
        "stations",
        displayStations.map((s) =>
          feature(
            {
              type: "Point",
              coordinates: stationCenter(corridors.get(s.corridorId)!, s),
            },
            {
              id: s.id,
              name: s.name,
              platforms: s.platforms,
              selected: s.id === p.station?.id,
            },
          ),
        ),
      );
      sourceData.current.stationMarkerKey = stationMarkerKey;
    }
    if (!map.getLayer("row-visible")) {
      map.addLayer({ id: "population-fill", type: "fill", source: "population", minzoom: 7,
        paint: { "fill-color": ["interpolate", ["linear"], ["get", "population"], 0, "#fff3d2", 100, "#f4d16b", 1000, "#e3933d", 5000, "#b34631", 15000, "#702434"], "fill-opacity": 0.35 } });
      map.addLayer({ id: "population-outline", type: "line", source: "population", minzoom: 7,
        paint: { "line-color": "#997b50", "line-width": 0.6, "line-opacity": 0.5 } });
      map.addLayer({ id: "coverage-fill", type: "fill", source: "coverage", minzoom: 7,
        paint: { "fill-color": "#268c75", "fill-opacity": ["+", 0.12, ["*", 0.65, ["get", "share"]]] } });
      map.addLayer({ id: "coverage-outline", type: "line", source: "coverage", minzoom: 7,
        paint: { "line-color": "#268c75", "line-width": 0.7, "line-opacity": 0.55 } });
      map.addLayer({ id: "catchment-fill", type: "fill", source: "catchment", minzoom: 7,
        paint: { "fill-color": ["match", ["get", "mode"], "walk", "#269874", "cycle", "#268ab7", "transit", "#9257bc", "#d87935"], "fill-opacity": ["*", 0.85, ["get", "share"]] } });
      map.addLayer({ id: "catchment-outline", type: "line", source: "catchment", minzoom: 7,
        paint: { "line-color": "#426d73", "line-width": 1, "line-opacity": 0.5 } });
      map.addLayer({ id: "population-labels", type: "symbol", source: "population", minzoom: 10,
        layout: { "text-field": ["to-string", ["get", "population"]], "text-font": ["Open Sans Regular"], "text-size": 11 },
        paint: { "text-color": "#403a32", "text-halo-color": "#fff", "text-halo-width": 1.5 } });
      map.addLayer({ id: "transit-stop-points", type: "circle", source: "transit-stops", minzoom: 10,
        paint: { "circle-radius": 3, "circle-color": "#9257bc", "circle-stroke-color": "#fff", "circle-stroke-width": 1 } });
      map.addLayer({
        id: "buildings-fill",
        type: "fill",
        source: "buildings",
        paint: { "fill-color": "#a9afa6", "fill-opacity": 0.32 },
      });
      map.addLayer({
        id: "acquired-fill",
        type: "fill",
        source: "acquired",
        paint: {
          "fill-color": p.dark ? "#253d30" : "#e5eddf",
          "fill-opacity": 1,
        },
      });
      map.addLayer({
        id: "acquired-outline",
        type: "line",
        source: "acquired",
        paint: {
          "line-color": "#8eaa80",
          "line-width": 1,
          "line-dasharray": [2, 2],
        },
      });
      map.addLayer({
        id: "station-built-fill",
        type: "fill",
        source: "station-built",
        paint: { "fill-color": "#37866b", "fill-opacity": 0.25 },
      });
      map.addLayer({
        id: "station-built-outline",
        type: "line",
        source: "station-built",
        paint: { "line-color": "#37866b", "line-width": 2 },
      });
      map.addLayer({
        id: "roads-visible",
        type: "line",
        source: "roads",
        paint: {
          "line-color": "#bc9670",
          "line-width": 2,
          "line-opacity": 0.55,
        },
      });
      map.addLayer({
        id: "row-visible",
        type: "line",
        source: "row",
        paint: {
          "line-color": p.dark ? "#778f8a" : "#7e918c",
          "line-width": 2,
          "line-opacity": 0.72,
        },
      });
      map.addLayer({
        id: "row-hover", type: "circle", source: "hover-point",
        paint: { "circle-radius": 5, "circle-color": "#b78538", "circle-stroke-color": "#fff", "circle-stroke-width": 2 },
      });
      map.addLayer({
        id: "row-hit",
        type: "line",
        source: "row",
        paint: { "line-color": "#000", "line-width": 30, "line-opacity": 0 },
      });
      map.addLayer({
        id: "built-casing",
        type: "line",
        source: "built",
        paint: {
          "line-color": p.dark ? "#12231f" : "#fff",
          "line-width": ["+", 4, ["*", ["get", "tracks"], 3]],
          "line-opacity": 0.95,
        },
      });
      map.addLayer({
        id: "built-links-casing",
        type: "line",
        source: "built-links",
        layout: { "line-cap": "round" },
        paint: {
          "line-color": p.dark ? "#12231f" : "#fff",
          "line-width": ["+", 5, ["*", ["get", "tracks"], 3]],
          "line-opacity": 0.95,
        },
      });
      map.addLayer({
        id: "built-links-visible",
        type: "line",
        source: "built-links",
        layout: { "line-cap": "round" },
        paint: {
          "line-color": "#14846b",
          "line-width": ["+", 2, ["*", ["get", "tracks"], 2]],
        },
      });
      for (let i = 0; i < 4; i++)
        map.addLayer({
          id: `built-${i}`,
          type: "line",
          source: "built",
          filter: [">", ["get", "tracks"], i],
          paint: {
            "line-color": "#14846b",
            "line-width": 2.2,
            "line-offset": [
              "*",
              ["-", i, ["/", ["-", ["get", "tracks"], 1], 2]],
              3,
            ],
          },
        });
      map.addLayer({
        id: "built-electrified",
        type: "line",
        source: "built",
        filter: ["==", ["get", "electrified"], true],
        paint: {
          "line-color": p.dark ? "#f0c96a" : "#75530d",
          "line-width": 1.5,
          "line-dasharray": [1, 3],
        },
      });
      // Parallel strokes preserve a legible track count at national zoom levels.
      for (let i = 0; i < 4; i++)
        map.setPaintProperty(`built-${i}`, "line-offset", [
          "*",
          ["-", i, ["/", ["-", ["get", "tracks"], 1], 2]],
          3,
        ]);
      map.addLayer({
        id: "preview-fill",
        type: "fill",
        source: "preview",
        paint: { "fill-color": "#e9ad4b", "fill-opacity": 0.35 },
      });
      map.addLayer({
        id: "preview-outline",
        type: "line",
        source: "preview",
        paint: { "line-color": "#bf8835", "line-width": 1.5 },
      });
      map.addLayer({
        id: "selected-links-visible", type: "line", source: "selected-links",
        layout: { "line-cap": "round" },
        paint: { "line-color": "#b67823", "line-width": 4 },
      });
      map.addLayer({
        id: "selected-casing",
        type: "line",
        source: "selected",
        paint: {
          "line-color": "#f3d39b",
          "line-width": ["+", 5, ["*", ["get", "tracks"], 3]],
          "line-opacity": 0.8,
        },
      });
      for (let i = 0; i < 4; i++)
        map.addLayer({
          id: `selected-${i}`,
          type: "line",
          source: "selected",
          filter: [">", ["get", "tracks"], i],
          paint: {
            "line-color": "#b67823",
            "line-width": 2,
            "line-offset": [
              "*",
              ["-", i, ["/", ["-", ["get", "tracks"], 1], 2]],
              3,
            ],
          },
        });
      map.addLayer({
        id: "selected-electrified",
        type: "line",
        source: "selected",
        filter: ["==", ["get", "electrified"], true],
        paint: {
          "line-color": "#6d4c0b",
          "line-width": 1.5,
          "line-dasharray": [1, 3],
        },
      });
      map.addLayer({
        id: "selected-hit",
        type: "line",
        source: "selected",
        paint: { "line-color": "#000", "line-width": 24, "line-opacity": 0 },
      });
      map.addLayer({
        id: "affected-fill",
        type: "fill",
        source: "buildings",
        filter: ["==", ["get", "affected"], true],
        paint: { "fill-color": "#e26c50", "fill-opacity": 0.45 },
      });
      map.addLayer({
        id: "affected-outline",
        type: "line",
        source: "buildings",
        filter: ["==", ["get", "affected"], true],
        paint: { "line-color": "#c5442f", "line-width": 2.5 },
      });
      map.addLayer({
        id: "blocked-roads",
        type: "line",
        source: "roads",
        filter: ["==", ["get", "blocked"], true],
        paint: { "line-color": "#da5149", "line-width": 5 },
      });
      map.addLayer({
        id: "station-points",
        type: "circle",
        source: "stations",
        layout: {
          "circle-sort-key": ["get", "platforms"],
        },
        paint: {
          "circle-radius": [
            "+",
            ["interpolate", ["linear"], ["zoom"],
              3, ["interpolate", ["linear"], ["get", "platforms"], 1, 3, 2, 3.5, 4, 5, 8, 7.5, 12, 10],
              8, ["interpolate", ["linear"], ["get", "platforms"], 1, 4.5, 2, 5, 4, 7, 8, 10, 12, 13],
            ],
            ["case", ["get", "selected"], 2, 0],
          ],
          "circle-color": "#fff",
          "circle-stroke-color": "#235e50",
          "circle-stroke-width": ["case", ["get", "selected"], 3, 2],
        },
      });
      map.addLayer({
        id: "station-major-labels",
        type: "symbol",
        source: "stations",
        minzoom: 5,
        maxzoom: 8.5,
        filter: [">=", ["get", "platforms"], 6],
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Open Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["get", "platforms"], 6, 10, 12, 13],
          "text-offset": [0, 1.4],
          "text-anchor": "top",
          "symbol-sort-key": ["-", 20, ["get", "platforms"]],
        },
        paint: {
          "text-color": p.dark ? "#d8e6df" : "#315448",
          "text-halo-color": p.dark ? "#202b28" : "#fff",
          "text-halo-width": 1.8,
        },
      });
      map.addLayer({
        id: "station-labels",
        type: "symbol",
        source: "stations",
        minzoom: 8.5,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Open Sans Regular"],
          "text-size": 11,
          "text-offset": [0, 1.3],
          "text-anchor": "top",
        },
        paint: {
          "text-color": p.dark ? "#d8e6df" : "#315448",
          "text-halo-color": p.dark ? "#202b28" : "#fff",
          "text-halo-width": 1.8,
        },
      });
    }
    staticData.current = {
      network: p.network,
      demolished: p.project.demolished,
      stationGeometryKey,
    };
    for (const id of ["population-fill", "population-outline", "population-labels"]) map.setLayoutProperty(id, "visibility", p.layers.population && p.populationMode === "density" ? "visible" : "none");
    for (const id of ["coverage-fill", "coverage-outline"]) map.setLayoutProperty(id, "visibility", p.layers.population && p.populationMode === "catchment" ? "visible" : "none");
    for (const id of ["catchment-fill", "catchment-outline"]) map.setLayoutProperty(id, "visibility", p.layers.catchment ? "visible" : "none");
    map.setLayoutProperty("transit-stop-points", "visibility", p.layers.transit ? "visible" : "none");
    for (const id of ["affected-fill", "affected-outline"])
      map.setFilter(id, ["in", ["get", "id"], ["literal", p.affected]]);
    map.setFilter("blocked-roads", [
      "in",
      ["get", "id"],
      ["literal", p.blocked],
    ]);
    for (const id of ["row-visible", "row-hover"])
      map.setLayoutProperty(
        id,
        "visibility",
        p.layers.row ? "visible" : "none",
      );
    map.setLayoutProperty(
      "buildings-fill",
      "visibility",
      p.layers.buildings ? "visible" : "none",
    );
    map.setLayoutProperty(
      "roads-visible",
      "visibility",
      p.layers.roads ? "visible" : "none",
    );
    map.setPaintProperty(
      "row-visible",
      "line-color",
      p.dark ? "#748c86" : "#81928b",
    );
    map.setPaintProperty(
      "built-electrified",
      "line-color",
      p.dark ? "#f0c96a" : "#75530d",
    );
  };
  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: BASEMAPS[props.dark ? "dark" : "light"],
      bounds: [
        [REGION.bbox[0], REGION.bbox[1]],
        [REGION.bbox[2], REGION.bbox[3]],
      ],
      fitBoundsOptions: {
        padding: {
          left: 75,
          right: container.current.clientWidth < 760 ? 25 : container.current.clientWidth < 900 ? 320 : 400,
          top: 130,
          bottom: container.current.clientWidth < 760 ? container.current.clientHeight * 0.43 + 40 : 140,
        },
      },
      attributionControl: { compact: true },
      // Keep the national snapshot navigable at its initial Sweden-wide extent.
      minZoom: 3,
      maxZoom: 19,
    });
    mapRef.current = map;
    const updatePopulationBounds = () => {
      if (map.getZoom() < 7) { setPopulationBounds(null); return; }
      const b = map.getBounds();
      setPopulationBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    };
    map.on("moveend", updatePopulationBounds);
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-left",
    );
    map.addControl(
      new maplibregl.ScaleControl({ unit: "metric" }),
      "bottom-left",
    );
    map.on("style.load", () => {
      styleReady.current = true;
      render();
      updatePopulationBounds();
      latest.current.onReady();
    });
    map.on("mousedown", (e) => {
      const p = latest.current;
      if (!p.selection || !p.constructing || !map.getLayer("selected-hit")) return;
      const hit = map.queryRenderedFeatures(e.point, { layers: ["selected-hit"] })[0];
      if (!hit) return;
      routeDrag.current = {
        leg: Number(hit.properties.leg) || 0,
        x: e.point.x,
        y: e.point.y,
      };
      dragging.current = true;
      map.dragPan.disable();
      map.getCanvas().style.cursor = "grabbing";
    });
    map.on("mouseup", (e) => {
      const drag = routeDrag.current;
      if (!drag) return;
      routeDrag.current = null;
      dragging.current = false;
      map.dragPan.enable();
      const moved = Math.hypot(e.point.x - drag.x, e.point.y - drag.y) > 4;
      if (!moved) return;
      suppressClick.current = true;
      const hits = map.queryRenderedFeatures(
        [[e.point.x - 20, e.point.y - 20], [e.point.x + 20, e.point.y + 20]],
        { layers: ["row-hit"] },
      );
      const candidates = [...new Set(hits.map((feature) => feature.properties.id))]
        .map((id) => {
          const corridor = latest.current.network.corridors.find((candidate) => candidate.id === id)!;
          const position = snap(corridor, e.lngLat.toArray());
          const coordinates = pointAt(corridor, position) as [number, number];
          return {
            corridorId: corridor.id,
            position,
            distance: map.project(coordinates).dist(e.point),
          };
        })
        .filter((candidate) => candidate.distance <= 30)
        .sort((a, b) => a.distance - b.distance);
      if (candidates[0]) latest.current.onWaypoint(drag.leg, candidates[0]);
    });
    map.on("click", (e) => {
      const p = latest.current;
      if (suppressClick.current) {
        suppressClick.current = false;
        return;
      }
      if (dragging.current) return;
      const hits = map.queryRenderedFeatures(e.point, {
        layers: ["affected-fill", "station-points", "row-hit"].filter(
          (id) => !!map.getLayer(id),
        ),
      });
      const building = hits.find((f) => f.layer.id === "affected-fill");
      if (building && (!p.constructing || e.originalEvent.altKey)) {
        const b = p.network.buildings.find(
          (b) => b.id === building.properties.id,
        );
        if (b) {
          const el = document.createElement("div");
          el.className = "building-popup";
          el.textContent = `${b.buildingType} · ${Math.round(b.footprintArea)} m² footprint · ${b.levels} levels (${b.levelSource}) · ${Math.round(b.footprintArea * b.levels)} m² floor area · ${compactMoney(b.estimatedCost)} acquisition`;
          new maplibregl.Popup()
            .setLngLat(e.lngLat)
            .setDOMContent(el)
            .addTo(map);
        }
        return;
      }
      const station = hits.find((f) => f.layer.id === "station-points");
      if (station && !p.constructing) {
        p.onStation(station.properties.id);
        return;
      }
      const rowHits = hits.filter((f) => f.layer.id === "row-hit");
      // Pick the rail under the pointer, never favor the previous data segment.
      const row = rowHits.map(f => {
        const c = p.network.corridors.find(c => c.id === f.properties.id)!;
        const position = snap(c, e.lngLat.toArray());
        const point = map.project(pointAt(c, position) as [number, number]);
        return { feature: f, distance: point.dist(e.point) };
      }).sort((a, b) => a.distance - b.distance)[0]?.feature;
      const selectedCorridor =
        row && p.network.corridors.find((c) => c.id === row.properties.id);
      if (selectedCorridor) {
        p.onCorridor(
          selectedCorridor.id,
          snap(selectedCorridor, e.lngLat.toArray()),
        );
        return;
      }
      const cell = map.queryRenderedFeatures(e.point, { layers: ["catchment-fill", "coverage-fill", "population-fill"].filter(id => !!map.getLayer(id)) })[0];
      if (cell) {
        const el = document.createElement("div");
        const v = cell.properties;
        el.className = "building-popup";
        el.textContent = `SCB 2025 · ${Number(v.population).toLocaleString()} residents${v.share !== undefined ? ` · ${Math.round(v.share * 100)}% ${cell.layer.id === "coverage-fill" ? "combined catchment" : "station share"} (${Math.round(v.residents).toLocaleString()} weighted residents)${v.stationName ? ` · strongest station: ${v.stationName}` : ` · ${v.mode} access`}` : ""}`;
        new maplibregl.Popup().setLngLat(e.lngLat).setDOMContent(el).addTo(map);
      }
    });
    map.on("mousemove", (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ["row-hit", "station-points", "affected-fill", "selected-hit"].filter(
          (id) => !!map.getLayer(id),
        ),
      });
      map.getCanvas().style.cursor = routeDrag.current
        ? "grabbing"
        : features.some((feature) => feature.layer.id === "selected-hit")
          ? "grab"
          : features.length ? "pointer" : "";
      const candidates = [...new Set(features.filter(f => f.layer.id === "row-hit").map(f => f.properties.id))].map(id => {
        const c = latest.current.network.corridors.find(c => c.id === id)!;
        const coordinates = pointAt(c, snap(c, e.lngLat.toArray())) as [number, number];
        return { coordinates, distance: map.project(coordinates).dist(e.point) };
      }).sort((a, b) => a.distance - b.distance);
      const source = map.getSource("hover-point") as GeoJSONSource | undefined;
      source?.setData(featureCollection(candidates[0] ? [feature({ type: "Point", coordinates: candidates[0].coordinates })] : []));

    });
    return () => {
      markers.current.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
    };
  }, []);
  useEffect(() => {
    styleReady.current = false;
    mapRef.current?.setStyle(BASEMAPS[props.dark ? "dark" : "light"], {
      diff: false,
    });
  }, [props.dark]);
  useEffect(() => {
    render();
  }, [
    props.network,
    props.project,
    props.selection,
    props.effective,
    props.preview,
    props.previewElectrified,
    props.affected,
    props.blocked,
    props.layers,
    props.station,
    props.constructing,
    props.catchment,
    props.coverage,
    props.populationMode,
    props.transitStops,
    population.cells,
  ]);
  useEffect(() => {
    const map = mapRef.current;
    markers.current.forEach(m => m.remove());
    markers.current = [];
    if (!map) return;
    if (props.station) {
      if (!props.stationEditable) return;
      const station = props.station;
      const corridor = props.network.corridors.find(candidate => candidate.id === station.corridorId);
      if (!corridor) return;
      const centerElement = document.createElement("button");
      centerElement.className = "station-move-handle";
      centerElement.textContent = "✥";
      centerElement.title = "Move station";
      centerElement.setAttribute("aria-label", "Drag to move station along or away from the railway");
      const centerMarker = new maplibregl.Marker({ element: centerElement, draggable: true })
        .setLngLat(stationCenter(corridor, station) as [number, number])
        .addTo(map);
      centerMarker.on("dragstart", () => { dragging.current = true; });
      centerMarker.on("dragend", () => {
        dragging.current = false;
        suppressClick.current = true;
        latest.current.onStationMove(centerMarker.getLngLat().toArray());
      });
      markers.current.push(centerMarker);

      stationEnds(corridor, station, station.lengthMeters).forEach((coordinates, index) => {
        const end = index === 0 ? "start" : "end";
        const element = document.createElement("button");
        element.className = "station-end-handle";
        element.textContent = index === 0 ? "A" : "B";
        element.title = `Resize platform end ${index === 0 ? "A" : "B"}`;
        element.setAttribute("aria-label", `Drag platform end ${index === 0 ? "A" : "B"}`);
        const marker = new maplibregl.Marker({ element, draggable: true })
          .setLngLat(coordinates as [number, number])
          .addTo(map);
        marker.on("dragstart", () => { dragging.current = true; });
        marker.on("dragend", () => {
          dragging.current = false;
          suppressClick.current = true;
          const position = snap(corridor, marker.getLngLat().toArray());
          marker.setLngLat(coordinates as [number, number]);
          latest.current.onStationResize(end, position);
        });
        markers.current.push(marker);
      });
      return;
    }
    const endpoints = props.selection ? selectionEndpoints(props.selection) : props.anchor ? [props.anchor] : [];
    endpoints.forEach((endpoint, i) => {
      const end = i === 0 ? "start" : "end";
      const c = props.network.corridors.find(c => c.id === endpoint.corridorId)!;
      const el = document.createElement("button");
      el.className = "section-handle";
      el.textContent = i === 0 ? "A" : "B";
      el.setAttribute("aria-label", `Drag section ${end}`);
      const marker = new maplibregl.Marker({ element: el, draggable: true })
        .setLngLat(pointAt(c, endpoint.position) as [number, number]).addTo(map);
      marker.on("dragstart", () => { dragging.current = true; });
      marker.on("dragend", () => {
        dragging.current = false;
        const point = map.project(marker.getLngLat());
        const hits = map.queryRenderedFeatures(
          [[point.x - 20, point.y - 20], [point.x + 20, point.y + 20]],
          { layers: ["row-hit"] },
        );
        const candidates = [...new Set(hits.map(f => f.properties.id))].map(id => {
          const rail = latest.current.network.corridors.find(c => c.id === id)!;
          const position = snap(rail, marker.getLngLat().toArray());
          const coordinates = pointAt(rail, position) as [number, number];
          return { corridorId: rail.id, position, coordinates, distance: map.project(coordinates).dist(point) };
        }).filter(candidate => candidate.distance <= 30).sort((a, b) => a.distance - b.distance);
        // Restore first: an invalid route must not leave a misleading marker behind.
        marker.setLngLat(pointAt(c, endpoint.position) as [number, number]);
        if (candidates[0]) latest.current.onHandle(end, candidates[0]);
      });
      markers.current.push(marker);
    });
    (props.selection?.waypoints || []).forEach((waypoint, index) => {
      const corridor = props.network.corridors.find((candidate) => candidate.id === waypoint.corridorId);
      if (!corridor) return;
      const element = document.createElement("button");
      element.className = "waypoint-handle";
      element.textContent = `W${index + 1}`;
      element.title = "Remove waypoint";
      element.setAttribute("aria-label", `Remove waypoint ${index + 1}`);
      element.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        latest.current.onWaypoint(index, null);
      });
      const marker = new maplibregl.Marker({ element })
        .setLngLat(pointAt(corridor, waypoint.position) as [number, number])
        .addTo(map);
      markers.current.push(marker);
    });
  }, [
    props.selection,
    props.anchor,
    props.station?.id,
    props.station?.position,
    props.station?.lateralOffsetMeters,
    props.station?.lengthMeters,
    props.stationEditable,
    props.network,
  ]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !props.focus) return;
    map.setPadding({ left: 0, right: 0, top: 0, bottom: 0 });
    const s = props.project.stations[props.focus.id] ||
      (props.station?.id === props.focus.id ? props.station : undefined);
    if (s) {
      const c = props.network.corridors.find((c) => c.id === s.corridorId)!;
      const shape =
        props.preview[0] || stationEnvelope(c, s, s.lengthMeters, s.platforms);
      const bounds = bbox(shape);
      map.fitBounds(
        [
          [bounds[0], bounds[1]],
          [bounds[2], bounds[3]],
        ],
        {
            padding: {
            left: 80,
            right: map.getContainer().clientWidth < 760 ? 25 : map.getContainer().clientWidth < 900 ? 330 : 400,
            top: 180,
            bottom: map.getContainer().clientWidth < 760 ? map.getContainer().clientHeight * 0.43 + 40 : 170,
          },
          maxZoom: 15.5,
          duration: 700,
        },
      );
    } else {
      const building = props.network.buildings.find((candidate) => candidate.id === props.focus!.id);
      if (building) {
        const bounds = bbox(building.geometry);
        map.fitBounds(
          [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
          {
            padding: { left: 80, right: map.getContainer().clientWidth < 760 ? 25 : 400, top: 150, bottom: 140 },
            maxZoom: 18,
            duration: 650,
          },
        );
        return;
      }
      const c = props.network.corridors.find((c) => c.id === props.focus!.id);
      if (c) {
        const coords = props.selection
          ? selectionParts(props.selection).flatMap((part) => {
              const routeCorridor = props.network.corridors.find(
                (candidate) => candidate.id === part.corridorId,
              );
              return routeCorridor
                ? slice(routeCorridor, part.start, part.end).geometry.coordinates
                : [];
            })
          : c.geometry.coordinates;
        const bounds = new maplibregl.LngLatBounds();
        coords.forEach((p) => bounds.extend(p as [number, number]));
        map.fitBounds(bounds, {
            padding: {
            left: 85,
            right: map.getContainer().clientWidth < 760 ? 25 : map.getContainer().clientWidth < 900 ? 330 : 420,
            top: 160,
            bottom: map.getContainer().clientWidth < 760 ? map.getContainer().clientHeight * 0.43 + 40 : 140,
          },
          maxZoom: 15,
          duration: 900,
        });
      }
    }
  }, [props.focus]);
  return (
    <>
    <div
      className="map"
      ref={container}
      aria-label="Interactive railway construction map"
    />
    {(props.layers.population || props.layers.catchment) && <div className="population-legend" role="status">
      <strong>{props.layers.population ? props.populationMode === "density" ? "Population density · SCB 2025" : "All station catchments" : "Selected station catchment"}</strong>
      {props.layers.population && props.populationMode === "density" && <><div className="population-ramp" /><span>0 · 100 · 1,000 · 5,000 · 15,000+ / km²</span></>}
      {props.layers.population && props.populationMode === "catchment" && <><div className="coverage-ramp" /><span>Lower → higher combined share</span></>}
      <span>{props.populationMode === "catchment" ? props.coverageStatus || (!populationBounds ? "Zoom in to see catchments" : "") : population.error || (population.loading ? "Loading population…" : !populationBounds ? "Zoom in to see population" : "")}</span>
      {props.layers.catchment && props.catchment && <span>Catchment: green walk · blue cycle · purple feeder · orange car</span>}
      {props.layers.catchment && !props.station && <span>Select or place a station to see its catchment.</span>}
    </div>}
    </>
  );
}
