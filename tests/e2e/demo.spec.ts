import { expect, test } from "@playwright/test";

async function loadDemo(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByLabel("Interactive railway construction map")).toBeVisible();
  await page.getByRole("button", { name: "Network" }).click();
  await page.getByRole("button", { name: "Load deterministic demo network" }).click();
  await expect(page.getByText("Deterministic demo network loaded.")).toBeVisible();
}

test("deterministic demo saves, clears, and restores", async ({ page }) => {
  await loadDemo(page);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Project saved in this browser.")).toBeVisible();
  await page.getByTitle("New project").click();
  await page.locator(".reset-popover").getByRole("button", { name: "New project" }).click();
  await page.getByRole("button", { name: "Load" }).click();
  await page.getByRole("button", { name: "Network" }).click();
  const stationSection = page.locator(".inventory-section").filter({ has: page.getByRole("heading", { name: /^Stations/ }) });
  await expect(stationSection.locator(".inventory-item")).toHaveCount(2);
});

test("yard edits cancel cleanly and the overview exposes demand separately from reach", async ({ page }) => {
  await loadDemo(page);
  await page.getByRole("button", { name: "Network" }).click();
  await expect(page.getByText("Service opportunities")).toBeVisible();
  await expect(page.getByText(/planning estimate/i)).toBeVisible();
  const yardSection = page.locator(".inventory-section").filter({ hasText: "Yards" });
  const originalName = await yardSection.locator(".inventory-item strong").first().innerText();
  await yardSection.locator(".inventory-item").first().click();
  await page.getByRole("button", { name: "Edit yard" }).click();
  await page.getByLabel("Name").fill("Temporary edit");
  await expect(page.getByText("Unapplied yard draft")).toBeVisible();
  await page.getByRole("button", { name: "Cancel changes" }).click();
  await expect(page.locator(".selection-name strong")).toHaveText(originalName);
});

test("narrow layout, theme, planning opacity, and offline state remain usable", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Dark map" }).click();
  await expect(page.locator(".app")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Layers" }).click();
  await expect(page.getByLabel("Planning overlay intensity")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Population map", exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "Network" }).click();
  const box = await page.getByRole("complementary", { name: "Network overview", exact: true }).boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.getByText(/Offline · local railway data remains editable/)).toBeVisible();
  await context.setOffline(false);
});
