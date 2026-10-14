import { test, expect } from "@playwright/test";
import { adminCredentials } from "./_helpers/admin";
import { createPaidOrder } from "./_helpers/orders";

/**
 * Real proof of PROMPTS.md Phase 7's acceptance criterion: "A staff user can take an order from
 * paid to dispatched to delivered, with an AWB, in under a minute of clicking — walk the path and
 * report it." Uses the real admin@dishumasala.com account created by
 * `pnpm create-staff-user` for this phase's verification (see the phase report for the exact
 * command). No real SHIPROCKET_EMAIL/SHIPROCKET_PASSWORD exist in this dev environment, so the
 * "dispatch" step is asserted to show the honest "couldn't reach Shiprocket" degraded state
 * rather than a fabricated AWB — exactly what CLAUDE.md's honest-degrade rule requires, and what
 * this test explicitly checks for instead of a fake-looking tracking number.
 */
const { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } = adminCredentials();

/** A real, paid order (COD was removed — every order is prepaid). */
async function createRealCodOrder(request: import("@playwright/test").APIRequestContext): Promise<string> {
  return createPaidOrder(request);
}

test("staff walks a real order from confirmed to dispatched to delivered", async ({ page, request }) => {
  // ---- Create a real, paid (COD-confirmed) order to walk -----------------------------------
  const orderNumber = await createRealCodOrder(request);

  // ---- Sign in as the real staff/admin account ----------------------------------------------
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  // The login form always redirects to /account regardless of role (built for customers in Phase
  // 6) — staff/admin then navigates into /admin themselves, same as any real staff member would.
  await expect(page).toHaveURL(/\/account\/?$/, { timeout: 15_000 });
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/?$/);

  // ---- Walk the order, timed from here ------------------------------------------------------
  const start = Date.now();

  await page.goto(`/admin/orders/${orderNumber}`);
  await expect(page.getByRole("heading", { name: orderNumber })).toBeVisible();

  // confirmed -> packed
  await page.getByRole("button", { name: "Mark packed" }).click();
  await expect(page.getByText(/order moved to "packed"/i).first()).toBeVisible({ timeout: 10_000 });

  // Attempt Shiprocket dispatch — no credentials configured in this dev environment, so this
  // MUST show the honest degraded state, never a fabricated AWB.
  await page.getByRole("button", { name: "Dispatch to Shiprocket" }).click();
  await expect(page.getByText(/couldn.?t reach shiprocket|shiprocket isn.?t configured/i).first()).toBeVisible({ timeout: 10_000 });

  // packed -> shipped (independent of Shiprocket's own state — the state machine doesn't require it)
  await page.getByRole("button", { name: "Mark shipped" }).click();
  await expect(page.getByText(/order moved to "shipped"/i).first()).toBeVisible({ timeout: 10_000 });

  // shipped -> delivered
  await page.getByRole("button", { name: "Mark delivered" }).click();
  await expect(page.getByText(/order moved to "delivered"/i).first()).toBeVisible({ timeout: 10_000 });

  const elapsedMs = Date.now() - start;
  console.log(`[Phase 7 acceptance proof] confirmed -> packed -> dispatch attempt -> shipped -> delivered took ${elapsedMs}ms of clicking.`);
  expect(elapsedMs).toBeLessThan(60_000);

  // Final state check on the page itself.
  await page.reload();
  await expect(page.getByText("delivered", { exact: true }).first()).toBeVisible();
  // Honest: no AWB exists in this environment — the page must say so, not show a fake one.
  // Scoped to the <p> that actually carries the text: getByText with a regex matches by
  // substring, so every ancestor containing that sentence (the <section>, #admin-main, ...) also
  // matches and trips strict mode. Whether it trips depends on what else is rendered alongside,
  // which is why this was intermittent rather than always broken.
  await expect(
    page.locator("p").filter({ hasText: /not yet pushed to shiprocket|awb not yet assigned/i }).first(),
  ).toBeVisible();
});
