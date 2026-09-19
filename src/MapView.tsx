import { useEffect, useRef } from "react";
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
  stationEnvelope,
  stationOnSections,
} from "./geometry";
import type { Network, Project, Selection, Section, Station, RouteEndpoint, TrackCount } from "./types";
import { compactMoney } from "./cost";
import { selectionParts } from "./construction";
import { selectionEndpoints } from "./routing";
import "maplibre-gl/dist/maplibre-gl.css";
interface Props {
  network: Network;
  project: Project;
  selection: Selection | null;
  anchor: RouteEndpoint | null;
  effective: Section[];
  preview: Feature<Polygon | MultiPolygon>[];
  previewTracks: TrackCount;
  affected: string[];
  blocked: string[];
  dark: boolean;
  layers: { row: boolean; buildings: boolean; roads: boolean };
  station: Station | undefined;
  constructing: boolean;
  focus: { id: string; nonce: number } | null;
  onCorridor: (id: string, position: number) => void;
  onStation: (id: string) => void;
  onHandle: (end: "start" | "end", target: RouteEndpoint) => void;
  onReady: () => void;
}
export function MapView(props: Props) {
  const container = useRef<HTMLDivElement>(null),
    mapRef = useRef<GLMap | null>(null),
    latest = useRef(props),
    markers = useRef<maplibregl.Marker[]>([]),
    dragging = useRef(false),
    styleReady = useRef(false),
    staticData = useRef<{ network?: Network; demolished?: string[] }>({});
  latest.current = props;
  const render = () => {
    const map = mapRef.current;
    if (!map || !styleReady.current) return;
    const p = latest.current;
    const corridors = new Map(p.network.corridors.map((c) => [c.id, c]));
    const set = (id: string, features: Feature[]) => {
      const data = featureCollection(features);
      if (map.getSource(id)) (map.getSource(id) as GeoJSONSource).setData(data);
      else map.addSource(id, { type: "geojson", data });
    };
    if (staticData.current.network !== p.network || !map.getSource("row"))
      set(
        "row",
        p.network.corridors.map((c) =>
          feature(c.geometry, { id: c.id, name: c.name }),
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
    set(
      "built",
      p.effective.flatMap((s) => {
        const c = corridors.get(s.corridorId);
        return c
          ? [
              {
                ...slice(c, s.start, s.end),
                properties: {
                  id: c.id,
                  tracks: s.tracks,
                  speed: s.maxSpeedKph,
                },
              },
            ]
          : [];
      }),
    );
    set("built-links", junctionLinks(p.network.corridors, p.effective));
    if (!map.getSource("hover-point")) set("hover-point", []);
    set("preview", p.preview);
    set("selected-links", p.selection ? junctionLinks(p.network.corridors,
      selectionParts(p.selection).map(part => ({ ...part, tracks: p.previewTracks }))) : []);
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
    set(
      "station-built",
      p.network.stations
        .filter((s) => p.project.stations[s.id])
        .map((s) =>
          stationEnvelope(
            corridors.get(s.corridorId)!,
            s,
            p.project.stations[s.id].lengthMeters,
            p.project.stations[s.id].platforms,
          ),
        ),
    );
    set(
      "selected",
      p.selection
        ? selectionParts(p.selection).flatMap((part) => {
            const selected = corridors.get(part.corridorId);
            return selected
              ? [
                  {
                    ...slice(selected, part.start, part.end),
                    properties: { tracks: p.previewTracks },
                  },
                ]
              : [];
          })
        : [],
    );
    set(
      "stations",
      p.network.stations
        .filter(
          (s) =>
            s.id === p.station?.id ||
            stationOnSections(s, p.network.corridors, p.effective) ||
            (p.constructing &&
              p.selection &&
              stationOnSections(
                s,
                p.network.corridors,
                selectionParts(p.selection),
              )),
        )
        .map((s) =>
          feature(
            {
              type: "Point",
              coordinates: pointAt(corridors.get(s.corridorId)!, s.position),
            },
            { id: s.id, name: s.name, selected: s.id === p.station?.id },
          ),
        ),
    );
    if (!map.getLayer("row-visible")) {
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
        paint: {
          "circle-radius": ["case", ["get", "selected"], 7, 4.5],
          "circle-color": "#fff",
          "circle-stroke-color": "#235e50",
          "circle-stroke-width": 2,
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
    };
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
      latest.current.onReady();
    });
    map.on("click", (e) => {
      const p = latest.current;
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
      }
    });
    map.on("mousemove", (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ["row-hit", "station-points", "affected-fill"].filter(
          (id) => !!map.getLayer(id),
        ),
      });
      map.getCanvas().style.cursor = features.length ? "pointer" : "";
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
    props.affected,
    props.blocked,
    props.layers,
    props.station,
    props.constructing,
  ]);
  useEffect(() => {
    const map = mapRef.current;
    markers.current.forEach(m => m.remove());
    markers.current = [];
    if (!map || props.station) return;
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
  }, [props.selection, props.anchor, props.station?.id, props.network]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !props.focus) return;
    map.setPadding({ left: 0, right: 0, top: 0, bottom: 0 });
    const s = props.network.stations.find((s) => s.id === props.focus!.id);
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
    <div
      className="map"
      ref={container}
      aria-label="Interactive railway construction map"
    />
  );
}
