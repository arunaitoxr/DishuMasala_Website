import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { signInAsAdmin } from "./_helpers/admin-session";

/**
 * Products CRUD end to end (client request, 2026-10-14): validation that used to crash the editor
 * (duplicate / swapped / clashing SKUs, price above MRP), image add / alt / replace / reorder /
 * primary / delete, publish, then delete (archive) → restore → delete permanently, checking the
 * storefront at each step.
 */

const signIn = signInAsAdmin;

function image(r: number, g: number, b: number) {
  return sharp({ create: { width: 60, height: 60, channels: 3, background: { r, g, b } } }).png().toBuffer();
}

async function confirmTyped(page: Page, button: string, text: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(`Type ${text} to confirm`).fill(text);
  await dialog.getByRole("button", { name: button }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

test("staff create, edit, publish, delete, restore and permanently delete a product", async ({ page }) => {
  test.setTimeout(180_000);
  const unique = randomUUID().slice(0, 8);
  const name = `E2E CRUD Product ${unique}`;
  const slug = `e2e-crud-product-${unique}`;
  const skuA = `E2E-${unique}-A`;
  const skuB = `E2E-${unique}-B`;
  await signIn(page);

  // ---- Create with two variants -------------------------------------------------------------
  await page.goto("/admin/products/new");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Slug").fill(slug);
  const v1 = page.locator("li:has-text('Variant 1')");
  await v1.getByLabel("SKU").fill(skuA);
  await v1.getByLabel("Option value").fill("100g");
  await v1.getByLabel("MRP (₹)").fill("300");
  await v1.getByLabel("Price (₹)").fill("350"); // above MRP — must be refused, not crash
  await page.getByRole("button", { name: "Add variant" }).click();
  const v2 = page.locator("li:has-text('Variant 2')");
  await v2.getByLabel("SKU").fill(skuA); // duplicate SKU — must be refused
  await v2.getByLabel("Option value").fill("200g");
  await v2.getByLabel("MRP (₹)").fill("500");
  await v2.getByLabel("Price (₹)").fill("450");

  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByText("same SKU", { exact: false }).first()).toBeVisible();
  await v2.getByLabel("SKU").fill("0024-S"); // a real Blue Tea SKU — clash with another product
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByText("can't be higher than its MRP", { exact: false }).first()).toBeVisible();
  await v1.getByLabel("Price (₹)").fill("270");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByText("0024-S is already used by another product", { exact: false }).first()).toBeVisible();
  await v2.getByLabel("SKU").fill(skuB);
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/\d+$/, { timeout: 15_000 });
  const adminUrl = page.url();

  // ---- Swap the two SKUs and save (used to hit the unique index and crash) -------------------
  await page.locator("li:has-text('Variant 1')").getByLabel("SKU").fill(skuB);
  await page.locator("li:has-text('Variant 2')").getByLabel("SKU").fill(skuA);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").first()).toContainText("Product saved.");

  // ---- Images: add two, alt text, replace, reorder, primary, delete ---------------------------
  const fileInput = page.getByLabel("Add images");
  await fileInput.setInputFiles([
    { name: "red.png", mimeType: "image/png", buffer: await image(200, 40, 40) },
    { name: "blue.png", mimeType: "image/png", buffer: await image(40, 40, 200) },
  ]);
  const images = page.locator("section:has(h2:text-is('Images')) li[aria-label^='Image ']");
  await expect(images).toHaveCount(2, { timeout: 45_000 });

  for (let i = 0; i < 2; i++) {
    const alt = images.nth(i).getByPlaceholder("Describe this image for screen readers");
    await alt.fill(`${name} — pack ${i + 1}`);
    await alt.blur();
    await expect(images.nth(i).getByText("Alt text saved")).toBeVisible({ timeout: 15_000 });
  }

  const firstSrc = await images.nth(0).locator("img").getAttribute("src");
  await images.nth(0).getByRole("button", { name: "Replace" }).click();
  await page.getByLabel("Replacement image").setInputFiles({ name: "green.png", mimeType: "image/png", buffer: await image(40, 200, 40) });
  await expect.poll(async () => images.nth(0).locator("img").getAttribute("src"), { timeout: 45_000 }).not.toBe(firstSrc);
  await expect(images.nth(0).getByPlaceholder("Describe this image for screen readers")).toHaveValue(`${name} — pack 1`);

  await images.nth(1).getByRole("button", { name: "Move image 2 earlier" }).click();
  await expect(images.nth(0).getByPlaceholder("Describe this image for screen readers")).toHaveValue(`${name} — pack 2`, { timeout: 15_000 });
  // The first upload became primary and has just moved to position 2; make the new first image primary.
  await expect(images.nth(1).getByText("Primary", { exact: true })).toBeVisible();
  await images.nth(0).getByRole("button", { name: "Set primary" }).click();
  await expect(images.nth(0).getByText("Primary", { exact: true })).toBeVisible({ timeout: 15_000 });

  // ---- Publish and check the storefront ---------------------------------------------------------
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/it's live on the storefront now/i)).toBeVisible({ timeout: 15_000 });
  await page.goto(`/product/${slug}`);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.locator(`img[alt="${name} — pack 2"]`).first()).toBeVisible();

  // Delete one image (typed confirmation); the other stays.
  await page.goto(adminUrl);
  await images.nth(0).getByRole("button", { name: "Delete" }).click();
  await confirmTyped(page, "Delete image", "delete");
  await expect(images).toHaveCount(1, { timeout: 15_000 });

  // ---- Delete (archive) from the list → off the storefront ------------------------------------
  await page.goto("/admin/products?q=" + encodeURIComponent(name));
  await page.getByRole("row", { name: new RegExp(name) }).getByRole("button", { name: "Delete" }).click();
  await confirmTyped(page, "Delete", slug);
  await expect(page.getByRole("row", { name: new RegExp(name) })).toHaveCount(0);
  const gone = await page.request.get(`/product/${slug}`);
  expect(gone.status()).toBe(404);

  // ---- Restore from the product page, then archive and delete permanently ----------------------
  await page.goto("/admin/products?status=archived&q=" + encodeURIComponent(name));
  await page.getByRole("row", { name: new RegExp(name) }).getByRole("link", { name: "Open / restore" }).click();
  await page.getByRole("button", { name: "Restore product" }).click();
  await expect(page.getByText("draft", { exact: true })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Delete product" }).click();
  await confirmTyped(page, "Delete product", slug);
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await confirmTyped(page, "Delete permanently", slug);
  await expect(page).toHaveURL(/\/admin\/products\?status=archived/, { timeout: 15_000 });
  await page.goto("/admin/products?status=archived&q=" + encodeURIComponent(name));
  await expect(page.getByRole("row", { name: new RegExp(name) })).toHaveCount(0);
});
