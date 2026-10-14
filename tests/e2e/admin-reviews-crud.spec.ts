import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { signInAsAdmin } from "./_helpers/admin-session";

/**
 * Reviews CRUD end to end (client request, 2026-10-13): staff add a real review, edit it, hide and
 * publish it again (checking the product page each time), import a CSV with a preview, bulk-publish
 * the imported rows, and delete everything behind the typed confirmation.
 */
const PRODUCT_SLUG = "coriander-powder";

const signIn = signInAsAdmin;

async function onProductPage(page: Page, text: string): Promise<boolean> {
  const res = await page.request.get(`/product/${PRODUCT_SLUG}`);
  return (await res.text()).includes(text);
}

async function deleteFromList(page: Page, rowText: string) {
  const row = page.getByRole("row", { name: new RegExp(rowText) });
  await row.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Type delete to confirm").fill("delete");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(row).toHaveCount(0, { timeout: 15_000 });
}

test("staff add, edit, hide, publish, import and delete reviews", async ({ page }) => {
  test.setTimeout(180_000);
  const unique = randomUUID().slice(0, 8);
  const author = `E2E Reviewer ${unique}`;
  const body = `Lovely fresh aroma ${unique}`;
  await signIn(page);

  // ---- Add (published straight away) ---------------------------------------------------------
  await page.goto("/admin/reviews/new");
  await page.getByLabel("Product", { exact: true }).selectOption({ label: "Coriander Powder" });
  await page.getByLabel("Reviewer name").fill(author);
  await page.getByLabel("Rating").selectOption("4");
  await page.getByLabel("Review text").fill(body);
  await page.getByRole("button", { name: "Add review" }).click();
  await expect(page).toHaveURL(/\/admin\/reviews\/\d+$/, { timeout: 15_000 });
  const reviewUrl = page.url();
  await expect.poll(() => onProductPage(page, body), { timeout: 15_000 }).toBe(true);

  // ---- Edit -------------------------------------------------------------------------------------
  const edited = `${body} — edited`;
  await page.getByLabel("Review text").fill(edited);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Review saved.")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => onProductPage(page, edited), { timeout: 15_000 }).toBe(true);

  // ---- Hide from the list, publish again from the review page ----------------------------------
  await page.goto(`/admin/reviews?q=${unique}`);
  const row = page.getByRole("row", { name: new RegExp(author) });
  await row.getByRole("button", { name: "Hide" }).click();
  await expect(row.getByText("hidden")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => onProductPage(page, edited), { timeout: 15_000 }).toBe(false);

  await page.goto(reviewUrl);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Review published")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => onProductPage(page, edited), { timeout: 15_000 }).toBe(true);

  // ---- CSV import: preview, then import as pending, then bulk publish ---------------------------
  const csv = [
    "product,reviewer_name,rating,review,date",
    `Coriander Powder,CSV One ${unique},5,Great colour ${unique},2026-09-01`,
    `coriander-powder,CSV Two ${unique},4,Nice and fresh ${unique},`,
    `No Such Product,CSV Three ${unique},5,Skipped,`,
    `Coriander Powder,CSV Four ${unique},9,Bad rating,`,
  ].join("\n");
  await page.goto("/admin/reviews/import");
  await page.getByLabel("CSV file").setInputFiles({ name: "reviews.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText("2 reviews ready to import")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("will be skipped")).toBeVisible();
  await page.getByRole("button", { name: "Import 2 reviews" }).click();
  await expect(page.getByText("Imported 2 reviews as pending.")).toBeVisible({ timeout: 15_000 });
  expect(await onProductPage(page, `Great colour ${unique}`)).toBe(false);

  await page.goto(`/admin/reviews?status=pending&q=${unique}`);
  await expect(page.getByRole("row", { name: new RegExp(`CSV One ${unique}`) })).toBeVisible();
  await page.getByRole("row", { name: new RegExp(`CSV One ${unique}`) }).getByRole("button", { name: "Publish" }).click();
  await expect.poll(() => onProductPage(page, `Great colour ${unique}`), { timeout: 15_000 }).toBe(true);

  // ---- Delete everything this test made ------------------------------------------------------------
  await page.goto(`/admin/reviews?q=${unique}`);
  await deleteFromList(page, author);
  await deleteFromList(page, `CSV One ${unique}`);
  await deleteFromList(page, `CSV Two ${unique}`);
  await expect.poll(() => onProductPage(page, edited), { timeout: 15_000 }).toBe(false);
});

test("a customer's own review is read-only in the admin", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/reviews?source=customer");
  await page.getByRole("row").filter({ hasText: "Customer" }).first().getByRole("link", { name: "Open" }).click();
  await expect(page.getByText("can be published, hidden or deleted, but not edited")).toBeVisible();
  await expect(page.getByLabel("Review text")).toHaveCount(0);
});
