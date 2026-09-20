import type { Project } from "./types";
const KEY = "right-of-way-project-v1";
export function saveProject(project: Project) {
  localStorage.setItem(KEY, JSON.stringify(project));
}
export function loadProject(networkKey: string): Project {
  const raw = localStorage.getItem(KEY);
  if (!raw)
    throw new Error("No saved project yet. Build something, then choose Save.");
  const p = JSON.parse(raw) as Project;
  if (
    p.version !== 1 ||
    p.networkKey !== networkKey ||
    !Array.isArray(p.sections) ||
    !Array.isArray(p.expansions) ||
    !Array.isArray(p.demolished) ||
    !p.stations ||
    !Number.isFinite(p.spent)
  )
    throw new Error(
      "This save does not match the current region or prototype version.",
    );
  const sections = p.sections.map((section) => ({
    ...section,
    electrified: section.electrified === true,
  }));
  if (
    sections.some(
      (s) =>
        !s.corridorId ||
        !Number.isFinite(s.start) ||
        !Number.isFinite(s.end) ||
        s.start >= s.end ||
        ![1, 2, 3, 4].includes(s.tracks) ||
        s.maxSpeedKph < 80 ||
        s.maxSpeedKph > 320 ||
        typeof s.electrified !== "boolean",
    )
  )
    throw new Error("Saved construction data is invalid.");
  const stationValues = Object.values(p.stations);
  const legacyStations = stationValues.some(
    (station) => !station || !("corridorId" in station),
  );
  if (
    p.expansions.some(
      (e) =>
        !e.corridorId ||
        !Number.isFinite(e.start) ||
        !Number.isFinite(e.end) ||
        e.start >= e.end ||
        !["passing", "overtaking"].includes(e.type) ||
        e.addedTracks !== (e.type === "passing" ? 1 : 2),
    ) ||
    (!legacyStations && stationValues.some(
      (s) =>
        !s ||
        typeof s.id !== "string" ||
        typeof s.name !== "string" ||
        typeof s.corridorId !== "string" ||
        !Number.isFinite(s.position) ||
        !Array.isArray(s.coordinates) ||
        !Number.isInteger(s.lengthMeters) ||
        s.lengthMeters < 50 ||
        s.lengthMeters > 800 ||
        s.lengthMeters % 10 !== 0 ||
        (s.lateralOffsetMeters !== undefined &&
          (!Number.isFinite(s.lateralOffsetMeters) ||
            Math.abs(s.lateralOffsetMeters) > 250)) ||
        !Number.isInteger(s.platforms) ||
        s.platforms < 1 ||
        s.platforms > 12,
    )) ||
    p.demolished.some((id) => typeof id !== "string")
  )
    throw new Error("Saved station or expansion data is invalid.");
  const stations = legacyStations
    ? {}
    : Object.fromEntries(stationValues.map((station) => [station.id, {
        ...station,
        lateralOffsetMeters: station.lateralOffsetMeters || 0,
      }]));
  return { ...p, sections, stations };
}
