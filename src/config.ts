// Edit region.json and regenerate the bundled snapshot to change the national data snapshot.
import region from "../region.json";
export const REGION = {
  ...region,
  key: `${region.dataUrl}:${region.bbox.join(",")}:centerline-network-v3`,
  bbox: region.bbox as [number, number, number, number],
};
// Planning track-area allowance, not a surveyed/legal right-of-way boundary.
// 10.5 m outside allowance; 4.5 m within pairs and 6 m between pairs.
// See reports/railway-review.md for the project reference and extrapolation.
export const WIDTHS = [0, 10.5, 15, 21, 25.5];
export const SPEEDS = [80, 100, 120, 160, 200, 250, 300, 320];
export const STATION_LENGTHS = [100, 150, 200, 250, 300, 400];
export const BASEMAPS = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};
