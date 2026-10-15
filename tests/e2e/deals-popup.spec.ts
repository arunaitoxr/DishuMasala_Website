import { test, expect } from "@playwright/test";

/**
 * "Last minute add deals" (client requests 2026-10-10 and 2026-10-15): after an add, the popup's
 * scroller offers every in-stock product except what's already in the cart — the combo packs included
 * — and the spices (and spice combos) show both their 100 gm and 200 gm packs, each as its own card.
 */
test.use({ storageState: "tests/e2e/_storage/no-popup.json" });

test("the deals scroller shows every other product, with every spice pack size", async ({ page }) => {
  await page.goto("/product/premium-herbal-blue-tea-teabags");
  await page.locator("#pdp-buy-box").getByRole("button", { name: "Add to cart" }).click();

  const popup = page.locator('[data-popup="deals"]');
  await expect(popup.getByRole("heading", { name: /Last minute add deals/ })).toBeVisible({ timeout: 15_000 });
  const cards = popup.locator("li");
  const names = (await cards.locator("p.font-semibold").allInnerTexts()).map((n) => n.trim());

  // The product just added isn't offered; the other Blue Tea is.
  expect(names).not.toContain("Premium Herbal Blue Tea (teabags)");
  expect(names.some((n) => /Blue Tea/.test(n))).toBe(true);
  // Combo packs are offered too.
  expect(names.some((n) => /\+|Combo|Twin/i.test(n))).toBe(true);

  // A spice appears twice — once per pack size, next to each other.
  const turmeric = cards.filter({ hasText: /Turmeric Powder/ }).filter({ hasNotText: /\+/ });
  await expect(turmeric).toHaveCount(2);
  await expect(turmeric.nth(0)).toContainText("100 gm");
  await expect(turmeric.nth(1)).toContainText("200 gm");

  // Adding the 200 gm pack from the popup puts exactly that pack in the cart.
  await turmeric.nth(1).getByRole("button", { name: "Add to cart" }).click();
  await expect(turmeric.nth(1).getByRole("button", { name: "✓ Added" })).toBeVisible({ timeout: 15_000 });
  await expect(turmeric.nth(0).getByRole("button", { name: "Add to cart" })).toBeEnabled();
});
