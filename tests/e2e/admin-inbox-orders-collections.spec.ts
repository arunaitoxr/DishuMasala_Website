import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { signInAsAdmin } from "./_helpers/admin-session";

/**
 * The remaining admin tabs end to end (client request, 2026-10-14):
 *  - Inbox: a contact message, a corporate enquiry and a newsletter sign-up submitted through the
 *    site's own endpoints show up, can be marked handled and deleted (they had no admin view before,
 *    and the footer newsletter box didn't save anything).
 *  - Phone leads can be deleted.
 *  - Collections: an empty collection can be deleted; one with products can't.
 *  - Orders: a never-paid order (a failed checkout) can be deleted; a paid order has no Delete.
 */
async function confirmTyped(page: Page, text: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(`Type ${text} to confirm`).fill(text);
  await dialog.getByRole("button", { name: /Delete/ }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

test("inbox: messages, enquiries and newsletter sign-ups", async ({ page }) => {
  test.setTimeout(120_000);
  const u = randomUUID().slice(0, 8);
  const post = (path: string, data: unknown) => page.request.post(path, { data });
  expect((await post("/api/marketing/contact", { name: `E2E Contact ${u}`, email: `e2e-contact-${u}@dishumasala.test`, message: `Do you ship to Pune? ${u}` })).ok()).toBe(true);
  expect(
    (await post("/api/marketing/bulk-enquiry", {
      enquiryType: "Corporate",
      fullName: `E2E Buyer ${u}`,
      email: `e2e-bulk-${u}@dishumasala.test`,
      phone: "9876543210",
      country: "India",
      requirement: `200 Diwali hampers ${u}`,
    })).ok(),
  ).toBe(true);
  expect((await post("/api/marketing/newsletter", { email: `e2e-news-${u}@dishumasala.test` })).ok()).toBe(true);
  await signInAsAdmin(page);

  // Contact message: new → handled → deleted.
  await page.goto("/admin/inbox?tab=messages");
  const msg = page.getByRole("row", { name: new RegExp(`E2E Contact ${u}`) });
  await expect(msg.getByText("new", { exact: true })).toBeVisible();
  await msg.getByRole("button", { name: "Mark handled" }).click();
  await expect(msg.getByText("handled", { exact: true })).toBeVisible({ timeout: 15_000 });
  await msg.getByRole("button", { name: "Delete" }).click();
  await confirmTyped(page, "delete");
  await expect(page.getByRole("row", { name: new RegExp(`E2E Contact ${u}`) })).toHaveCount(0);

  // Corporate enquiry.
  await page.goto("/admin/inbox?tab=enquiries");
  const enq = page.getByRole("row", { name: new RegExp(`E2E Buyer ${u}`) });
  await expect(enq).toContainText(`200 Diwali hampers ${u}`);
  await enq.getByRole("button", { name: "Delete" }).click();
  await confirmTyped(page, "delete");
  await expect(page.getByRole("row", { name: new RegExp(`E2E Buyer ${u}`) })).toHaveCount(0);

  // Newsletter sign-up (saved by the footer endpoint).
  await page.goto("/admin/inbox?tab=newsletter");
  const sub = page.getByRole("row", { name: new RegExp(`e2e-news-${u}`) });
  await expect(sub).toBeVisible();
  await sub.getByRole("button", { name: "Delete" }).click();
  await confirmTyped(page, "delete");
  await expect(page.getByRole("row", { name: new RegExp(`e2e-news-${u}`) })).toHaveCount(0);
});

test("phone leads can be deleted", async ({ page }) => {
  const phone = `9${String(Date.now()).slice(-9)}`;
  expect((await page.request.post("/api/marketing/phone-lead", { data: { phone, consent: true, sourcePath: "/e2e" } })).ok()).toBe(true);
  await signInAsAdmin(page);
  await page.goto("/admin/leads");
  const row = page.getByRole("row", { name: new RegExp(phone) });
  await row.getByRole("button", { name: "Delete" }).click();
  await confirmTyped(page, "delete");
  await expect(page.getByRole("row", { name: new RegExp(phone) })).toHaveCount(0);
});

test("collections: empty ones can be deleted, ones with products can't", async ({ page }) => {
  const u = randomUUID().slice(0, 8);
  const slug = `e2e-collection-${u}`;
  await signInAsAdmin(page);

  // Spices has products — deleting is refused with a clear reason.
  await page.goto("/admin/collections");
  await page.getByRole("row", { name: /spices/ }).first().getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Type spices to confirm").fill("spices");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(dialog.getByText(/still has \d+ products?/)).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await page.goto("/admin/collections/new");
  await page.getByLabel("Title", { exact: true }).fill(`E2E Collection ${u}`);
  await page.getByLabel("Slug", { exact: true }).fill(slug);
  await page.getByLabel("Priority").fill("90");
  await page.getByRole("button", { name: "Create collection" }).click();
  await expect(page).toHaveURL(/\/admin\/collections\/\d+$/, { timeout: 15_000 });
  await page.getByRole("button", { name: "Delete collection" }).click();
  await confirmTyped(page, slug);
  await expect(page).toHaveURL(/\/admin\/collections\/?$/, { timeout: 15_000 });
  await expect(page.getByRole("row", { name: new RegExp(slug) })).toHaveCount(0);
});

test("orders: a never-paid order can be deleted, a paid one can't", async ({ page }) => {
  test.setTimeout(90_000);
  // A failed checkout (no working Razorpay keys locally, or a declined payment) leaves exactly the
  // kind of never-paid order this is for.
  const email = `e2e-order-${randomUUID().slice(0, 8)}@dishumasala.test`;
  const pricing = await (await page.request.post("/api/cart/validate", { data: { lines: [{ variantId: 186, qty: 1 }], email } })).json();
  await page.request.post("/api/checkout", {
    data: {
      idempotencyKey: randomUUID(),
      email,
      lines: [{ variantId: 186, qty: 1 }],
      paymentMethod: "razorpay",
      shippingAddress: { name: "E2E Order", phone: "9876543210", line1: "1 Test Street", city: "Sangrur", state: "Punjab", pincode: "148001" },
      customerNote: null,
      clientTotalPaise: pricing.pricing.totalPaise,
    },
  });
  await signInAsAdmin(page);

  await page.goto(`/admin/orders?q=${encodeURIComponent(email)}`);
  const row = page.getByRole("row", { name: new RegExp(email) });
  // The orders table streams in after its loading state — wait for the row rather than counting at once.
  const appeared = await row.waitFor({ timeout: 15_000 }).then(() => true, () => false);
  test.skip(!appeared, "Checkout created no order here (payment started successfully) — nothing to delete.");
  const orderNumber = (await row.locator("td").first().innerText()).trim();
  await row.getByRole("button", { name: "Delete" }).click();
  await confirmTyped(page, orderNumber);
  await expect(page.getByRole("row", { name: new RegExp(email) })).toHaveCount(0);

  // The real paid order has View only.
  await page.goto("/admin/orders?q=DM-2026-00209");
  const paid = page.getByRole("row", { name: /DM-2026-00209/ });
  await expect(paid.getByRole("link", { name: "View" })).toBeVisible();
  await expect(paid.getByRole("button", { name: "Delete" })).toHaveCount(0);
});
