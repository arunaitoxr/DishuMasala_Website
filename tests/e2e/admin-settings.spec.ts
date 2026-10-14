import { test, expect, type Page } from "@playwright/test";
import { signInAsAdmin } from "./_helpers/admin-session";

/**
 * Settings end to end (client request, 2026-10-14): every setting saves and actually changes the site —
 * the announcement bar (with {free_shipping}), the free-gift offer on/off, maintenance mode (shoppers
 * see the "back shortly" page, staff and /login don't), and a bad store email is refused. Everything
 * is put back as it was at the end.
 */
/** Saves and waits for THIS save's server response — a "Settings saved." toast from the previous save
 * may still be on screen, so waiting for the text alone would race ahead of the write. */
async function save(page: Page) {
  const response = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/admin/settings");
  await page.getByRole("button", { name: "Save settings" }).click();
  await response;
  await expect(page.getByText("Settings saved.").last()).toBeVisible({ timeout: 15_000 });
}

test("settings change the live site", async ({ page, browser }) => {
  test.setTimeout(150_000);
  await signInAsAdmin(page);
  await page.goto("/admin/settings");
  const announcement = page.getByLabel("Announcement-bar text");
  const gift = page.getByLabel("Free gift on orders of (₹)");
  const original = { announcement: await announcement.inputValue(), gift: await gift.inputValue() };
  const shopper = await browser.newContext({ storageState: "tests/e2e/_storage/no-popup.json" });
  const shopperPage = await shopper.newPage();

  try {
    // ---- Announcement bar with the live threshold token -------------------------------------------
    await announcement.fill("Diwali offer — free shipping over {free_shipping}");
    await save(page);
    await shopperPage.goto("/");
    await expect(shopperPage.getByText("Diwali offer — free shipping over ₹499")).toBeVisible();
    await announcement.fill("");
    await save(page);
    await shopperPage.reload();
    await expect(shopperPage.getByText("Free shipping over ₹499").first()).toBeVisible();
    // ---- Free-gift offer off, then back on -----------------------------------------------------------
    await gift.fill("");
    await save(page);
    await shopperPage.goto("/collections/spices");
    await expect(shopperPage.getByText(/Free gift on orders above/)).toHaveCount(0);
    await gift.fill(original.gift || "699");
    await save(page);
    await shopperPage.reload();
    await expect(shopperPage.getByText(/Free gift on orders above ₹699/).first()).toBeVisible();
    // ---- A bad store email is refused ----------------------------------------------------------------
    const email = page.getByLabel(/^Email/); // the label also carries its hint text
    const goodEmail = await email.inputValue();
    // The field is type="email", so the browser itself refuses to submit a bad address (the server
    // validates it again — "Enter a valid store email address").
    await email.fill("not-an-email");
    expect(await email.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
    await email.fill(goodEmail);
    expect(await email.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(true);
    // ---- Maintenance mode ------------------------------------------------------------------------------
    await page.getByRole("checkbox", { name: /Maintenance mode/ }).click();
    await save(page);
    await shopperPage.goto("/shop");
    await expect(shopperPage.getByRole("heading", { name: "We'll be back shortly" })).toBeVisible();
    await shopperPage.goto("/login");
    await expect(shopperPage.getByRole("button", { name: "Sign in" })).toBeVisible(); // staff can still sign in
    await page.goto("/shop");
    await expect(page.getByText("Maintenance mode is ON")).toBeVisible(); // staff see the real site + a reminder
    await expect(page.getByRole("heading", { name: "We'll be back shortly" })).toHaveCount(0);
  } finally {
    await page.goto("/admin/settings");
    await page.getByLabel("Announcement-bar text").fill(original.announcement);
    await page.getByLabel("Free gift on orders of (₹)").fill(original.gift);
    const maintenance = page.getByRole("checkbox", { name: /Maintenance mode/ });
    if ((await maintenance.getAttribute("aria-checked")) === "true") await maintenance.click();
    await save(page);
    await shopper.close();
  }
  await page.goto("/");
  await expect(page.getByText("Maintenance mode is ON")).toHaveCount(0);
});
