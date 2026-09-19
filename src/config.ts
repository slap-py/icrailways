// Edit region.json and regenerate the bundled snapshot to change the national data snapshot.
import region from "../region.json";
export const REGION = {
  ...region,
  key: `${region.dataUrl}:${region.bbox.join(",")}:clean-network-v1`,
  bbox: region.bbox as [number, number, number, number],
};
export const WIDTHS = [0, 8, 14, 20, 26];
export const SPEEDS = [80, 100, 120, 160, 200, 250, 300, 320];
export const STATION_LENGTHS = [100, 150, 200, 250, 300, 400];
export const BASEMAPS = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};
