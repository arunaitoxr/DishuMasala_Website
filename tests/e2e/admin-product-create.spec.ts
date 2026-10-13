import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { adminCredentials } from "./_helpers/admin";

/**
 * Real proof of PROMPTS.md Phase 8's flagship acceptance criterion: "Create a product with two
 * variants and three images from the admin UI alone, publish it, and show it live on the
 * storefront with correct prices, alt text and priority placement." Drives the actual admin UI
 * end-to-end (Playwright, real browser) using the real staff account (same as
 * tests/e2e/admin-dispatch-walk.spec.ts), uploads three real images through the real presigned-upload
 * (local MinIO substitute) path, fills real alt text, publishes, then loads the real storefront
 * product page and confirms what's there.
 */
const { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } = adminCredentials();

async function makeTestImage(hue: number): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 40, channels: 3, background: { r: hue, g: 80, b: 160 } } })
    .png()
    .toBuffer();
}

test("staff creates a two-variant, three-image product from the admin UI alone and it goes live", async ({ page }) => {
  test.setTimeout(90_000);
  const unique = randomUUID().slice(0, 8);
  const productName = `E2E Test Product ${unique}`;
  const slug = `e2e-test-product-${unique}`;

  // ---- Sign in as the real staff/admin account ------------------------------------------------
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account\/?$/, { timeout: 15_000 });

  // ---- Create the product with two variants ---------------------------------------------------
  await page.goto("/admin/products/new");
  await page.getByLabel("Name").fill(productName);
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("Priority").fill("1"); // Blue-tea-tier priority — real placement check below.

  // Variant 1 (already present by default)
  const variantCards = page.locator("li:has-text('Variant 1')");
  await variantCards.getByLabel("SKU").fill(`E2E-${unique}-A`);
  await variantCards.getByLabel("Option value").fill("100g");
  await variantCards.getByLabel("MRP (₹)").fill("600");
  await variantCards.getByLabel("Price (₹)").fill("549");
  await variantCards.getByLabel("Weight (grams)").fill("100");

  // Live paise preview — proves the admin shows the exact stored value before saving.
  await expect(variantCards.getByText("54,900 paise")).toBeVisible();

  await page.getByRole("button", { name: "Add variant" }).click();
  const variant2 = page.locator("li:has-text('Variant 2')");
  await variant2.getByLabel("SKU").fill(`E2E-${unique}-B`);
  await variant2.getByLabel("Option value").fill("200g");
  await variant2.getByLabel("MRP (₹)").fill("1100");
  await variant2.getByLabel("Price (₹)").fill("999");
  await variant2.getByLabel("Weight (grams)").fill("200");

  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/\d+$/, { timeout: 15_000 });

  // ---- Upload three real images through the real presigned-upload path --------------------
  const [imgA, imgB, imgC] = await Promise.all([makeTestImage(30), makeTestImage(90), makeTestImage(150)]);
  const fileInput = page.locator('input[type="file"][accept*="image"]').first();
  await fileInput.setInputFiles([
    { name: "a.png", mimeType: "image/png", buffer: imgA },
    { name: "b.png", mimeType: "image/png", buffer: imgB },
    { name: "c.png", mimeType: "image/png", buffer: imgC },
  ]);

  // Wait for all three uploads to finish processing (each becomes an <img> once done).
  await expect(page.locator("section:has-text('Images') img")).toHaveCount(3, { timeout: 30_000 });

  // ---- Fill real alt text on every image ---------------------------------------------------
  const altInputs = page.getByPlaceholder("Describe this image for screen readers");
  const altCount = await altInputs.count();
  expect(altCount).toBe(3);
  for (let i = 0; i < altCount; i++) {
    await altInputs.nth(i).fill(`${productName} — packshot ${i + 1}`);
    await altInputs.nth(i).blur();
  }
  await page.waitForTimeout(500); // let the alt-text save (onBlur server action) land

  // ---- Publish ---------------------------------------------------------------------------------
  const adminProductUrl = page.url();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/published — it's live on the storefront now/i)).toBeVisible({ timeout: 15_000 });

  // ---- Verify live on the real storefront -------------------------------------------------------
  await page.goto(`/product/${slug}`);
  await expect(page.getByRole("heading", { name: productName })).toBeVisible();
  const buyBox = page.locator("#pdp-buy-box");
  await expect(buyBox.getByText("₹549")).toBeVisible();
  await expect(buyBox.getByText("₹600")).toBeVisible(); // struck-through MRP
  const galleryImg = page.locator(`img[alt="${productName} — packshot 1"]`).first();
  await expect(galleryImg).toBeVisible();

  // Priority placement: priority 1 (the same tier as Blue Tea) should sort this product near the
  // very front of /shop's default priority-ascending sort, well ahead of the lower-priority
  // majority of the 20+ seeded products.
  await page.goto("/shop");
  const productHrefs = await page.locator('a[href^="/product/"]').evaluateAll((els) => els.map((el) => el.getAttribute("href")));
  const uniqueHrefs = [...new Set(productHrefs)];
  const index = uniqueHrefs.findIndex((href) => href?.includes(slug));
  expect(index).toBeGreaterThanOrEqual(0);
  expect(index).toBeLessThan(Math.ceil(uniqueHrefs.length / 2));

  // ---- Clean up after ourselves ----------------------------------------------------------------
  // Everything this spec set out to prove is proven by now. Leaving the product published would
  // make it a permanent 21st entry in the catalogue, which breaks shop-filter.spec.ts's "exactly
  // 20 products" assertions on the next run — the test suite would then only pass on a freshly
  // seeded database. Unpublishing through the real admin control keeps the catalogue as the seed
  // left it, and exercises the unpublish path into the bargain.
  await page.goto(adminProductUrl);
  await page.getByRole("button", { name: "Unpublish" }).click();
  await expect(page.getByText(/moved back to draft/i).first()).toBeVisible({ timeout: 15_000 });

  await page.goto("/shop");
  await expect(page.locator(`a[href="/product/${slug}"]`)).toHaveCount(0);
});
