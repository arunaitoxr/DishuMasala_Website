import { defineConfig, devices } from "@playwright/test";

// Local-only test credentials (E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD) — gitignored, never committed.
try {
  process.loadEnvFile(".env.e2e.local");
} catch {
  // Not present: the admin specs explain what to set when they run.
}

/** Override when :3000 is taken by something else, e.g. `TEST_BASE_URL=http://localhost:3001 pnpm test:e2e`. */
const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

/**
 * Playwright E2E config (PROMPTS.md Phase 3 item 7 is the first phase to need this — no config
 * existed before). Points at the already-running local dev server (CLAUDE.md's dev environment
 * note: `pnpm dev` may already be up on :3000) rather than starting a second one — `webServer` is
 * configured with `reuseExistingServer: true` so `pnpm test:e2e` still works standalone in CI or a
 * fresh checkout, without erroring on "port in use" here.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    // Pre-dismisses components/marketing/PhoneCapturePopup.tsx for every test: it opens 5s after
    // landing, timed for a real visitor, not a test suite — a test that takes longer than that
    // (a review form, a multi-step checkout) would otherwise get its own click swallowed by the
    // popup's overlay, exactly the kind of flaky, hard-to-diagnose failure a real QA suite avoids
    // by suppressing marketing popups in its test sessions rather than working around them per spec.
    storageState: "tests/e2e/_storage/no-popup.json",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
