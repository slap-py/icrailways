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
} from "./geometry";
import { compactMoney, distanceLabel, money, trackCost } from "./cost";
import {
  effectiveSections,
  emptyProject,
  expansionCost,
  expansionError,
  removeExpansion,
  replaceSection,
  selectionLength,
  selectionParts,
  sectionMatches,
} from "./construction";
import {
  routeSelection,
  selectionEndpoints,
} from "./routing";
import { loadProject, saveProject } from "./persistence";
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
    [stationSearch, setStationSearch] = useState(""),
    [tracks, setTracks] = useState<TrackCount>(2),
    [speed, setSpeed] = useState(160),
    [stationLength, setStationLength] = useState(100),
    [platforms, setPlatforms] = useState(2);
  const [dark, setDark] = useState(false),
    [layers, setLayers] = useState({
      row: true,
      buildings: true,
      roads: false,
    }),
    [showLayers, setShowLayers] = useState(false),
    [toast, setToast] = useState(""),
    [dirty, setDirty] = useState(false),
    [ready, setReady] = useState(false),
    [resetting, setResetting] = useState(false),
    [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null),
    [deleteLoops, setDeleteLoops] = useState(false);
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
  const effective = useMemo(() => effectiveSections(project), [project]);
  const parts = selection ? selectionParts(selection) : [];
  const routeEndpoints = selection ? selectionEndpoints(selection) : undefined;
  const corridor = network?.corridors.find((c) => c.id === parts[0]?.corridorId);
  const multiSegment = parts.length > 1;
  const station = network?.stations.find((s) => s.id === stationId);
  const stationCorridor = network?.corridors.find(
    (c) => c.id === station?.corridorId,
  );
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
  const oldStation = station
    ? project.stations[station.id] || station
    : undefined;
  const stationChanged =
    !!oldStation &&
    (oldStation.lengthMeters !== stationLength ||
      oldStation.platforms !== platforms);
  const unchanged =
    !!selection &&
    !expansion &&
    sectionMatches(effective, selection, tracks, speed);
  const infrastructureCost = unchanged
    ? 0
    : station && oldStation
      ? Math.abs(stationLength - oldStation.lengthMeters) * platforms * 2500 +
        Math.abs(platforms - oldStation.platforms) * stationLength * 4000
      : selection
        ? expansion
          ? expansionCost(length, tool as "passing" | "overtaking", speed)
          : trackCost(length, tracks, speed)
        : 0;
  const invalid = routeError || (station
    ? blocked.length
      ? `${stationLength} m / ${platforms} platforms unavailable — road obstruction.`
      : !stationChanged
        ? "Change length or platform count to preview an upgrade."
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
    if (next !== "station") setStationId(null);
    if (next === "station") setSelection(null);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,select,textarea")) return;
      const item = tools.find((t) => t.key === e.key);
      if (item) changeTool(item.id);
      if (e.key === "Escape") {
        setStationId(null);
        setSelection(null);
        setAnchor(null);
        setRouteError("");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const selectStation = (id: string, fly = false) => {
    const s = network!.stations.find((s) => s.id === id)!;
    const saved = project.stations[id] || s;
    setAnchor(null);
    setRouteError("");
    setStationId(id);
    setStationSearch("");
    setSelection(null);
    setTool("station");
    setStationLength(saved.lengthMeters);
    setPlatforms(saved.platforms);
    if (fly) setFocus({ id, nonce: Date.now() });
  };
  const startRoute = () => {
    setSelection(null);
    setAnchor(null);
    setStationId(null);
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
    const next: [RouteEndpoint, RouteEndpoint] = [endpoints[0], endpoints[1]];
    next[end === "start" ? 0 : 1] = target;
    const routed = routeSelection(network.corridors, next[0], next[1], network.stations);
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
      notify("Choose a station dot, or use the station list.");
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
      setAnchor(null);
      setRouteError("");
    } else {
      if (tool === "select") setTool("build");
      placeEndpoint(placing, { corridorId: id, position });
    }
  };
  const updateEndpoint = (end: "start" | "end", value: number) => {
    if (!selection || !network) return;
    const endpoint = selectionEndpoints(selection)[end === "start" ? 0 : 1];
    const c = network.corridors.find((c) => c.id === endpoint.corridorId)!;
    placeEndpoint(end, { ...endpoint, position: Math.max(0, Math.min(c.length, value)) });
  };
  const routeStationPicker = (end: "start" | "end") => (
    <label className="route-station-picker">
      {end === "start" ? "Start at a station" : "Destination at a station"}
      <input
        type="search"
        placeholder="Search Swedish stations"
        value={stationSearch}
        onChange={(e) => setStationSearch(e.target.value)}
        aria-label="Search stations"
      />
      <select aria-label={end === "start" ? "Start at a station" : "Destination at a station"}
        value="" onChange={e => {
          const s = network?.stations.find(s => s.id === e.target.value);
          if (s) {
            if (tool === "select") setTool("build");
            placeEndpoint(end, { corridorId: s.corridorId, position: s.position });
          }
        }}>
        <option value="">Choose station…</option>
        {network?.stations
          .filter((s) => s.name.toLocaleLowerCase().includes(stationSearch.trim().toLocaleLowerCase()))
          .slice().sort((a,b) => a.name.localeCompare(b.name))
          .map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>
  );
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
          [station.id]: { lengthMeters: stationLength, platforms },
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
        : replaceSection(project, selection, tracks, speed);
    next = {
      ...next,
      demolished: [
        ...new Set([...next.demolished, ...affected.map((b) => b.id)]),
      ],
      spent: project.spent + infrastructureCost + propertyCost,
    };
    setProject(next);
    setDirty(true);
    notify(
      `${station ? "Station upgraded" : expansion ? "Additional tracks built" : "Track construction applied"} · ${compactMoney(infrastructureCost + propertyCost)}`,
    );
    if (expansion) {
      setTool("select");
      setTracks(previewTracks as TrackCount);
    }
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
        )
      )
        throw new Error("The saved network differs from this data snapshot.");
      setProject(p);
      setSelection(null);
      setAnchor(null);
      setRouteError("");
      setStationId(null);
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
          affected={affected.map((b) => b.id)}
          blocked={blocked.map((r) => r.id)}
          dark={dark}
          layers={layers}
          station={station}
          constructing={tool === "build" || expansion}
          focus={focus}
          onCorridor={selectCorridor}
          onStation={(id) => selectStation(id)}
          onHandle={placeEndpoint}
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
        <div className="region-pill">
          <span className="live-dot" />
          SWEDEN <span className="divider" /> {REGION.name}
          <ChevronDown size={13} />
        </div>
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
              {(
                [
                  ["row", "Available ROW"],
                  ["buildings", "Building footprints"],
                  ["roads", "Station road constraints"],
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
          <span className="prototype-tag">PROTOTYPE 01</span>
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
              }}
            >
              <X size={17} />
            </button>
          )}
        </div>
        {!station && !selection ? (
          <>
            <p className="intro">{anchor ? "A is set. Click anywhere along a connected railway to place B." : "Two points. One continuous railway."}</p>
            {anchor && <div className="route-status"><b>A · Start set</b><span>{network?.corridors.find(c => c.id === anchor.corridorId)?.name}</span><button className="text-button" onClick={startRoute}>Start again</button></div>}
            {routeError && <p className="route-error" role="alert">{routeError}</p>}
            {routeStationPicker(anchor ? "end" : "start")}
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
            </div>
            }
            <p className="description">
              Build along real railway corridors across Sweden. Choose
              a start and destination; the creator follows connected railways
              across junctions and data segments.
            </p>
            <button
              className="primary full"
              onClick={() => { if (!anchor) changeTool("build"); }}
            >
              <Plus size={17} />
              {tool === "build"
                ? anchor ? "Click the destination on the map" : "Click your start on the map"
                : "Build your first section"}
              <ArrowUpRight size={16} />
            </button>
            <div className="getting-started">
              <div>
                <b>01</b>
                <span>
                  <strong>Place A and B</strong>
                  <small>Click your start, then your destination.</small>
                </span>
              </div>
              <div>
                <b>02</b>
                <span>
                  <strong>Make it yours</strong>
                  <small>Adjust either endpoint. Set tracks and speed.</small>
                </span>
              </div>
              <div>
                <b>03</b>
                <span>
                  <strong>Review & build</strong>
                  <small>Check property impacts, then apply.</small>
                </span>
              </div>
            </div>
            <div className="explore">
              <span className="eyebrow">EXPLORE THE NETWORK</span>
              <button
                onClick={() => {
                  const c = [...(network?.corridors || [])].sort(
                    (a, b) => b.length - a.length,
                  )[0];
                  if (c) {
                    setTool("build");
                    setAnchor(null);
                    setRouteError("");
                    setSelection({ corridorId: c.id, start: 0, end: c.length });
                    setFocus({ id: c.id, nonce: Date.now() });
                  }
                }}
              >
                A long-distance corridor
                <ArrowUpRight size={15} />
              </button>
              <button
                onClick={() => {
                  const s =
                    network?.stations.find((s) => s.name === "Hallsberg") ||
                    network?.stations[0];
                  if (s) selectStation(s.id, true);
                }}
              >
                Station workshop · Hallsberg
                <ArrowUpRight size={15} />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="selection-name">
              <MapPin size={14} />
              <span>{station?.name || (multiSegment ? "Connected railway route" : corridor?.name)}</span>
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
                <div className="editor-section">
                  <label className="field-label">
                    STATION LENGTH <span>metres</span>
                  </label>
                  <div className="length-grid">
                    {STATION_LENGTHS.map((n) => (
                      <button
                        key={n}
                        className={stationLength === n ? "chosen" : ""}
                        onClick={() => setStationLength(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="editor-section">
                  <label className="field-label">
                    PLATFORMS <span>abstract footprint</span>
                  </label>
                  <div className="stepper">
                    <button
                      disabled={platforms <= 1}
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
                      disabled={platforms >= 12}
                      aria-label="More platforms"
                      onClick={() => setPlatforms(platforms + 1)}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <p className="helper">
                    {8 + platforms * 6} m wide · centred on the existing railway
                  </p>
                </div>
                <div
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
                </div>
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
                      <button aria-pressed={placing === end} onClick={() => { setPlacing(end); setRouteError(""); }}>
                        <b>{i ? "B" : "A"}</b><span>{i ? "Destination" : "Start"}<small>{name}</small></span>
                        <span>{placing === end ? "Placing" : "Move"}</span>
                      </button>
                      {routeStationPicker(end)}
                      <label className="endpoint-distance">Position on this railway
                        <input aria-label={`${end} distance in km`} type="number" min={0}
                          max={network!.corridors.find(c => c.id === endpoint.corridorId)!.length / 1000}
                          step="0.01" value={+(endpoint.position / 1000).toFixed(3)}
                          onChange={e => updateEndpoint(end, +e.target.value * 1000)} /> km
                      </label>
                    </div>;
                  })}
                </div>
                <p className="helper">Click the map to move {placing === "start" ? "A" : "B"}, or drag either marker onto another railway. The route follows connected right of way.</p>
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
                        <span>{WIDTHS[previewTracks]} m corridor width</span>
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
                  </>
                )}
              </>
            )}
            {tool !== "delete" && (
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
                  <p className="helper property-note">
                    Red footprints will be demolished. Alt-click a footprint on the map for
                    property details.
                  </p>
                )}
                <div className="total">
                  <strong>Total investment</strong>
                  <strong title={money(infrastructureCost + propertyCost)}>
                    {compactMoney(infrastructureCost + propertyCost)}
                  </strong>
                </div>
              </div>
            )}
            {invalid && !routeError && tool !== "delete" && (!station || stationChanged) && (
              <p className="validation">
                <AlertTriangle size={14} />
                {invalid}
              </p>
            )}
            <button
              className={`primary full ${tool === "delete" ? "danger" : ""}`}
              disabled={!!routeError || (tool !== "delete" && !!invalid)}
              onClick={commit}
            >
              {tool === "delete" ? <Trash2 size={16} /> : <Check size={17} />}{" "}
              {tool === "delete"
                ? "Remove selected infrastructure"
                : station
                  ? "Apply station upgrade"
                  : expansion
                    ? "Build additional tracks"
                    : "Apply construction"}
            </button>
            <p className="apply-note">
              {tool === "delete"
                ? "No refund in this prototype."
                : "Preview only until applied. No curve-speed limits."}
            </p>
          </>
        )}
        <div className="station-picker">
          <label className="eyebrow" htmlFor="station-picker">
            JUMP TO A STATION
          </label>
          <select
            id="station-picker"
            value={stationId || ""}
            onChange={(e) =>
              e.target.value && selectStation(e.target.value, true)
            }
          >
            <option value="">Choose station…</option>
            {network?.stations
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </div>
        <footer className="sidebar-footer">
          <span className="live-dot" />
          REAL GEOGRAPHY. YOUR INFRASTRUCTURE.
        </footer>
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
            <span>STATIONS UPGRADED</span>
          </div>
        </div>
      </div>
      <div className="map-hint">
        <span className="live-dot" />
        {station
          ? "Station footprint · roads are hard boundaries"
          : selection
              ? `Click a railway to move ${placing === "start" ? "A" : "B"} · Drag either marker to adjust`
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
