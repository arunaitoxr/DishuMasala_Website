/**
 * The staff account the admin E2E specs sign in with — read from the environment (playwright.config.ts
 * loads the gitignored `.env.e2e.local`), never hard-coded. These specs used to carry the real
 * admin@dishumasala.com address and its password in the repo, which is public on GitHub.
 *
 * Create a local-only account once and record it in `.env.e2e.local`:
 *   E2E_ADMIN_EMAIL=e2e-admin@dishumasala.test
 *   E2E_ADMIN_PASSWORD=<any strong password>
 *   pnpm create-staff-user --email=$E2E_ADMIN_EMAIL --password=$E2E_ADMIN_PASSWORD --name="E2E Admin" --role=admin
 */
export function adminCredentials(): { email: string; password: string } {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD (see tests/e2e/_helpers/admin.ts) before running the admin E2E specs.");
  }
  return { email, password };
}
