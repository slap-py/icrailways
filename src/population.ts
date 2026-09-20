import { useEffect, useState } from "react";
import type { PopulationCell } from "./catchment";

type Bounds = [number, number, number, number];
interface Manifest { year: number; tiles: string[] }
let manifest: Promise<Manifest> | undefined;
const tiles = new Map<string, Promise<PopulationCell[]>>();
async function json(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw Error(`Population data unavailable (${response.status})`);
  return response.json();
}
export async function populationCells(bounds: Bounds) {
  manifest ||= json("/data/population/index.json").catch(error => { manifest = undefined; throw error; });
  const index = await manifest;
  // A cell is indexed by its centroid; include neighboring edge cells.
  const keys = index.tiles.filter(key => {
    const [lon, lat] = key.split("_").map(Number);
    return lon + 1 >= bounds[0] - 0.03 && lon <= bounds[2] + 0.03 && lat + 1 >= bounds[1] - 0.01 && lat <= bounds[3] + 0.01;
  });
  return (await Promise.all(keys.map(key => {
    if (!tiles.has(key)) tiles.set(key, json(`/data/population/${key}.json`).then(d => d.features as PopulationCell[]).catch(error => { tiles.delete(key); throw error; }));
    return tiles.get(key)!;
  }))).flat().filter(c => {
    const [lon, lat] = c.properties.center;
    return lon >= bounds[0] - 0.03 && lon <= bounds[2] + 0.03 && lat >= bounds[1] - 0.01 && lat <= bounds[3] + 0.01;
  });
}
export function usePopulation(bounds: Bounds | null) {
  return usePopulationAreas(bounds ? [bounds] : []);
}
export function usePopulationAreas(bounds: Bounds[]) {
  const key = bounds.length ? JSON.stringify(bounds) : "";
  const [state, setState] = useState<{ key: string; cells: PopulationCell[]; error: string; loading: boolean }>({ key: "", cells: [], error: "", loading: false });
  useEffect(() => {
    let active = true;
    if (!key) { setState({ key, cells: [], error: "", loading: false }); return; }
    setState({ key, cells: [], error: "", loading: true });
    Promise.all((JSON.parse(key) as Bounds[]).map(populationCells)).then(groups => {
      const cells = [...new Map(groups.flat().map(cell => [cell.properties.id, cell])).values()];
      if (active) setState({ key, cells, error: "", loading: false });
    }).catch(error => { if (active) setState({ key, cells: [], error: error.message, loading: false }); });
    return () => { active = false; };
  }, [key]);
  return state.key === key ? state : { cells: [], error: "", loading: !!key };
}
