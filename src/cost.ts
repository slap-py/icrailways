const speedRates = [
  [80, 0.8],
  [100, 0.9],
  [120, 1],
  [160, 1.15],
  [200, 1.4],
  [250, 1.8],
  [300, 2.3],
  [320, 2.6],
];
export function speedMultiplier(speed: number) {
  for (let i = 1; i < speedRates.length; i++) {
    const [x1, y1] = speedRates[i - 1],
      [x2, y2] = speedRates[i];
    if (speed <= x2)
      return y1 + ((Math.max(x1, speed) - x1) / (x2 - x1)) * (y2 - y1);
  }
  return 2.6;
}
export function trackCost(meters: number, tracks: number, speed: number) {
  return (
    (meters / 1000) *
    1_000_000 *
    [0, 1, 1.8, 2.5, 3.1][tracks] *
    speedMultiplier(speed)
  );
}
export function buildingEstimate(tags: Record<string, string>, area: number) {
  const type = tags.building || "unknown";
  const category = /industrial|warehouse/.test(type)
    ? "industrial"
    : /office/.test(type)
      ? "office"
      : /commercial|retail/.test(type)
        ? "commercial"
        : /civic|public|school|hospital|church|university/.test(type)
          ? "civic"
          : /house|residential|apartments|detached|terrace/.test(type)
            ? "residential"
            : "unknown";
  const defaults: Record<string, number> = {
    residential: 2,
    commercial: 2,
    office: 3,
    industrial: 1,
    civic: 2,
    unknown: 1,
  };
  const multipliers: Record<string, number> = {
    residential: 1,
    commercial: 1.2,
    office: 1.4,
    industrial: 0.7,
    civic: 1.5,
    unknown: 1,
  };
  const levelsTag = parseFloat(tags["building:levels"]);
  const height = parseFloat(tags.height);
  const levels =
    levelsTag > 0
      ? levelsTag
      : height > 0
        ? Math.max(1, Math.round(height / 3))
        : defaults[category];
  return {
    buildingType: type,
    levels,
    footprintArea: area,
    estimatedCost: area * levels * 1500 * multipliers[category],
    levelSource:
      levelsTag > 0
        ? "OSM levels"
        : height > 0
          ? "estimated from height"
          : "type default",
  };
}
export const money = (value: number) =>
  new Intl.NumberFormat("en", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
export const compactMoney = (value: number) =>
  value >= 1e6 ? `€${(value / 1e6).toFixed(2)}m` : money(value);
export const distanceLabel = (value: number) =>
  value >= 1000 ? `${(value / 1000).toFixed(2)} km` : `${Math.round(value)} m`;
