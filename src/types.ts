import type { LineString, Polygon, MultiPolygon, Position } from "geojson";
export type TrackCount = 1 | 2 | 3 | 4;
export type Tool =
  "select" | "build" | "passing" | "overtaking" | "station" | "depot" | "delete";
export interface Depot {
  id: string;
  name: string;
  corridorId: string;
  position: number;
  /** Cached derived capacity; legacy saves without outline use these to recover their footprint. */
  tracks: number;
  lengthMeters: number;
  side: 1 | -1;
  direction?: 1 | -1;
  /** Editable vertices in metres relative to the rail connection and direction. */
  outline?: [number, number][];
  through?: boolean;
  exit?: RouteEndpoint;
}
export interface Corridor {
  id: string;
  name: string;
  geometry: LineString;
  osmWayIds: number[];
  length: number;
}
export interface Section {
  id: string;
  corridorId: string;
  start: number;
  end: number;
  tracks: TrackCount;
  maxSpeedKph: number;
  electrified: boolean;
}
export interface Expansion {
  id: string;
  corridorId: string;
  start: number;
  end: number;
  addedTracks: number;
  type: "passing" | "overtaking";
}
export interface Station {
  id: string;
  name: string;
  coordinates: Position;
  corridorId: string;
  position: number;
  /** Signed perpendicular distance from the mapped ROW centreline. */
  lateralOffsetMeters?: number;
  lengthMeters: number;
  platforms: number;
}
export interface Building {
  id: string;
  geometry: Polygon | MultiPolygon;
  buildingType: string;
  levels: number;
  footprintArea: number;
  estimatedCost: number;
  levelSource: string;
}
export interface Road {
  id: string;
  name: string;
  highway: string;
  geometry: LineString;
}
export interface Network {
  places?: { id: string; name: string; coordinates: Position; geometry?: Polygon | MultiPolygon; bounds?: number[] }[];
  corridors: Corridor[];
  stations: Station[];
  buildings: Building[];
  roads: Road[];
  meta: { fetchedAt: string; bbox: number[]; attribution: string };
}
export interface Project {
  version: 1;
  networkKey: string;
  sections: Section[];
  expansions: Expansion[];
  stations: Record<string, Station>;
  depots?: Record<string, Depot>;
  demolished: string[];
  spent: number;
}
export interface SelectionPart {
  corridorId: string;
  start: number;
  end: number;
}
export interface RouteEndpoint {
  corridorId: string;
  position: number;
}
export interface Selection extends SelectionPart {
  parts?: SelectionPart[];
  endpoints?: [RouteEndpoint, RouteEndpoint];
  waypoints?: RouteEndpoint[];
}
