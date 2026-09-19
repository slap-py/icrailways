import type { LineString, Polygon, MultiPolygon, Position } from "geojson";
export type TrackCount = 1 | 2 | 3 | 4;
export type Tool =
  "select" | "build" | "passing" | "overtaking" | "station" | "delete";
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
  stations: Record<string, { lengthMeters: number; platforms: number }>;
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
}
