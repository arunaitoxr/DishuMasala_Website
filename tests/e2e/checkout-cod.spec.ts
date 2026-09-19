import { test, expect } from "@playwright/test";

/** A separate Cash on Delivery run (PROMPTS.md Phase 5 item 12) — no payment gateway involved at
 * all, the order is confirmed directly by app/api/checkout/route.ts. */
const RED_TEA = "/product/premium-herbal-red-tea-loose";

test("browse → add to cart → checkout → Cash on Delivery → confirmation", async ({ page }) => {
  await page.goto(RED_TEA);
  await page.locator("#pdp-buy-box").getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("heading", { name: /your cart \(/i })).toBeVisible();

  await page.getByRole("link", { name: "Checkout" }).click();
  await expect(page).toHaveURL(/\/checkout\/?$/);

  const email = `e2e-cod-${Date.now()}@example.com`;
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue to address" }).click();

  await page.getByLabel("Full name").fill("COD Tester");
  await page.getByLabel("Mobile number").fill("9876543211");
  await page.getByLabel("Pincode").fill("148001");
  await page.getByLabel("Address line 1").fill("42 Cash Lane");
  await page.getByLabel("City").fill("Sangrur");
  await page.locator("#checkout-state").click();
  await page.keyboard.type("Punjab");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Continue to payment" }).click();

  await page.getByRole("radio", { name: /cash on delivery/i }).check();
  await page.getByRole("button", { name: "Place order" }).click();

  await expect(page).toHaveURL(/\/order\/DM-\d{4}-\d{5}/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /thank you/i })).toBeVisible();
  await expect(page.getByText(/payable on delivery/i)).toBeVisible();
});
