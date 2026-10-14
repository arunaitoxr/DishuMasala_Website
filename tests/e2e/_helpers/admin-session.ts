import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { expect, type Page } from "@playwright/test";
import { adminCredentials } from "./admin";

/**
 * Signs the page in as the E2E staff account, reusing one saved session instead of logging in for
 * every test: the login form is rate-limited per email (10 attempts / 15 minutes, lib/rate-limit.ts),
 * which a full admin suite would otherwise trip by itself. The session file is gitignored.
 */
const SESSION_FILE = "tests/e2e/_storage/admin-session.json";
const MAX_AGE_MS = 45 * 60 * 1000;

export async function signInAsAdmin(page: Page): Promise<void> {
  const context = page.context();
  if (existsSync(SESSION_FILE) && Date.now() - statSync(SESSION_FILE).mtimeMs < MAX_AGE_MS) {
    const { cookies } = JSON.parse(await import("node:fs").then((fs) => fs.readFileSync(SESSION_FILE, "utf-8"))) as {
      cookies: Parameters<typeof context.addCookies>[0];
    };
    await context.addCookies(cookies);
    const res = await page.goto("/admin");
    if (res && /\/admin/.test(page.url())) return;
  }

  const { email, password } = adminCredentials();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account\/?$/, { timeout: 15_000 });
  mkdirSync(dirname(SESSION_FILE), { recursive: true });
  await context.storageState({ path: SESSION_FILE });
}
