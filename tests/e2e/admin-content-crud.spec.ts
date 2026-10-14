import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { signInAsAdmin } from "./_helpers/admin-session";

/**
 * Content CRUD end to end (client request, 2026-10-14): a post with an inline image and editor input
 * that used to make saving fail ("---", an image whose title Tiptap sends as null), a cover with alt
 * text, publish → storefront, schedule label, delete; a custom page reachable at /<slug>, a reserved
 * slug refused, delete; the legal pages can't be deleted.
 */
function image() {
  return sharp({ create: { width: 80, height: 50, channels: 3, background: { r: 30, g: 60, b: 160 } } }).png().toBuffer();
}

async function confirmDelete(page: Page, text: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(`Type ${text} to confirm`).fill(text);
  await dialog.getByRole("button", { name: /Delete/ }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

test("staff write, publish and delete a blog post with images", async ({ page }) => {
  test.setTimeout(150_000);
  const unique = randomUUID().slice(0, 8);
  const title = `E2E Post ${unique}`;
  const slug = `e2e-post-${unique}`;
  await signInAsAdmin(page);

  await page.goto("/admin/content/posts/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Slug").fill(slug);
  const editor = page.locator(".ProseMirror");
  await editor.click();
  // "---" used to turn into a horizontal rule the save then rejected.
  await page.keyboard.type(`Brewing notes ${unique}`);
  await page.keyboard.press("Enter");
  await page.keyboard.type("---");
  await page.keyboard.press("Enter");
  // A heading carries attrs ({ level }) — those used to break the save too.
  await page.getByRole("button", { name: "H2", exact: true }).click();
  await page.keyboard.type(`How to brew ${unique}`);
  await page.keyboard.press("Enter");

  // Inline image: the editor opens a file picker, then asks for alt text.
  page.once("dialog", (d) => void d.accept(`Inline picture ${unique}`));
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Image", exact: true }).click();
  await (await chooser).setFiles({ name: "inline.png", mimeType: "image/png", buffer: await image() });
  await expect(editor.locator("img")).toHaveCount(1, { timeout: 30_000 });

  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/admin\/content\/posts\/\d+$/, { timeout: 15_000 });

  // Cover image with alt text.
  await page.getByLabel("Cover image file").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: await image() });
  await page.getByLabel("Cover image alt text").fill(`Cover of ${title}`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Post saved.")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByText(/live on the storefront now/)).toBeVisible({ timeout: 15_000 });
  await page.goto(`/blog/${slug}`);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: `How to brew ${unique}` })).toBeVisible();
  await expect(page.locator(`img[alt="Cover of ${title}"]`)).toBeVisible();
  await expect(page.locator(`img[alt="Inline picture ${unique}"]`)).toBeVisible();

  // Delete from the Content list.
  await page.goto("/admin/content");
  await page.getByRole("row", { name: new RegExp(title) }).getByRole("button", { name: "Delete" }).click();
  await confirmDelete(page, slug);
  expect((await page.request.get(`/blog/${slug}`)).status()).toBe(404);
});

test("staff create, publish and delete a custom page reachable at its own address", async ({ page }) => {
  test.setTimeout(120_000);
  const unique = randomUUID().slice(0, 8);
  const slug = `e2e-page-${unique}`;
  await signInAsAdmin(page);

  await page.goto("/admin/content/pages/new");
  await page.getByLabel("Title").fill(`E2E Page ${unique}`);
  await page.getByLabel("Slug").fill("shop");
  await page.locator(".ProseMirror").click();
  await page.keyboard.type(`Page body ${unique}`);
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByText("/shop is already a page of the site")).toBeVisible({ timeout: 15_000 });

  await page.getByLabel("Slug").fill(slug);
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/admin\/content\/pages\/\d+$/, { timeout: 15_000 });
  expect((await page.request.get(`/${slug}`)).status()).toBe(404); // still a draft
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/live on the storefront now/)).toBeVisible({ timeout: 15_000 });
  await page.goto(`/${slug}`);
  await expect(page.getByRole("heading", { name: `E2E Page ${unique}` })).toBeVisible();
  await expect(page.getByText(`Page body ${unique}`)).toBeVisible();

  // The legal pages have Edit only — no Delete.
  await page.goto("/admin/content");
  const privacy = page.getByRole("row", { name: /\/privacy/ });
  await expect(privacy.getByRole("link", { name: "Edit" })).toBeVisible();
  await expect(privacy.getByRole("button", { name: "Delete" })).toHaveCount(0);

  await page.getByRole("row", { name: new RegExp(slug) }).getByRole("button", { name: "Delete" }).click();
  await confirmDelete(page, slug);
  expect((await page.request.get(`/${slug}`)).status()).toBe(404);
});
