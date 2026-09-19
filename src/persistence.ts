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
  if (
    p.sections.some(
      (s) =>
        !s.corridorId ||
        !Number.isFinite(s.start) ||
        !Number.isFinite(s.end) ||
        s.start >= s.end ||
        ![1, 2, 3, 4].includes(s.tracks) ||
        s.maxSpeedKph < 80 ||
        s.maxSpeedKph > 320,
    )
  )
    throw new Error("Saved construction data is invalid.");
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
    Object.values(p.stations).some(
      (s) =>
        !s ||
        ![100, 150, 200, 250, 300, 400].includes(s.lengthMeters) ||
        !Number.isInteger(s.platforms) ||
        s.platforms < 1 ||
        s.platforms > 12,
    ) ||
    p.demolished.some((id) => typeof id !== "string")
  )
    throw new Error("Saved station or expansion data is invalid.");
  return p;
}
