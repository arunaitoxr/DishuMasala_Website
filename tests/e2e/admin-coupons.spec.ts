import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { adminCredentials } from "./_helpers/admin";

/**
 * Coupons end to end (client request, 2026-10-13): staff create a fixed and a capped percentage coupon
 * in the admin, the capped one is applied in the real cart and gives exactly its upper limit, an
 * IST start time survives a save unchanged, and both are deleted behind the typed confirmation.
 */
const { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } = adminCredentials();

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account\/?$/, { timeout: 15_000 });
}

async function createCoupon(page: Page, fill: (page: Page) => Promise<void>): Promise<string> {
  await page.goto("/admin/coupons/new");
  await fill(page);
  await page.getByRole("button", { name: "Create coupon" }).click();
  await expect(page).toHaveURL(/\/admin\/coupons\/\d+$/, { timeout: 15_000 });
  return page.url();
}

async function deleteCoupon(page: Page, url: string, code: string) {
  await page.goto(url);
  await page.getByRole("button", { name: "Delete coupon" }).click();
  const dialog = page.getByRole("dialog");
  const confirm = dialog.getByRole("button", { name: "Delete coupon" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(`Type ${code} to confirm`).fill(code);
  await confirm.click();
  await expect(page).toHaveURL(/\/admin\/coupons\/?$/, { timeout: 15_000 });
  await expect(page.getByText(code, { exact: true })).toHaveCount(0);
}

test("staff create, apply, re-save and delete coupons", async ({ page }) => {
  test.setTimeout(120_000);
  const unique = randomUUID().slice(0, 6).toUpperCase();
  const fixedCode = `E2EFIX${unique}`;
  const cappedCode = `E2ECAP${unique}`;
  await signIn(page);

  // A fixed ₹50 coupon is stored as 5000 paise — the list shows ₹50, not ₹0.50.
  const fixedUrl = await createCoupon(page, async (p) => {
    await p.getByLabel("Code").fill(fixedCode);
    await p.getByLabel("Kind").selectOption("fixed");
    await p.getByLabel("Amount off (₹)").fill("50");
    await p.getByLabel("Starts at, IST (optional)").fill("2026-01-01T10:00");
  });

  // Saving again must not move the start time (it used to shift 5½ hours on every save).
  await page.reload();
  await expect(page.getByLabel("Starts at, IST (optional)")).toHaveValue("2026-01-01T10:00");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toHaveText("Coupon saved.");
  await page.reload();
  await expect(page.getByLabel("Starts at, IST (optional)")).toHaveValue("2026-01-01T10:00");

  // 50% off with an upper limit of ₹100.
  const cappedUrl = await createCoupon(page, async (p) => {
    await p.getByLabel("Code").fill(cappedCode);
    await p.getByLabel("Kind").selectOption("percent");
    await p.getByLabel("Percent off (1–100)").fill("50");
    await p.getByLabel("Upper limit — max discount (₹, optional)").fill("100");
  });

  await page.goto("/admin/coupons");
  await expect(page.getByRole("row", { name: new RegExp(fixedCode) })).toContainText("₹50 off");
  await expect(page.getByRole("row", { name: new RegExp(cappedCode) })).toContainText("50% off, up to ₹100");

  // In the real cart, 50% of a ₹349 pack would be ₹174.50 — the cap holds it to ₹100.
  await page.goto("/product/premium-herbal-blue-tea-teabags");
  await page.getByRole("button", { name: /add to cart/i }).first().click();
  const deals = page.locator('[data-popup="deals"]');
  if (await deals.isVisible().catch(() => false)) await deals.getByRole("button", { name: "Continue shopping" }).click();
  await page.goto("/cart");
  await page.getByRole("button", { name: /Have a coupon or promo code/ }).first().click();
  await page.getByLabel("Coupon code").first().fill(cappedCode);
  await page.getByRole("button", { name: "APPLY" }).first().click();
  await expect(page.getByText(`Discount (${cappedCode})`).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("−₹100").first()).toBeVisible();

  await deleteCoupon(page, fixedUrl, fixedCode);
  await deleteCoupon(page, cappedUrl, cappedCode);
});
