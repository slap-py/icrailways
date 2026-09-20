import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Download,
  Expand,
  GitBranch,
  Layers,
  MapPin,
  Pencil,
  Moon,
  MousePointer2,
  Plus,
  RotateCcw,
  Save,
  Sun,
  TrainTrack,
  Trash2,
  X,
  AlertTriangle,
  Landmark,
  Zap,
  ArrowRight,
  Minus,
} from "lucide-react";
import { MapView } from "./MapView";
import { REGION, SPEEDS, STATION_LENGTHS, WIDTHS } from "./config";
import {
  trackAffectedBuildings,
  affectedBuildings,
  blockedRoads,
  envelope,
  stationEnvelope,
  stationCenter,
  stationPlacement,
  pointAt,
} from "./geometry";
import { compactMoney, distanceLabel, money, trackCost } from "./cost";
import {
  effectiveSections,
  emptyProject,
  expansionCost,
  expansionPowerCost,
  expansionError,
  removeExpansion,
  replaceSection,
  selectionLength,
  selectionParts,
  sectionMatches,
} from "./construction";
import {
  routeSelection,
  routeSelectionVia,
  selectionEndpoints,
} from "./routing";
import { loadProject, saveProject } from "./persistence";
import { resizeStationSpan, suggestStationName } from "./stations";
import { calculateCatchments, stopIndex, surroundingBounds } from "./catchment";
import type { TransitStop } from "./catchment";
import { usePopulationAreas } from "./population";
import type { Position } from "geojson";
import type { Network, Project, RouteEndpoint, Selection, Tool, TrackCount } from "./types";
const tools = [
  { id: "select", label: "Select", icon: MousePointer2, key: "1" },
  { id: "build", label: "Build track", icon: TrainTrack, key: "2" },
  { id: "passing", label: "Passing section", icon: GitBranch, key: "3" },
  { id: "overtaking", label: "Overtaking section", icon: Layers, key: "4" },
  { id: "station", label: "Station", icon: Landmark, key: "5" },
  { id: "delete", label: "Delete", icon: Trash2, key: "6" },
] as const;
export default function App() {
  const [network, setNetwork] = useState<Network | null>(null),
    [error, setError] = useState(""),
    [project, setProject] = useState<Project>(emptyProject(REGION.key));
  const [tool, setTool] = useState<Tool>("select"),
    [selection, setSelection] = useState<Selection | null>(null),
    [anchor, setAnchor] = useState<RouteEndpoint | null>(null),
    [placing, setPlacing] = useState<"start" | "end">("end"),
    [routeError, setRouteError] = useState(""),
    [stationId, setStationId] = useState<string | null>(null),
    [draftStation, setDraftStation] = useState<import("./types").Station | null>(null),
    [stationName, setStationName] = useState(""),
    [stationPosition, setStationPosition] = useState(0),
    [stationOffset, setStationOffset] = useState(0),
    [symmetricStationResize, setSymmetricStationResize] = useState(true),
    [stationEditing, setStationEditing] = useState(false),
    [tracks, setTracks] = useState<TrackCount>(2),
    [speed, setSpeed] = useState(160),
    [electrified, setElectrified] = useState(false),
    [stationLength, setStationLength] = useState(100),
    [platforms, setPlatforms] = useState(2);
  const [dark, setDark] = useState(false),
    [layers, setLayers] = useState({
      row: true,
      buildings: true,
      roads: false,
      population: true,
      catchment: false,
      transit: false,
    }),
    [showLayers, setShowLayers] = useState(false),
    [toast, setToast] = useState(""),
    [dirty, setDirty] = useState(false),
    [ready, setReady] = useState(false),
    [resetting, setResetting] = useState(false),
    [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null),
    [deleteLoops, setDeleteLoops] = useState(false),
    [showAffected, setShowAffected] = useState(false);
  const [populationMode, setPopulationMode] = useState<"density" | "catchment">("density");
  useEffect(() => {
    fetch(REGION.dataUrl)
      .then((r) => {
        if (!r.ok)
          throw new Error(
            "The Sweden network data could not be loaded. Run npm run data:fetch.",
          );
        return r.json();
      })
      .then(setNetwork)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const notify = (message: string) => setToast(message);
  const effective = useMemo(() => effectiveSections(project), [project.sections, project.expansions]);
  const parts = selection ? selectionParts(selection) : [];
  const routeEndpoints = selection ? selectionEndpoints(selection) : undefined;
  const corridor = network?.corridors.find((c) => c.id === parts[0]?.corridorId);
  const multiSegment = parts.length > 1;
  const stationRecord = draftStation || (stationId ? project.stations[stationId] : undefined);
  const stationCorridor = network?.corridors.find(
    (c) => c.id === stationRecord?.corridorId,
  );
  const station = useMemo(() => {
    if (!stationRecord || !stationCorridor) return stationRecord;
    const edited = {
      ...stationRecord,
      position: stationPosition,
      lateralOffsetMeters: stationOffset,
    };
    return { ...edited, coordinates: stationCenter(stationCorridor, edited) };
  }, [stationRecord, stationCorridor, stationPosition, stationOffset]);
  const stationEditable = !!draftStation || stationEditing;
  const catchmentStations = useMemo(() => [...Object.values(project.stations).filter(s => s.id !== station?.id), ...(station ? [{ ...station, name: stationName.trim() }] : [])], [project.stations, station, stationName]);
  const catchmentGeometryKey = catchmentStations
    .map(s => `${s.id}:${s.coordinates[0].toFixed(6)},${s.coordinates[1].toFixed(6)}`)
    .sort().join("|");
  const catchmentNamesKey = catchmentStations.map(s => `${s.id}:${s.name}`).sort().join("|");
  const population = usePopulationAreas(catchmentStations.map(s => surroundingBounds(s.coordinates, 40)));
  const [transit, setTransit] = useState<{ stops: TransitStop[]; status: string }>({ stops: [], status: "Loading OSM stops…" });
  useEffect(() => {
    fetch("/data/transit-stops.json").then(r => {
      if (!r.ok) throw Error("unavailable");
      return r.json();
    }).then(data => setTransit({ stops: data.stops, status: data.coverage === "partial" ? "OSM stops: partial coverage (Overpass + CARTO); service unverified" : "OSM stop proximity; service unverified" }))
      .catch(() => setTransit({ stops: [], status: "OSM stops unavailable; walk, cycle and car only" }));
  }, []);
  const transitIndex = useMemo(() => stopIndex(transit.stops), [transit.stops]);
  const calculatedCatchments = useMemo(() => !population.loading && !population.error
    ? calculateCatchments(population.cells, catchmentStations, transitIndex) : null,
  [catchmentGeometryKey, population.cells, population.loading, population.error, transitIndex]);
  const catchments = useMemo(() => {
    if (!calculatedCatchments) return null;
    const names = new Map(catchmentStations.map(s => [s.id, s.name]));
    return {
      ...calculatedCatchments,
      coverage: calculatedCatchments.coverage.map(cell => ({
        ...cell,
        properties: {
          ...cell.properties,
          stationName: names.get(cell.properties.stationId) || cell.properties.stationName,
        },
      })),
    };
  }, [calculatedCatchments, catchmentNamesKey]);
  const catchment = station ? catchments?.byStation[station.id] || null : null;
  const expansion = tool === "passing" || tool === "overtaking";
  const previewTracks = expansion ? (tool === "passing" ? 2 : 4) : tracks;
  const preview = useMemo(
    () =>
      station && stationCorridor
        ? [stationEnvelope(stationCorridor, station, stationLength, platforms)]
        : selection && network
          ? selectionParts(selection).flatMap((part) => {
              const routeCorridor = network.corridors.find(
                (c) => c.id === part.corridorId,
              );
              return routeCorridor
                ? [
                    envelope(
                      routeCorridor,
                      part.start,
                      part.end,
                      WIDTHS[previewTracks],
                    ),
                  ]
                : [];
            })
          : [],
    [
      station,
      stationCorridor,
      stationLength,
      platforms,
      selection,
      network,
      previewTracks,
    ],
  );
  const affected = useMemo(
    () =>
      tool === "delete"
        ? []
        : station
          ? affectedBuildings(
              preview[0],
              network?.buildings || [],
              project.demolished,
            )
          : selection && network
            ? [
                ...new Map(
                  selectionParts(selection)
                    .flatMap((part) => {
                      const routeCorridor = network.corridors.find(
                        (c) => c.id === part.corridorId,
                      );
                      return routeCorridor
                        ? trackAffectedBuildings(
                            routeCorridor,
                            part.start,
                            part.end,
                            WIDTHS[previewTracks],
                            network.buildings,
                            project.demolished,
                          )
                        : [];
                    })
                    .map((building) => [building.id, building]),
                ).values(),
              ]
            : [],
    [
      preview,
      network,
      project.demolished,
      tool,
      station,
      selection,
      previewTracks,
    ],
  );
  const blocked = useMemo(
    () => (station ? blockedRoads(preview[0], network?.roads || []) : []),
    [station, preview, network],
  );
  const length = selection ? selectionLength(selection) : 0;
  const propertyCost = affected.reduce((n, b) => n + b.estimatedCost, 0);
  const oldStation = stationId ? project.stations[stationId] : undefined;
  const stationChanged =
    !!station &&
    (!oldStation ||
      oldStation.name !== stationName.trim() ||
      oldStation.lengthMeters !== stationLength ||
      oldStation.platforms !== platforms ||
      Math.abs(oldStation.position - station.position) > 0.1 ||
      Math.abs((oldStation.lateralOffsetMeters || 0) - stationOffset) > 0.1);
  const unchanged =
    !!selection &&
    !expansion &&
    sectionMatches(effective, selection, tracks, speed, electrified);
  const infrastructureCost = unchanged
    ? 0
    : station
      ? oldStation
        ? Math.abs(oldStation.position - station.position) > 0.1 ||
          Math.abs((oldStation.lateralOffsetMeters || 0) - stationOffset) > 0.1
          ? stationLength * platforms * 2500
          : Math.abs(stationLength - oldStation.lengthMeters) * platforms * 2500 +
            Math.abs(platforms - oldStation.platforms) * stationLength * 4000
        : stationLength * platforms * 2500
      : selection
        ? expansion
          ? expansionCost(length, tool as "passing" | "overtaking", speed) + expansionPowerCost(project, selection, tool as "passing" | "overtaking")
          : trackCost(length, tracks, speed, electrified)
        : 0;
  const invalid = routeError || (station
    ? !stationName.trim()
      ? "Give the station a name."
      : blocked.length
      ? `${stationLength} m / ${platforms} platforms unavailable — road obstruction.`
      : !stationChanged
        ? "Move, resize, rename, or change the platform count to preview an upgrade."
        : ""
    : selection
      ? length < 10
        ? "Choose a section at least 10 m long."
        : expansion
          ? expansionError(project, selection, tool as "passing" | "overtaking")
          : unchanged
            ? "This section already has these track and speed settings."
            : ""
      : "Select infrastructure on the map.");
  const builtKm = effective.reduce((n, s) => n + s.end - s.start, 0) / 1000;
  const changeTool = (next: Tool) => {
    setTool(next);
    setAnchor(null);
    setRouteError("");
    setDeleteLoops(false);
    setStationEditing(false);
    if (next !== "station") {
      setStationId(null);
      setDraftStation(null);
    }
    if (next === "station") {
      setSelection(null);
      setAnchor(null);
    }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,select,textarea")) return;
      const item = tools.find((t) => t.key === e.key);
      if (item) changeTool(item.id);
      if (e.key === "Escape") {
        setStationId(null);
        setDraftStation(null);
        setStationEditing(false);
        setSelection(null);
        setAnchor(null);
        setRouteError("");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const selectStation = (id: string, fly = false) => {
    const s = project.stations[id];
    if (!s) return;
    setAnchor(null);
    setRouteError("");
    setStationId(id);
    setDraftStation(null);
    setStationName(s.name);
    setStationPosition(s.position);
    setStationOffset(s.lateralOffsetMeters || 0);
    setSymmetricStationResize(true);
    setStationEditing(false);
    setSelection(null);
    setTool("station");
    setStationLength(s.lengthMeters);
    setPlatforms(s.platforms);
    if (fly) setFocus({ id, nonce: Date.now() });
  };
  const startRoute = () => {
    setSelection(null);
    setAnchor(null);
    setStationId(null);
    setDraftStation(null);
    setRouteError("");
    setPlacing("end");
    setTool("build");
  };
  const placeEndpoint = (end: "start" | "end", target: RouteEndpoint) => {
    if (!network) return;
    if (!selection && !anchor) {
      setAnchor(target);
      setPlacing("end");
      setRouteError("");
      return;
    }
    if (!selection && anchor && end === "start") {
      setAnchor(target);
      setRouteError("");
      return;
    }
    const endpoints = selection ? selectionEndpoints(selection) : [anchor!, target];
    const next: RouteEndpoint[] = [
      endpoints[0],
      ...(selection?.waypoints || []),
      endpoints[1],
    ];
    next[end === "start" ? 0 : next.length - 1] = target;
    const routed = routeSelectionVia(network.corridors, next, network.stations);
    if (!routed) {
      setRouteError("No connected route here. Choose another point on the railway network.");
      return;
    }
    setSelection(routed);
    setAnchor(null);
    setRouteError("");
  };
  const selectCorridor = (id: string, position: number) => {
    if (tool === "station") {
      const corridor = network!.corridors.find((candidate) => candidate.id === id)!;
      const name = suggestStationName(pointAt(corridor, position), network!.places, project.stations);
      const created = {
        id: crypto.randomUUID(),
        name,
        coordinates: pointAt(corridor, position),
        corridorId: id,
        position,
        lateralOffsetMeters: 0,
        lengthMeters: 100,
        platforms: 2,
      };
      setStationId(null);
      setDraftStation(created);
      setStationName(name);
      setStationPosition(position);
      setStationOffset(0);
      setSymmetricStationResize(true);
      setStationEditing(true);
      setStationLength(100);
      setPlatforms(2);
      setRouteError("");
      return;
    }
    setStationId(null);
    const built = effective.find(
      (s) => s.corridorId === id && s.start <= position && s.end >= position,
    );
    if (built && (tool === "select" || tool === "delete")) {
      setSelection({ corridorId: id, start: built.start, end: built.end });
      setTracks(built.tracks);
      setSpeed(built.maxSpeedKph);
      setElectrified(built.electrified);
      setAnchor(null);
      setRouteError("");
    } else {
      if (tool === "select") setTool("build");
      const target = { corridorId: id, position };
      let end = placing;
      if (selection) {
        const endpoints = selectionEndpoints(selection);
        const distances = endpoints.map((endpoint) => {
          const route = routeSelection(
            network!.corridors,
            target,
            endpoint,
            network!.stations,
          );
          return route ? selectionLength(route) : Infinity;
        });
        end = distances[0] <= distances[1] ? "start" : "end";
        setPlacing(end);
      }
      placeEndpoint(end, target);
    }
  };
  const updateEndpoint = (end: "start" | "end", value: number) => {
    if (!selection || !network) return;
    const endpoint = selectionEndpoints(selection)[end === "start" ? 0 : 1];
    const c = network.corridors.find((c) => c.id === endpoint.corridorId)!;
    placeEndpoint(end, { ...endpoint, position: Math.max(0, Math.min(c.length, value)) });
  };
  const updateWaypoint = (index: number, target: RouteEndpoint | null) => {
    if (!selection || !network) return;
    const endpoints = selectionEndpoints(selection);
    const waypoints = [...(selection.waypoints || [])];
    if (target) waypoints.splice(index, 0, target);
    else waypoints.splice(index, 1);
    const routed = routeSelectionVia(
      network.corridors,
      [endpoints[0], ...waypoints, endpoints[1]],
      network.stations,
    );
    if (!routed) {
      setRouteError("No connected route through that waypoint.");
      return;
    }
    setSelection(routed);
    setRouteError("");
  };
  const moveStation = (coordinates: Position) => {
    if (!stationCorridor) return;
    const placement = stationPlacement(stationCorridor, coordinates);
    setStationPosition(placement.position);
    setStationOffset(Math.round(placement.lateralOffsetMeters));
  };
  const resizeStation = (end: "start" | "end", draggedPosition: number) => {
    if (!station || !stationCorridor) return;
    const resized = resizeStationSpan(
      stationPosition,
      stationLength,
      draggedPosition,
      end,
      symmetricStationResize,
      stationCorridor.length,
    );
    setStationLength(resized.lengthMeters);
    setStationPosition(resized.position);
  };
  const commit = () => {
    if (!network || routeError) return;
    if (tool === "delete" && selection) {
      setProject(
        deleteLoops
          ? removeExpansion(project, selection)
          : replaceSection(project, selection, 0, speed),
      );
      setDirty(true);
      notify(
        deleteLoops
          ? "Additional tracks removed."
          : "Selected infrastructure removed. ROW remains available.",
      );
      return;
    }
    if (invalid) return;
    let next = project;
    if (station)
      next = {
        ...project,
        stations: {
          ...project.stations,
          [station.id]: {
            ...station,
            name: stationName.trim(),
            lengthMeters: stationLength,
            platforms,
          },
        },
      };
    else if (selection)
      next = expansion
        ? {
            ...project,
            expansions: [
              ...project.expansions,
              ...selectionParts(selection).map((part) => ({
                ...part,
                id: crypto.randomUUID(),
                addedTracks: tool === "passing" ? 1 : 2,
                type: tool as "passing" | "overtaking",
              })),
            ],
          }
        : replaceSection(project, selection, tracks, speed, electrified);
    next = {
      ...next,
      demolished: [
        ...new Set([...next.demolished, ...affected.map((b) => b.id)]),
      ],
      spent: project.spent + infrastructureCost + propertyCost,
    };
    setProject(next);
    if (station && draftStation) {
      setStationId(station.id);
      setDraftStation(null);
    }
    if (station) setStationEditing(false);
    setDirty(true);
    notify(
      `${station ? oldStation ? "Station updated" : "Station built" : expansion ? "Additional tracks built" : "Track construction applied"} · ${compactMoney(infrastructureCost + propertyCost)}`,
    );
    if (expansion) {
      setTool("select");
      setTracks(previewTracks as TrackCount);
    }
  };
  const deleteStation = () => {
    if (!oldStation) return;
    const stations = { ...project.stations };
    delete stations[oldStation.id];
    setProject({ ...project, stations });
    setStationId(null);
    setDraftStation(null);
    setStationEditing(false);
    setDirty(true);
    notify(`${oldStation.name} removed. No refund was issued.`);
  };
  const save = () => {
    try {
      saveProject(project);
      setDirty(false);
      notify("Project saved in this browser.");
    } catch {
      notify("Browser storage is unavailable or full.");
    }
  };
  const load = () => {
    try {
      const p = loadProject(REGION.key);
      if (
        p.sections.some(
          (s) =>
            !network?.corridors.some(
              (c) => c.id === s.corridorId && s.end <= c.length + 0.1,
            ),
        ) ||
        Object.values(p.stations).some(
          (s) =>
            !network?.corridors.some(
              (c) => c.id === s.corridorId && s.position <= c.length + 0.1,
            ),
        )
      )
        throw new Error("The saved network differs from this data snapshot.");
      setProject(p);
      setSelection(null);
      setAnchor(null);
      setRouteError("");
      setStationId(null);
      setDraftStation(null);
      setDirty(false);
      notify("Saved project loaded.");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  return (
    <div className={`app ${dark ? "dark" : ""}`}>
      {network && (
        <MapView
          network={network}
          project={project}
          selection={selection}
          anchor={anchor}
          effective={effective}
          preview={tool === "delete" ? [] : preview}
          previewTracks={previewTracks}
          previewElectrified={electrified}
          affected={affected.map((b) => b.id)}
          blocked={blocked.map((r) => r.id)}
          dark={dark}
          layers={layers}
          catchment={catchment}
          coverage={catchments?.coverage || null}
          populationMode={populationMode}
          coverageStatus={population.error || (population.loading ? "Loading catchments…" : catchmentStations.length ? "" : "No stations built")}
          transitStops={transit.stops}
          station={station ? { ...station, name: stationName.trim(), lengthMeters: stationLength, platforms } : undefined}
          constructing={tool === "build" || expansion}
          focus={focus}
          onCorridor={selectCorridor}
          onStation={(id) => selectStation(id)}
          onHandle={placeEndpoint}
          onWaypoint={updateWaypoint}
          onStationMove={moveStation}
          onStationResize={resizeStation}
          stationEditable={stationEditable}
          onReady={() => setReady(true)}
        />
      )}
      <header className="header">
        <a className="brand" href="/" aria-label="Right of Way home">
          <span className="brand-mark">
            <TrainTrack size={25} />
          </span>
          <span>
            right of way
            <span className="brand-sub">INTERCITY RAILWAY WORKSHOP</span>
          </span>
        </a>
        <div className="header-actions">
          <span className="save-state">
            <span className={dirty ? "unsaved-dot" : "saved-dot"} />
            {dirty ? "Unsaved changes" : "Local project"}
          </span>
          <button disabled={!network} onClick={load} title="Load saved project">
            <Download size={15} />
            Load
          </button>
          <button onClick={save}>
            <Save size={15} />
            Save
          </button>
          <button
            className="icon-button"
            onClick={() => setResetting(!resetting)}
            title="New project"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </header>
      <nav className="toolbar" aria-label="Construction tools">
        {tools.map(({ id, label, icon: Icon, key }, i) => (
          <button
            key={id}
            className={`${tool === id ? "active" : ""} ${i === 5 ? "delete-tool" : ""}`}
            onClick={() => changeTool(id)}
            aria-label={label}
            title={`${label} · ${key}`}
          >
            <Icon size={21} />
            <span className="tool-tooltip">
              {label}
              <kbd>{key}</kbd>
            </span>
          </button>
        ))}
      </nav>
      <div className="map-top-controls">
        <button className="map-control" onClick={() => setDark(!dark)}>
          {dark ? <Sun size={16} /> : <Moon size={16} />}{" "}
          {dark ? "Light map" : "Dark map"}
        </button>
        <div className="layers-control">
          <button
            className={`map-control ${showLayers ? "pressed" : ""}`}
            onClick={() => setShowLayers(!showLayers)}
          >
            <Layers size={16} />
            Layers
            <ChevronDown size={13} />
          </button>
          {showLayers && (
            <div className="layers-popover">
              <div className="population-mode" role="group" aria-label="Population map mode">
                <button aria-pressed={populationMode === "density"} onClick={() => { setPopulationMode("density"); setLayers(l => ({ ...l, population: true })); }}>Density</button>
                <button aria-pressed={populationMode === "catchment"} onClick={() => { setPopulationMode("catchment"); setLayers(l => ({ ...l, population: true })); }}>All catchments</button>
              </div>
              {(
                [
                  ["row", "Available ROW"],
                  ["buildings", "Building footprints"],
                  ["roads", "Station road constraints"],
                  ["population", "Population map"],
                  ["catchment", "Selected station catchment"],
                  ["transit", "OSM public transit stops"],
                ] as const
              ).map(([id, label]) => (
                <label key={id}>
                  <input
                    type="checkbox"
                    checked={layers[id]}
                    onChange={(e) =>
                      setLayers({ ...layers, [id]: e.target.checked })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
      <aside className="sidebar">
        <div className="sidebar-heading">
          <span className="eyebrow">INFRASTRUCTURE EDITOR</span>
        </div>
        <div className="editor-title">
          <h1>
            {station
              ? "Station"
              : selection
                ? tool === "delete"
                  ? "Remove infrastructure"
                  : tool === "passing"
                    ? "Passing section"
                    : tool === "overtaking"
                      ? "Overtaking section"
                      : "Track construction"
                : tool === "station"
                  ? "Build a station"
                  : anchor ? "Choose your destination" : project.sections.length ? "Plan your next route" : "Your railway starts here."}
          </h1>
          {(station || selection || anchor) && (
            <button
              className="icon-button"
              title="Clear selection"
              onClick={() => {
                setSelection(null);
                setAnchor(null);
                setRouteError("");
                setStationId(null);
                setDraftStation(null);
                setStationEditing(false);
              }}
            >
              <X size={17} />
            </button>
          )}
        </div>
        {!station && !selection ? (
          <>
            {tool === "station" ? (
              <div className="station-empty">
                <p className="intro">Place a new fictional station anywhere along the available right of way.</p>
                <div className="welcome-diagram">
                  <div className="diagram-label">CHOOSE A LOCATION</div>
                  <div className="diagram-row built">
                    <i />
                    <span />
                    <i />
                  </div>
                  <MapPin size={18} />
                </div>
                <p className="description">
                  Click a railway on the map. The station will snap to its centreline, and you can edit its suggested name, length, and platforms before building it.
                </p>
              </div>
            ) : (
              <>
                <p className="intro">{anchor ? "A is set. Click anywhere along a connected railway to place B." : "Two points. One continuous railway."}</p>
                {anchor && <div className="route-status"><b>A · Start set</b><span>{network?.corridors.find(c => c.id === anchor.corridorId)?.name}</span><button className="text-button" onClick={startRoute}>Start again</button></div>}
                {routeError && <p className="route-error" role="alert">{routeError}</p>}
                {!anchor && <div className="welcome-diagram">
                  <div className="diagram-label">AVAILABLE RIGHT OF WAY</div>
                  <div className="diagram-row">
                    <i />
                    <span />
                    <i />
                  </div>
                  <ArrowRight size={16} />
                  <div className="diagram-label green">YOUR RAILWAY</div>
                  <div className="diagram-row built">
                    <i />
                    <span />
                    <i />
                  </div>
                </div>}
                <p className="description">
                  Build along real railway corridors across Sweden. Choose a start and destination; the creator follows connected railways across junctions and data segments.
                </p>
                <button className="primary full" onClick={() => { if (!anchor) changeTool("build"); }}>
                  <Plus size={17} />
                  {tool === "build" ? anchor ? "Click the destination on the map" : "Click your start on the map" : "Build your first section"}
                  <ArrowUpRight size={16} />
                </button>
                <div className="getting-started">
                  <div><b>01</b><span><strong>Place A and B</strong><small>Click your start, then your destination.</small></span></div>
                  <div><b>02</b><span><strong>Make it yours</strong><small>Adjust the route, tracks, speed, and electrification.</small></span></div>
                  <div><b>03</b><span><strong>Review & build</strong><small>Check property impacts, then apply.</small></span></div>
                </div>
                <div className="explore">
                  <span className="eyebrow">EXPLORE THE NETWORK</span>
                  <button onClick={() => {
                    const c = [...(network?.corridors || [])].sort((a, b) => b.length - a.length)[0];
                    if (c) {
                      setTool("build");
                      setAnchor(null);
                      setRouteError("");
                      setSelection({ corridorId: c.id, start: 0, end: c.length });
                      setFocus({ id: c.id, nonce: Date.now() });
                    }
                  }}>
                    A long-distance corridor <ArrowUpRight size={15} />
                  </button>
                  <button onClick={() => changeTool("station")}>
                    Build a fictional station <ArrowUpRight size={15} />
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="selection-name">
              <MapPin size={14} />
              <span>{station ? stationName : (multiSegment ? "Connected railway route" : corridor?.name)}</span>
              <button
                className="icon-button"
                title="Zoom to selection"
                onClick={() =>
                  setFocus({
                    id: station?.id || corridor!.id,
                    nonce: Date.now(),
                  })
                }
              >
                <Expand size={15} />
              </button>
            </div>
            {station ? (
              <>
                {oldStation && !stationEditing && (
                  <button className="primary full station-edit-button" onClick={() => setStationEditing(true)}>
                    <Pencil size={15} /> Edit station
                  </button>
                )}
                <div className="editor-section">
                  <label className="field-label" htmlFor="station-name">
                    STATION NAME
                  </label>
                  <input
                    id="station-name"
                    className="station-name-input"
                    value={stationName}
                    disabled={!stationEditable}
                    onChange={(event) => setStationName(event.target.value)}
                    maxLength={80}
                  />
                </div>
                <div className="editor-section catchment-summary">
                  <div className="field-label">CATCHMENT</div>
                  {population.loading ? <p className="helper">Loading SCB population…</p> : population.error ? <p role="status" className="helper">{population.error}. Catchment unavailable.</p> : catchment && <>
                    <strong className="catchment-total">{Math.round(catchment.residents).toLocaleString()} <small>residents</small></strong>
                    <div className="catchment-modes">{(["walk", "cycle", "transit", "car"] as const).map(mode => <span key={mode}><i className={`mode-dot ${mode}`} />{mode === "transit" ? "Feeder" : mode[0].toUpperCase() + mode.slice(1)}<b>{Math.round(catchment.modes[mode]).toLocaleString()}</b></span>)}</div>
                  </>}
                </div>
                <div className="editor-section">
                  <label className="field-label">
                    STATION LENGTH <span>{stationLength} metres</span>
                  </label>
                  <div className="length-grid">
                    {STATION_LENGTHS.map((n) => (
                      <button
                        key={n}
                        disabled={!stationEditable}
                        className={stationLength === n ? "chosen" : ""}
                        onClick={() => setStationLength(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  {stationEditable && <label className="symmetric-resize">
                    <span>
                      <strong>Resize both ends together</strong>
                      <small>{symmetricStationResize ? "Dragging either end keeps the station centred." : "Dragging an end leaves the other end fixed."}</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={symmetricStationResize}
                      onChange={(event) => setSymmetricStationResize(event.target.checked)}
                    />
                  </label>}
                  {stationEditable && <p className="helper">Drag the centre to reposition the station, or drag A and B for 10 m length adjustments.</p>}
                </div>
                <div className="editor-section">
                  <label className="field-label">
                    PLATFORMS
                  </label>
                  <div className="stepper">
                    <button
                      disabled={!stationEditable || platforms <= 1}
                      aria-label="Fewer platforms"
                      onClick={() => setPlatforms(platforms - 1)}
                    >
                      <Minus size={16} />
                    </button>
                    <strong>
                      {platforms}
                      <small>platforms</small>
                    </strong>
                    <button
                      disabled={!stationEditable || platforms >= 12}
                      aria-label="More platforms"
                      onClick={() => setPlatforms(platforms + 1)}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <p className="helper">
                    {8 + platforms * 6} m wide
                  </p>
                </div>
                {stationEditable && <div
                  className={`constraint-card ${blocked.length ? "blocked" : ""}`}
                >
                  <div>
                    {blocked.length ? (
                      <AlertTriangle size={16} />
                    ) : (
                      <Check size={16} />
                    )}
                    <strong>
                      {blocked.length
                        ? "Road obstruction"
                        : "Road clearance OK"}
                    </strong>
                  </div>
                  <p>
                    {blocked.length
                      ? `${stationLength} m / ${platforms} platforms overlaps ${[...new Set(blocked.map((r) => r.name))].slice(0, 3).join(", ")}. Reduce length or platform count.`
                      : "No roads intersect the proposed footprint. Buildings can be acquired; roads cannot be crossed."}
                  </p>
                </div>}
              </>
            ) : (
              <>
                <div className="section-distance">
                  <span>SELECTED SECTION</span>
                  <strong>{distanceLabel(length)}</strong>
                </div>
                <div className="route-endpoints">
                  {(["start", "end"] as const).map((end, i) => {
                    const endpoint = routeEndpoints![i];
                    const name = network!.corridors.find(c => c.id === endpoint.corridorId)!.name;
                    return <div className="route-endpoint" key={end}>
                      <div className="endpoint-card">
                        <b>{i ? "B" : "A"}</b><span>{i ? "Destination" : "Start"}<small>{name}</small></span>
                        <span>Marker</span>
                      </div>
                      <label className="endpoint-distance">Position on this railway
                        <input aria-label={`${end} distance in km`} type="number" min={0}
                          max={network!.corridors.find(c => c.id === endpoint.corridorId)!.length / 1000}
                          step="0.01" value={+(endpoint.position / 1000).toFixed(3)}
                          onChange={e => updateEndpoint(end, +e.target.value * 1000)} /> km
                      </label>
                    </div>;
                  })}
                </div>
                <p className="helper">Click near either end to move the closest endpoint. Drag the amber route to add a waypoint; click a waypoint marker to remove it.</p>
                {!!selection?.waypoints?.length && (
                  <p className="waypoint-count">{selection.waypoints.length} waypoint{selection.waypoints.length === 1 ? "" : "s"} shaping this route</p>
                )}
                {routeError && <p className="route-error" role="alert">{routeError}</p>}
                <button className="text-button" onClick={startRoute}>Start a new route</button>
                {tool === "delete" ? (
                  <div className="delete-options">
                    <p>
                      Preview removal of this section. Available ROW stays on
                      the map; demolished buildings are not restored.
                    </p>
                    <label>
                      <input
                        type="checkbox"
                        checked={deleteLoops}
                        onChange={(e) => setDeleteLoops(e.target.checked)}
                      />
                      Remove passing / overtaking tracks only
                    </label>
                  </div>
                ) : (
                  <>
                    <div className="editor-section">
                      <label className="field-label">
                        TRACK COUNT{" "}
                        <span>{WIDTHS[previewTracks]} m planning width</span>
                      </label>
                      <div className="track-options">
                        {([1, 2, 3, 4] as TrackCount[]).map((n) => (
                          <button
                            key={n}
                            disabled={expansion}
                            onClick={() => setTracks(n)}
                            className={previewTracks === n ? "chosen" : ""}
                          >
                            <span className="track-glyph">
                              {Array.from({ length: n }, (_, i) => (
                                <i key={i} />
                              ))}
                            </span>
                            <b>{n}</b>
                          </button>
                        ))}
                      </div>
                      {expansion && (
                        <p className="helper">
                          {tool === "passing"
                            ? "Single track + 1 additional track."
                            : "Double track + 2 additional tracks."}
                        </p>
                      )}
                    </div>
                    <div className="editor-section">
                      <label className="field-label">
                        MAXIMUM SPEED <span>km/h</span>
                      </label>
                      <div className="speed-input">
                        <input
                          aria-label="Maximum speed"
                          type="number"
                          min="80"
                          max="320"
                          step="10"
                          disabled={expansion}
                          value={speed}
                          onChange={(e) =>
                            setSpeed(
                              Math.max(
                                80,
                                Math.min(320, +e.target.value || 80),
                              ),
                            )
                          }
                        />
                        <span>km/h</span>
                      </div>
                      <div className="speed-presets">
                        {SPEEDS.map((n) => (
                          <button
                            key={n}
                            disabled={expansion}
                            className={speed === n ? "chosen" : ""}
                            onClick={() => setSpeed(n)}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                    {!expansion && (
                      <div className="editor-section electrification-control">
                        <label>
                          <span><Zap size={16} /> Electrified</span>
                          <input
                            type="checkbox"
                            checked={electrified}
                            onChange={(event) => setElectrified(event.target.checked)}
                          />
                        </label>
                        <p className="helper">Adds overhead power at €250,000 per track-km (planning estimate).</p>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
            {tool !== "delete" && (!station || stationEditable) && (
              <div className="cost-summary">
                <div className="cost-heading">
                  <span className="eyebrow">CONSTRUCTION ESTIMATE</span>
                  <span className="preview-badge">PREVIEW</span>
                </div>
                <div>
                  <span>
                    {station
                      ? "Station works"
                      : expansion
                        ? "Additional tracks"
                        : "Railway works"}
                  </span>
                  <span>{compactMoney(infrastructureCost)}</span>
                </div>
                <div>
                  <span>
                    Buildings affected{" "}
                    <b className={affected.length ? "affected-count" : "count"}>
                      {affected.length}
                    </b>
                  </span>
                  <span>{compactMoney(propertyCost)}</span>
                </div>
                {affected.length > 0 && (
                  <div className="property-review">
                    <button
                      className="property-review-toggle"
                      onClick={() => setShowAffected(!showAffected)}
                      aria-expanded={showAffected}
                    >
                      {showAffected ? "Hide affected buildings" : "Review affected buildings"}
                      <ChevronDown size={14} />
                    </button>
                    {showAffected && (
                      <div className="property-list">
                        {affected.map((building, index) => (
                          <button
                            key={building.id}
                            onClick={() => setFocus({ id: building.id, nonce: Date.now() })}
                          >
                            <span>{index + 1}. {building.buildingType || "Building"}</span>
                            <small>{Math.round(building.footprintArea)} m² · {compactMoney(building.estimatedCost)}</small>
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="helper property-note">Red footprints will be demolished.</p>
                  </div>
                )}
                <div className="total">
                  <strong>Total investment</strong>
                  <strong title={money(infrastructureCost + propertyCost)}>
                    {compactMoney(infrastructureCost + propertyCost)}
                  </strong>
                </div>
              </div>
            )}
            {invalid && !routeError && tool !== "delete" && (!station || (stationEditable && stationChanged)) && (
              <p className="validation">
                <AlertTriangle size={14} />
                {invalid}
              </p>
            )}
            {(!station || stationEditable) && <>
              <button
                className={`primary full ${tool === "delete" ? "danger" : ""}`}
                disabled={!!routeError || (tool !== "delete" && !!invalid)}
                onClick={commit}
              >
                {tool === "delete" ? <Trash2 size={16} /> : <Check size={17} />}{" "}
                {tool === "delete"
                  ? "Remove selected infrastructure"
                  : station
                    ? oldStation ? "Apply station changes" : "Build station"
                    : expansion
                      ? "Build additional tracks"
                      : "Apply construction"}
              </button>
              <p className="apply-note">
                {tool === "delete"
                  ? "No refund in this prototype."
                  : "Preview only until applied."}
              </p>
            </>}
            {oldStation && station && (
              <button className="station-delete" onClick={deleteStation}>
                <Trash2 size={15} /> Remove station
              </button>
            )}
          </>
        )}
      </aside>
      <div className="bottom-bar">
        <div className="map-legend">
          <span>
            <i className="legend-row" />
            Available ROW
          </span>
          <span>
            <i className="legend-built" />
            Built railway
          </span>
          <span>
            <i className="legend-preview" />
            Preview
          </span>
          <span>
            <i className="legend-electric" />
            Electrified
          </span>
        </div>
        <div className="network-stats">
          <div>
            <strong>
              {builtKm.toFixed(1)}
              <small>km</small>
            </strong>
            <span>NETWORK BUILT</span>
          </div>
          <i />
          <div>
            <strong>{compactMoney(project.spent)}</strong>
            <span>TOTAL INVESTMENT</span>
          </div>
          <i />
          <div>
            <strong>{Object.keys(project.stations).length}</strong>
            <span>STATIONS BUILT</span>
          </div>
        </div>
      </div>
      <div className="map-hint">
        <span className="live-dot" />
        {station
          ? "Station footprint · edit its name and infrastructure before applying"
          : tool === "station"
            ? "Click available ROW to place a new station"
          : selection
              ? "Click near an endpoint to move it · Drag the route to add a waypoint"
              : tool === "build"
                ? anchor ? "Start set · Click a railway to place B" : "Click a railway to place A, then B"
                : "Select a corridor to explore its possibilities"}
      </div>
      {(!network || !ready) && (
        <div className="loading-card">
          <TrainTrack size={23} />
          <strong>
            {error ? "Data unavailable" : "Opening the railway workshop"}
          </strong>
            <p>{error || "Loading the Swedish OSM network and vector map…"}</p>
          {error && (
            <button onClick={() => location.reload()}>Try again</button>
          )}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {resetting && (
        <div className="reset-popover">
          <strong>Start a new railway?</strong>
          <p>
            This clears the current workspace. Your browser save stays available
            until you save again.
          </p>
          <div>
            <button onClick={() => setResetting(false)}>Cancel</button>
            <button
              className="danger"
              onClick={() => {
                setProject(emptyProject(REGION.key));
                setSelection(null);
                setAnchor(null);
                setRouteError("");
                setStationId(null);
                setDirty(true);
                setResetting(false);
                notify("New project. All ROW is available.");
              }}
            >
              New project
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
