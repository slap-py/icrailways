import { pointAt } from "./geometry";
import { effectiveSections, emptyProject, selectionParts } from "./construction";
import { routeSelection } from "./routing";
import { defaultDepotOutline, normalizeDepot } from "./depots";
import { suggestDepotName, suggestStationName } from "./stations";
import { trackCost } from "./cost";
import type { Network, Project, Section, Station } from "./types";

export const DEMO_BUDGET = 750_000_000;

export interface ServiceOpportunity {
  id: string;
  from: Station;
  to: Station;
  connected: boolean;
  distanceKm: number;
  journeyMinutes: number | null;
  estimatedDailyTrips: number | null;
  departuresPerDay: number;
}

function coveredJourney(parts: ReturnType<typeof selectionParts>, sections: Section[]) {
  let minutes = 0;
  for (const part of parts) {
    const cuts = [...new Set([part.start, part.end, ...sections
      .filter(section => section.corridorId === part.corridorId && section.start < part.end && section.end > part.start)
      .flatMap(section => [Math.max(part.start, section.start), Math.min(part.end, section.end)])])].sort((a, b) => a - b);
    for (let index = 0; index < cuts.length - 1; index++) {
      const start = cuts[index], end = cuts[index + 1], middle = (start + end) / 2;
      const candidates = sections.filter(section => section.corridorId === part.corridorId && section.start <= middle && section.end >= middle);
      if (!candidates.length) return null;
      minutes += ((end - start) / 1000) / Math.max(...candidates.map(section => section.maxSpeedKph)) * 60;
    }
  }
  return minutes;
}

/** A deliberately small, explicit planning estimate—not ticket sales or observed passengers. */
export function estimatedDailyDemand(reachA: number, reachB: number, distanceKm: number, journeyMinutes: number, departuresPerDay = 8) {
  if (!reachA || !reachB) return 0;
  const cityPair = Math.sqrt(reachA * reachB);
  const distanceFit = Math.exp(-distanceKm / 450);
  const timeFit = Math.exp(-journeyMinutes / 300);
  const frequencyFit = 1 - Math.exp(-Math.max(0, departuresPerDay) / 5);
  return Math.max(0, Math.round(cityPair * 0.022 * distanceFit * timeFit * frequencyFit));
}

export function serviceOpportunities(network: Network, project: Project, potentialReach: Record<string, number>, departuresPerDay = 8) {
  const stations = Object.values(project.stations);
  const built = effectiveSections(project);
  const opportunities: ServiceOpportunity[] = [];
  for (let a = 0; a < stations.length; a++) for (let b = a + 1; b < stations.length; b++) {
    const from = stations[a], to = stations[b];
    const route = routeSelection(network.corridors,
      { corridorId: from.corridorId, position: from.position },
      { corridorId: to.corridorId, position: to.position }, network.stations);
    if (!route) {
      opportunities.push({ id: `${from.id}:${to.id}`, from, to, connected: false, distanceKm: 0, journeyMinutes: null, estimatedDailyTrips: null, departuresPerDay });
      continue;
    }
    const parts = selectionParts(route);
    const distanceKm = parts.reduce((sum, part) => sum + part.end - part.start, 0) / 1000;
    const journeyMinutes = coveredJourney(parts, built);
    opportunities.push({ id: `${from.id}:${to.id}`, from, to, connected: journeyMinutes !== null, distanceKm,
      journeyMinutes, estimatedDailyTrips: journeyMinutes === null ? null : estimatedDailyDemand(potentialReach[from.id] || 0, potentialReach[to.id] || 0, distanceKm, journeyMinutes, departuresPerDay), departuresPerDay });
  }
  return opportunities.sort((a, b) => Number(b.connected) - Number(a.connected) || (b.estimatedDailyTrips || 0) - (a.estimatedDailyTrips || 0));
}

export function stationConnection(station: Station, sections: Section[]) {
  return sections.some(section => section.corridorId === station.corridorId && section.start <= station.position && section.end >= station.position);
}

export function demoProject(network: Network, networkKey: string): Project {
  const candidates = network.corridors.filter(corridor => corridor.length >= 20_000 && corridor.length <= 180_000);
  const corridor = [...(candidates.length ? candidates : network.corridors)].sort((a, b) => b.length - a.length || a.id.localeCompare(b.id))[0];
  if (!corridor) return emptyProject(networkKey);
  const start = corridor.length * 0.18, end = corridor.length * 0.82;
  const firstCoordinates = pointAt(corridor, start), secondCoordinates = pointAt(corridor, end);
  const firstName = suggestStationName(firstCoordinates, network.places, {});
  const first: Station = { id: "demo-station-a", name: firstName, coordinates: firstCoordinates,
    corridorId: corridor.id, position: start, lateralOffsetMeters: 0, lengthMeters: 250, platforms: 3 };
  const secondName = suggestStationName(secondCoordinates, network.places, { [first.id]: first });
  const second: Station = { id: "demo-station-b", name: secondName, coordinates: secondCoordinates,
    corridorId: corridor.id, position: end, lateralOffsetMeters: 0, lengthMeters: 250, platforms: 3 };
  const depotPosition = start + Math.min(1_500, (end - start) * 0.08);
  const depotName = suggestDepotName(pointAt(corridor, depotPosition), network.places, {});
  const project = emptyProject(networkKey);
  const investment = trackCost(end - start, 2, 200, true);
  return { ...project, sections: [{ id: "demo-main-line", corridorId: corridor.id, start, end,
    tracks: 2, maxSpeedKph: 200, electrified: true }], stations: { [first.id]: first, [second.id]: second },
    depots: { "demo-yard": normalizeDepot({ id: "demo-yard", name: depotName, corridorId: corridor.id,
      position: depotPosition, tracks: 6, lengthMeters: 250, side: 1, outline: defaultDepotOutline() }) }, spent: investment };
}
