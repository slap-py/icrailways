import { booleanPointInPolygon, distance } from "@turf/turf";
import type { Position } from "geojson";
import type { Network, Station } from "./types";

export const MIN_STATION_LENGTH = 50;
export const MAX_STATION_LENGTH = 800;

const roundedStationLength = (meters: number) =>
  Math.max(MIN_STATION_LENGTH, Math.min(MAX_STATION_LENGTH, Math.round(meters / 10) * 10));

export function resizeStationSpan(
  position: number,
  lengthMeters: number,
  draggedPosition: number,
  end: "start" | "end",
  symmetric: boolean,
  corridorLength: number,
) {
  if (symmetric)
    return { position, lengthMeters: roundedStationLength(Math.abs(draggedPosition - position) * 2) };
  if (end === "start") {
    const fixedEnd = position + lengthMeters / 2;
    const start = Math.max(0, Math.min(fixedEnd - MIN_STATION_LENGTH, Math.max(fixedEnd - MAX_STATION_LENGTH, draggedPosition)));
    const nextLength = roundedStationLength(fixedEnd - start);
    return { position: fixedEnd - nextLength / 2, lengthMeters: nextLength };
  }
  const fixedStart = position - lengthMeters / 2;
  const finish = Math.min(corridorLength, Math.max(fixedStart + MIN_STATION_LENGTH, Math.min(fixedStart + MAX_STATION_LENGTH, draggedPosition)));
  const nextLength = roundedStationLength(finish - fixedStart);
  return { position: fixedStart + nextLength / 2, lengthMeters: nextLength };
}

export function suggestStationName(coordinates: Position, places: Network["places"], stations: Record<string, Station>) {
  let nearest: { name: string; meters: number } | undefined;
  for (const place of places || []) {
    const b = place.bounds;
    if (place.geometry && (!b || (coordinates[0] >= b[0] && coordinates[0] <= b[2] && coordinates[1] >= b[1] && coordinates[1] <= b[3])) && booleanPointInPolygon(coordinates, place.geometry)) {
      nearest = { name: place.name, meters: 0 };
      break;
    }
    const meters = distance(coordinates, place.coordinates, { units: "meters" });
    if (meters <= 15000 && (!nearest || meters < nearest.meters)) nearest = { name: place.name, meters };
  }
  const base = nearest ? nearest.name : "New station";
  const names = new Set(Object.values(stations).map(s => s.name.toLocaleLowerCase()));
  let name = base;
  for (let suffix = 2; names.has(name.toLocaleLowerCase()); suffix++) name = `${base} ${suffix}`;
  return name;
}

export function stationPreviews(stations: Record<string, Station>, preview?: Station) {
  return [...Object.values(stations).filter(s => s.id !== preview?.id), ...(preview ? [preview] : [])];
}
