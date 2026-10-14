import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { signInAsAdmin } from "./_helpers/admin-session";

/**
 * Customers CRUD end to end (client request, 2026-10-14): add a customer, edit name / email / mobile,
 * add, edit, make default and delete addresses, then delete the customer behind the typed
 * confirmation of their email.
 */
test("staff add, edit and delete a customer and their addresses", async ({ page }) => {
  test.setTimeout(120_000);
  const unique = randomUUID().slice(0, 8);
  const email = `e2e-cust-${unique}@dishumasala.test`;
  const newEmail = `e2e-cust-${unique}-new@dishumasala.test`;
  await signInAsAdmin(page);

  // ---- Add ---------------------------------------------------------------------------------------
  await page.goto("/admin/customers/new");
  await page.getByLabel("Name").fill(`E2E Customer ${unique}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mobile number (optional)").fill("+91 98765 43210");
  await page.getByRole("button", { name: "Add customer" }).click();
  await expect(page).toHaveURL(/\/admin\/customers\/\d+$/, { timeout: 15_000 });
  await expect(page.getByLabel("Mobile number (optional)")).toHaveValue("9876543210"); // normalised

  // ---- Edit name and sign-in email -------------------------------------------------------------
  await page.getByLabel("Name").fill(`E2E Customer ${unique} Renamed`);
  await page.getByLabel("Email").fill(newEmail);
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("they now sign in with the new email")).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Mobile number (optional)").fill("12345");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Enter a valid 10-digit Indian mobile number")).toBeVisible();
  await page.reload();

  // ---- Addresses -----------------------------------------------------------------------------------
  async function fillAddress(label: string, city: string) {
    await page.getByLabel("Label (optional, e.g. Home)").fill(label);
    await page.getByLabel("Recipient name").fill(`E2E ${unique}`);
    await page.getByLabel("Mobile number", { exact: true }).fill("9876543210");
    await page.getByLabel("Pincode").fill("148001");
    await page.getByLabel("Address line 1").fill("12 Test Street");
    await page.getByLabel("City").fill(city);
    await page.getByLabel("State").selectOption("Punjab");
  }
  await page.getByRole("button", { name: "Add address" }).click();
  await fillAddress("Home", "Sangrur");
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(page.getByText("Home —")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Add address" }).click();
  await fillAddress("Office", "Patiala");
  await page.getByRole("button", { name: "Save address" }).click();
  const office = page.locator("li").filter({ hasText: "Office —" });
  await expect(office).toBeVisible({ timeout: 15_000 });

  await office.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("City").fill("Ludhiana");
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(office).toContainText("Ludhiana", { timeout: 15_000 });

  await office.getByRole("button", { name: "Make default" }).click();
  await expect(office.getByText("Default")).toBeVisible({ timeout: 15_000 });

  const home = page.locator("li").filter({ hasText: "Home —" });
  await home.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByLabel("Type delete to confirm").fill("delete");
  await page.getByRole("dialog").getByRole("button", { name: "Delete address" }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 15_000 });
  await expect(home).toHaveCount(0, { timeout: 15_000 });

  // ---- Delete from the list -------------------------------------------------------------------------
  await page.goto(`/admin/customers?q=${unique}`);
  const row = page.getByRole("row", { name: new RegExp(unique) });
  await row.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(`Type ${newEmail} to confirm`).fill(newEmail);
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 }); // the delete has finished (see admin-coupons.spec.ts)
  await expect(row).toHaveCount(0, { timeout: 15_000 });
});
