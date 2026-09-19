import type {
  Project,
  Section,
  Expansion,
  Selection,
  SelectionPart,
  TrackCount,
} from "./types";
export const selectionParts = (selection: Selection): SelectionPart[] =>
  selection.parts?.length
    ? selection.parts
    : [
        {
          corridorId: selection.corridorId,
          start: selection.start,
          end: selection.end,
        },
      ];
export const selectionLength = (selection: Selection) =>
  selectionParts(selection).reduce(
    (total, part) => total + part.end - part.start,
    0,
  );
export const emptyProject = (networkKey: string): Project => ({
  version: 1,
  networkKey,
  sections: [],
  expansions: [],
  stations: {},
  demolished: [],
  spent: 0,
});
const overlap = (
  a: { start: number; end: number },
  b: { start: number; end: number },
) => a.start < b.end && a.end > b.start;
function cut<
  T extends { id: string; corridorId: string; start: number; end: number },
>(items: T[], selection: SelectionPart): T[] {
  return items.flatMap((s) =>
    s.corridorId !== selection.corridorId || !overlap(s, selection)
      ? [s]
      : [
          ...(s.start < selection.start
            ? [{ ...s, id: s.id + "-a", end: selection.start }]
            : []),
          ...(s.end > selection.end
            ? [{ ...s, id: s.id + "-b", start: selection.end }]
            : []),
        ],
  );
}
export function replaceSection(
  project: Project,
  selection: Selection,
  tracks: TrackCount | 0,
  maxSpeedKph: number,
): Project {
  const parts = selectionParts(selection);
  let sections = project.sections;
  let expansions = project.expansions;
  for (const part of parts) {
    sections = cut(sections, part);
    expansions = cut(expansions, part);
  }
  return {
    ...project,
    sections: [
      ...sections,
      ...(tracks
        ? parts.map((part) => ({
            ...part,
            id: crypto.randomUUID(),
            tracks,
            maxSpeedKph,
          }))
        : []),
    ],
    expansions,
  };
}
export function effectiveSections(project: Project): Section[] {
  return project.sections.flatMap((s) => {
    const expansions = project.expansions.filter(
      (e) => e.corridorId === s.corridorId && overlap(e, s),
    );
    const cuts = [
      ...new Set([
        s.start,
        s.end,
        ...expansions.flatMap((e) => [
          Math.max(s.start, e.start),
          Math.min(s.end, e.end),
        ]),
      ]),
    ].sort((a, b) => a - b);
    return cuts
      .slice(0, -1)
      .map((start, i) => ({
        ...s,
        id: `${s.id}-${i}`,
        start,
        end: cuts[i + 1],
        tracks: Math.min(
          4,
          s.tracks +
            expansions
              .filter((e) => e.start <= start && e.end >= cuts[i + 1])
              .reduce((n, e) => n + e.addedTracks, 0),
        ) as TrackCount,
      }));
  });
}
export function expansionError(
  project: Project,
  selection: Selection,
  type: Expansion["type"],
) {
  for (const part of selectionParts(selection)) {
    const error = expansionPartError(project, part, type);
    if (error) return error;
  }
  return "";
}
function expansionPartError(
  project: Project,
  selection: SelectionPart,
  type: Expansion["type"],
) {
  const required = type === "passing" ? 1 : 2;
  const sections = effectiveSections(project)
    .filter(
      (s) => s.corridorId === selection.corridorId && overlap(s, selection),
    )
    .sort((a, b) => a.start - b.start);
  let cursor = selection.start;
  for (const section of sections) {
    if (section.start > cursor + 0.1 || section.tracks !== required)
      return `Select continuously built ${required === 1 ? "single" : "double"} track.`;
    cursor = Math.max(cursor, section.end);
  }
  return cursor < selection.end - 0.1
    ? `Build ${required === 1 ? "single" : "double"} track over this entire section first.`
    : "";
}
export const expansionCost = (
  distance: number,
  type: Expansion["type"],
  speed: number,
) =>
  (distance / 1000) *
  (type === "passing" ? 800_000 : 1_300_000) *
  (1 + Math.max(0, speed - 120) / 200);
export function removeExpansion(
  project: Project,
  selection: Selection,
): Project {
  let expansions = project.expansions;
  for (const part of selectionParts(selection))
    expansions = cut(expansions, part);
  return { ...project, expansions };
}

export function sectionMatches(
  sections: Section[],
  selection: Selection,
  tracks: number,
  speed: number,
) {
  return selectionParts(selection).every((part) =>
    sectionPartMatches(sections, part, tracks, speed),
  );
}
function sectionPartMatches(
  sections: Section[],
  selection: SelectionPart,
  tracks: number,
  speed: number,
) {
  let cursor = selection.start;
  const parts = sections
    .filter(
      (s) => s.corridorId === selection.corridorId && overlap(s, selection),
    )
    .sort((a, b) => a.start - b.start);
  for (const s of parts) {
    if (
      s.start > cursor + 0.01 ||
      s.tracks !== tracks ||
      s.maxSpeedKph !== speed
    )
      return false;
    cursor = Math.max(cursor, s.end);
  }
  return cursor >= selection.end - 0.01;
}
