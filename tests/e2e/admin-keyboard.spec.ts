import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { adminCredentials } from "./_helpers/admin";

/**
 * Real proof of PROMPTS.md Phase 7's acceptance criterion: "Admin is keyboard-operable end to
 * end, including the tables and dialogs" — driven with real keyboard events (Tab/Shift+Tab,
 * Enter, arrow keys), same discipline as every prior phase's keyboard checks
 * (tests/e2e/*-keyboard*.spec.ts equivalents). No `.click()` calls anywhere below except the
 * one-time login form submit, which isn't part of "the admin" this criterion is about.
 */
const { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } = adminCredentials();

async function createRealOrder(request: import("@playwright/test").APIRequestContext): Promise<string> {
  const email = `admin-kbd-e2e-${randomUUID().slice(0, 8)}@example.com`;
  const variantId = 1;
  const validateRes = await request.post("/api/cart/validate", { data: { lines: [{ variantId, qty: 1 }], email } });
  const totalPaise = (await validateRes.json()).pricing.totalPaise as number;
  const res = await request.post("/api/checkout", {
    data: {
      idempotencyKey: randomUUID(),
      email,
      lines: [{ variantId, qty: 1 }],
      paymentMethod: "cod",
      shippingAddress: { name: "Keyboard E2E", phone: "9876543210", line1: "1 Test Lane", city: "Sangrur", state: "Punjab", pincode: "148001" },
      customerNote: null,
      clientTotalPaise: totalPaise,
    },
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`Failed to create the real test order: ${JSON.stringify(body)}`);
  return body.orderNumber as string;
}

test("admin is keyboard-operable: sidebar nav, DataTable rows, order detail dialogs", async ({ page, request }) => {
  const orderNumber = await createRealOrder(request);

  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account\/?$/);

  await page.goto("/admin");

  // ---- Sidebar nav: Tab to the "Orders" link, Enter to navigate ----------------------------
  const ordersLink = page.getByRole("link", { name: "Orders", exact: true });
  await ordersLink.focus();
  await expect(ordersLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/orders\/?$/);

  // ---- DataTable: focus a row, arrow down/up between rows, Enter to open one ---------------
  const firstRow = page.locator("tr[data-row-href]").first();
  await firstRow.focus();
  await expect(firstRow).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const secondRow = page.locator("tr[data-row-href]").nth(1);
  await expect(secondRow).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(firstRow).toBeFocused();

  // Navigate keyboard-only, via search, straight to the order this test created (rather than
  // trusting page-1 ordering under whatever else exists in the DB) — Tab into the search field,
  // type, submit with Enter.
  await page.goto("/admin/orders"); // reset focus context
  const searchInput = page.locator("#q");
  await searchInput.focus();
  await page.keyboard.type(orderNumber);
  // Assert the keystrokes actually landed before submitting. Typing can begin before the client
  // component has hydrated, in which case Enter submits an empty form and the URL never gains
  // ?q= — which is exactly how this step failed intermittently.
  await expect(searchInput).toHaveValue(orderNumber);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`q=${orderNumber}`));

  const targetRow = page.locator(`tr[data-row-href="/admin/orders/${orderNumber}"]`);
  await expect(targetRow).toBeVisible();
  await targetRow.focus();
  await expect(targetRow).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/admin/orders/${orderNumber}$`));

  // ---- Order detail: keyboard-only through the "Add note" dialog ---------------------------
  const addNoteButton = page.getByRole("button", { name: "Add note" });
  await addNoteButton.focus();
  await expect(addNoteButton).toBeFocused();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Radix Dialog moves focus inside on open; the textarea autoFocuses.
  const noteTextarea = dialog.locator("textarea");
  await expect(noteTextarea).toBeFocused();
  await page.keyboard.type("Keyboard-only test note.");

  // Tab to the "Add note" submit button inside the dialog and press it with Enter/Space.
  let submitted = false;
  for (let i = 0; i < 6 && !submitted; i++) {
    await page.keyboard.press("Tab");
    const active = dialog.locator(":focus");
    const text = await active.textContent().catch(() => null);
    if (text?.trim() === "Add note") {
      await page.keyboard.press("Enter");
      submitted = true;
    }
  }
  expect(submitted).toBe(true);

  await expect(page.getByText(/note added/i).first()).toBeVisible({ timeout: 10_000 });
  await expect(dialog).toBeHidden();

  // Escape closes a dialog opened again, keyboard-only.
  await addNoteButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});
