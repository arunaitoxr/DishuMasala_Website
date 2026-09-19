import { test, expect } from "@playwright/test";
import { registerConfirmedCustomer } from "./_helpers/auth";

/**
 * Real proof of PROMPTS.md Phase 6's acceptance criterion: "An anonymous wishlist and cart merge
 * into the account on login without losing items." Populates both as a real anonymous browser
 * session (localStorage, via the actual PDP add-to-cart/wishlist controls — not seeded directly),
 * registers+signs in (which the account has zero prior wishlist/cart items for, so the union here
 * is trivially "anonymous side survives" — tests/integration/account-security.test.ts separately
 * proves the harder case where BOTH sides already have real, different items).
 */
const BLUE_TEA = "/product/premium-herbal-blue-tea-loose";
const RED_TEA = "/product/premium-herbal-red-tea-loose";

test("anonymous cart + wishlist merge into the account on login", async ({ page, request }) => {
  // ---- Populate anonymous cart + wishlist -------------------------------------------------
  await page.goto(BLUE_TEA);
  await page.locator("#pdp-buy-box").getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("heading", { name: /your cart \(1\)/i })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /add .* to wishlist/i }).first().click();

  await page.goto(RED_TEA);
  await page.getByRole("button", { name: /add .* to wishlist/i }).first().click();

  const cartCountBefore = await page.evaluate(() => {
    const raw = localStorage.getItem("dm-cart");
    return raw ? JSON.parse(raw).state.lines.length : 0;
  });
  const wishlistCountBefore = await page.evaluate(() => {
    const raw = localStorage.getItem("dm-wishlist");
    return raw ? JSON.parse(raw).state.productIds.length : 0;
  });
  expect(cartCountBefore).toBe(1);
  expect(wishlistCountBefore).toBe(2);

  // ---- Register + sign in (a brand-new account — nothing to merge from the DB side here) -----
  const suffix = Date.now();
  const email = `e2e-merge-${suffix}@example.com`;
  const password = "merge-test-password-1";

  await registerConfirmedCustomer(page, request, { name: "Merge Tester", email, password });
  await page.goto("/login");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account\/?$/);

  // AccountSync's merge is async (fires right after the sign-in transition) — poll the account
  // dashboard's own tiles, which read straight from the DB, until it lands.
  await expect(async () => {
    await page.reload();
    await expect(page.getByText("Wishlist items")).toBeVisible();
    const wishlistTile = page.locator("text=Wishlist items").locator("..").locator("p").first();
    await expect(wishlistTile).toHaveText("2");
  }).toPass({ timeout: 15_000 });

  // The cart itself (not just a count) still has the item — nothing silently dropped.
  await page.goto("/cart");
  await expect(page.getByText(/premium herbal blue tea/i)).toBeVisible();

  // And the wishlist page lists both products.
  await page.goto("/account/wishlist");
  await expect(page.getByText(/premium herbal blue tea/i)).toBeVisible();
  await expect(page.getByText(/premium herbal red tea/i)).toBeVisible();
});
