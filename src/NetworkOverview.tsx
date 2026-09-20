import { Landmark, Search, TrainFront, Warehouse, X } from "lucide-react";
import type { ChangeEvent } from "react";
import type { Depot, Project, Section, Station } from "./types";
import type { ServiceOpportunity } from "./planning";
import { DEMO_BUDGET, stationConnection } from "./planning";
import { depotMetrics } from "./depots";
import { compactMoney } from "./cost";

interface Props {
  project: Project;
  effective: Section[];
  opportunities: ServiceOpportunity[];
  query: string;
  onQuery: (value: string) => void;
  onStation: (station: Station) => void;
  onDepot: (depot: Depot) => void;
  onClose: () => void;
  onDemo: () => void;
  frequency: number;
  onFrequency: (value: number) => void;
}

export function NetworkOverview(p: Props) {
  const query = p.query.trim().toLocaleLowerCase();
  const stations = Object.values(p.project.stations).filter(station => station.name.toLocaleLowerCase().includes(query));
  const yards = Object.values(p.project.depots || {}).filter(yard => yard.name.toLocaleLowerCase().includes(query));
  const services = p.opportunities.filter(service => `${service.from.name} ${service.to.name}`.toLocaleLowerCase().includes(query));
  const remaining = DEMO_BUDGET - p.project.spent;
  return <aside className="inventory-panel" aria-label="Network overview">
    <div className="inventory-heading"><div><span className="eyebrow">PROJECT INVENTORY</span><h2>Your network</h2></div><button className="icon-button" aria-label="Close network overview" onClick={p.onClose}><X size={17} /></button></div>
    <label className="inventory-search"><Search size={14} /><input value={p.query} onChange={(event: ChangeEvent<HTMLInputElement>) => p.onQuery(event.target.value)} placeholder="Search stations, yards, services" /></label>
    <div className={`budget-card ${remaining < 0 ? "over" : ""}`}><span>DEMONSTRATION BUDGET</span><strong>{compactMoney(Math.abs(remaining))}</strong><small>{remaining < 0 ? "over objective" : "remaining"} · {compactMoney(p.project.spent)} invested</small></div>

    <section className="inventory-section"><h3><Landmark size={14} />Stations <b>{stations.length}</b></h3>
      {stations.map(station => <button className="inventory-item" key={station.id} onClick={() => p.onStation(station)}><span><strong>{station.name}</strong><small>{station.platforms} platforms · {station.lengthMeters} m</small></span><em className={stationConnection(station, p.effective) ? "connected" : "disconnected"}>{stationConnection(station, p.effective) ? "Connected" : "No built track"}</em></button>)}
      {!stations.length && <p className="inventory-empty">No matching stations.</p>}
    </section>

    <section className="inventory-section"><h3><Warehouse size={14} />Yards <b>{yards.length}</b></h3>
      {yards.map(yard => { const metrics = depotMetrics(yard); return <button className="inventory-item" key={yard.id} onClick={() => p.onDepot(yard)}><span><strong>{yard.name}</strong><small>{metrics.tracks} tracks · {Math.round(metrics.lengthMeters)} m usable</small></span><em className="connected">Connected</em></button>; })}
      {!yards.length && <p className="inventory-empty">No matching yards.</p>}
    </section>

    <section className="inventory-section service-opportunities"><h3><TrainFront size={14} />Service opportunities <b>{services.length}</b></h3>
      <label className="frequency-control"><span>Planned departures each way <b>{p.frequency}/day</b></span><input aria-label="Planned departures each way" type="range" min="2" max="24" step="2" value={p.frequency} onChange={event => p.onFrequency(Number(event.target.value))} /></label>
      {services.slice(0, 12).map(service => <div className="inventory-item" key={service.id}><span><strong>{service.from.name} – {service.to.name}</strong><small>{service.distanceKm ? `${Math.round(service.distanceKm)} km` : "No railway route"}{service.journeyMinutes !== null ? ` · ${Math.round(service.journeyMinutes)} min` : ""}</small></span><em className={service.connected ? "connected" : "disconnected"}>{service.connected ? service.estimatedDailyTrips ? `~${service.estimatedDailyTrips.toLocaleString()}/day` : "Reach loading" : "Track gap"}</em></div>)}
      {!services.length && <p className="inventory-empty">Build two stations to compare a city-to-city opportunity. Potential reach and estimated trips are kept separate.</p>}
      {!!services.length && <p className="inventory-note">Daily demand is a planning estimate from both stations’ potential reach, distance, planned frequency, and built-track journey time—not observed passengers or a timetable.</p>}
    </section>
    <button className="secondary full demo-button" onClick={p.onDemo}>Load deterministic demo network</button>
  </aside>;
}
