import { test, expect } from "@playwright/test";

/**
 * Real keyboard-only pass through checkout (PROMPTS.md Phase 5 acceptance criteria): every step
 * reachable via Tab/Enter/Space with no mouse, and every validation error genuinely announced to
 * assistive tech — checked here via `role="alert"` (an ARIA live region Playwright/axe treat the
 * same way a screen reader does) and `aria-describedby`/`aria-invalid` wiring, not just "the red
 * text is visible on screen."
 */
const RED_TEA = "/product/premium-herbal-red-tea-loose";

test("an invalid field shows an accessible, programmatically-associated error", async ({ page }) => {
  await page.goto(RED_TEA);
  await page.locator("#pdp-buy-box").getByRole("button", { name: "Add to cart" }).click();
  await page.getByRole("link", { name: "Checkout" }).click();
  await expect(page).toHaveURL(/\/checkout\/?$/);

  const emailInput = page.getByLabel("Email");
  await emailInput.click();
  await emailInput.fill("not-an-email");
  await emailInput.blur();

  const error = page.locator("#checkout-email-error");
  await expect(error).toBeVisible();
  await expect(error).toHaveAttribute("role", "alert");
  await expect(emailInput).toHaveAttribute("aria-invalid", "true");
  await expect(emailInput).toHaveAttribute("aria-describedby", "checkout-email-error");
});

test("checkout is completable start to finish using only the keyboard (Tab / Space / Enter)", async ({ page }) => {
  await page.goto(RED_TEA);
  // Add to cart is itself keyboard-reachable — Tab to it and press Enter/Space rather than click.
  await page.locator("#pdp-buy-box").getByRole("button", { name: "Add to cart" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /your cart \(/i })).toBeVisible();

  await page.getByRole("link", { name: "Checkout" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/checkout\/?$/);

  await page.getByLabel("Email").focus();
  await page.keyboard.type(`e2e-kb-${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Continue to address" }).focus();
  await page.keyboard.press("Enter");

  await page.getByLabel("Full name").focus();
  await page.keyboard.type("Keyboard Tester");
  await page.getByLabel("Mobile number").focus();
  await page.keyboard.type("9876543213");
  await page.getByLabel("Pincode").focus();
  await page.keyboard.type("148001");
  await page.getByLabel("Address line 1").focus();
  await page.keyboard.type("7 Keyboard Way");
  await page.getByLabel("City").focus();
  await page.keyboard.type("Sangrur");

  // The state control is a real Radix Select trigger — Enter opens it, typeahead + Enter selects.
  await page.locator("#checkout-state").focus();
  await page.keyboard.press("Enter");
  await page.keyboard.type("Punjab");
  await page.keyboard.press("Enter");

  await page.getByRole("button", { name: "Continue to payment" }).focus();
  await page.keyboard.press("Enter");

  // Radio group: Space activates a focused radio item, exactly as native radios behave.
  await page.getByRole("radio", { name: /cash on delivery/i }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("radio", { name: /cash on delivery/i })).toBeChecked();

  await page.getByRole("button", { name: "Place order" }).focus();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/order\/DM-\d{4}-\d{5}/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /thank you/i })).toBeVisible();
});
