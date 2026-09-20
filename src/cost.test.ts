import { test } from "node:test";
import assert from "node:assert/strict";
import { trackCost } from "./cost";
import { emptyProject, replaceSection, expansionPowerCost } from "./construction";
test("electrification scales with selected length and track count", () => {
  assert.ok(Math.abs(trackCost(1000, 2, 160, true) - trackCost(1000, 2, 160) - 500000) < 0.01);
  assert.equal(trackCost(500, 1, 120, true) - trackCost(500, 1, 120), 125000);
});
test("expansions wire only added tracks over electrified overlaps", () => {
  const part = { corridorId: "a", start: 0, end: 1000 };
  const project = replaceSection(emptyProject("test"), { ...part, end: 500 }, 1, 120, true);
  assert.equal(expansionPowerCost(project, part, "passing"), 125000);
  assert.equal(expansionPowerCost(project, { ...part, start: 250 }, "overtaking"), 125000);
});
