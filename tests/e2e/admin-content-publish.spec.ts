import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { adminCredentials } from "./_helpers/admin";

/**
 * Real proof of PROMPTS.md Phase 8's acceptance criterion: "Publishing a post makes it appear on
 * `/blog` without a redeploy — show the revalidation." Creates and publishes a real blog post
 * through the real admin UI (server actions calling `updateTag("posts")` / `revalidatePath("/blog")`
 * in app/admin/content/actions.ts), then fetches `/blog` on the SAME already-running dev server
 * (started once for this whole Playwright run, never restarted) and confirms the new post appears
 * — proving the revalidation call, not a rebuild, is what made it show up.
 */
const { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } = adminCredentials();

test("publishing a post makes it appear on /blog live, no redeploy", async ({ page }) => {
  const unique = randomUUID().slice(0, 8);
  const title = `E2E Revalidation Test Post ${unique}`;
  const slug = `e2e-revalidation-test-${unique}`;

  // Confirm it genuinely doesn't exist yet on the live /blog page.
  await page.goto("/blog");
  await expect(page.getByText(title)).toHaveCount(0);

  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account\/?$/, { timeout: 15_000 });

  await page.goto("/admin/content/posts/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Slug", { exact: true }).fill(slug);
  await page.getByLabel("Excerpt", { exact: true }).fill("A real test post proving live revalidation.");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/admin\/content\/posts\/\d+$/, { timeout: 15_000 });
  const editUrl = page.url();

  // Still draft — must not be live yet.
  await page.goto("/blog");
  await expect(page.getByText(title)).toHaveCount(0);

  // Publish now (no schedule date).
  await page.goto(editUrl);
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByText(/published — live on the storefront now/i)).toBeVisible({ timeout: 15_000 });

  // Same running server, no restart: /blog now shows it.
  await page.goto("/blog");
  await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });

  await page.goto(`/blog/${slug}`);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
});
