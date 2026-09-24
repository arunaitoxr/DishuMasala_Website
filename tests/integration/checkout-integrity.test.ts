import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Vitest doesn't load .env itself (unlike `pnpm dev`/`tsx --env-file-if-exists`) — this test talks
// to Postgres directly via `pg`, so it needs DATABASE_URL in process.env the same way the app does.
if (!process.env.DATABASE_URL && existsSync(".env")) {
  process.loadEnvFile(".env");
}

/**
 * Real, black-box integration tests against the actually-running app (CLAUDE.md §12 / PROMPTS.md:
 * "Verify, don't trust the summary") — not a mock, not a unit test of pricing.ts in isolation.
 * These hit `http://localhost:3000` (the same dev server this repo's other tooling assumes is up)
 * and then check the real Postgres row count directly via `pg`, independent of anything the app
 * itself reports back. This is the literal proof PROMPTS.md's Phase 5 acceptance criteria asks
 * for: "fire two concurrent identical requests... and assert only one order row exists
 * afterward" — done here for real, not argued about.
 *
 * Requires `pnpm dev` running on :3000 and DATABASE_URL pointed at the same Postgres the app uses.
 */
const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

let dbClient: Client;
let testVariantId: number;

beforeAll(async () => {
  try {
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`unexpected status ${res.status}`);
  } catch (err) {
    throw new Error(
      `checkout-integrity.test.ts requires the dev server running at ${BASE_URL} (start it with 'pnpm dev'). Underlying error: ${err}`,
    );
  }

  dbClient = new Client({ connectionString: process.env.DATABASE_URL });
  await dbClient.connect();

  const { rows } = await dbClient.query<{ id: number }>(
    `select id from variants where in_stock = true limit 1`,
  );
  if (!rows[0]) throw new Error("No in-stock variant found in the seeded database to test against.");
  testVariantId = rows[0].id;
}, 15_000);

afterAll(async () => {
  await dbClient?.end();
});

async function getServerPricing(email: string) {
  const res = await fetch(`${BASE_URL}/api/cart/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lines: [{ variantId: testVariantId, qty: 1 }], email }),
  });
  const body = await res.json();
  return body.pricing as { totalPaise: number };
}

function buildCheckoutBody(overrides: Record<string, unknown> = {}) {
  const suffix = randomUUID().slice(0, 8);
  return {
    idempotencyKey: randomUUID(),
    email: `integration-test-${suffix}@example.com`,
    lines: [{ variantId: testVariantId, qty: 1 }],
    // Cash on delivery was removed (CLAUDE.md §7.1) — every order is prepaid via Razorpay now.
    paymentMethod: "razorpay" as const,
    shippingAddress: {
      name: "Test Shopper",
      phone: "9876543210",
      line1: "123 Test Street",
      city: "Sangrur",
      state: "Punjab",
      pincode: "148001",
    },
    customerNote: null,
    clientTotalPaise: 1, // deliberately wrong unless overridden
    ...overrides,
  };
}

describe("POST /api/checkout — manipulated price is rejected with the corrected cart", () => {
  it("rejects a client-submitted total that is lower than the real server-computed total, and returns the corrected cart", async () => {
    const email = `tamper-${randomUUID()}@example.com`;
    const real = await getServerPricing(email);
    expect(real.totalPaise).toBeGreaterThan(0);

    // The attack: submit a price far below what the server would actually charge (as if a
    // shopper intercepted the request and rewrote the total to ₹1).
    const tamperedTotalPaise = 1;
    expect(tamperedTotalPaise).not.toBe(real.totalPaise);

    const res = await fetch(`${BASE_URL}/api/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildCheckoutBody({ email, clientTotalPaise: tamperedTotalPaise })),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("price_mismatch");
    // The corrected cart is the server's own recomputation, not an echo of the tampered value.
    expect(body.error.correctedCart.totalPaise).toBe(real.totalPaise);
    expect(body.error.correctedCart.totalPaise).not.toBe(tamperedTotalPaise);

    // And no order was created for this attempt.
    const { rows } = await dbClient.query<{ count: string }>(
      `select count(*)::int as count from orders where email = $1`,
      [buildCheckoutBody({ email }).email],
    );
    expect(Number(rows[0].count)).toBe(0);
  });

  it("also rejects a total inflated above the real price (not just a discount attempt)", async () => {
    const email = `tamper-high-${randomUUID()}@example.com`;
    const real = await getServerPricing(email);

    const res = await fetch(`${BASE_URL}/api/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildCheckoutBody({ email, clientTotalPaise: real.totalPaise + 500000 })),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("price_mismatch");
    expect(body.error.correctedCart.totalPaise).toBe(real.totalPaise);
  });
});

describe("POST /api/checkout — idempotency key prevents a double-submit from creating two orders", () => {
  it("two concurrent identical requests with the same idempotency key produce exactly one order row", async () => {
    const email = `idempotency-${randomUUID()}@example.com`;
    const real = await getServerPricing(email);
    const body = buildCheckoutBody({ email, clientTotalPaise: real.totalPaise });
    const idempotencyKey = body.idempotencyKey;

    const post = () =>
      fetch(`${BASE_URL}/api/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json());

    // Genuinely concurrent — both fired before either has a chance to respond, simulating a
    // network retry or a double-click racing the real request.
    const [first, second] = await Promise.all([post(), post()]);
    if (!first.ok || !second.ok) {
      console.error("checkout responses:", JSON.stringify({ first, second }, null, 2));
    }

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    // Both resolve to the SAME order — one of them is the real insert, the other is the
    // unique-constraint-violation path in createOrderTransaction resolving to the winner's row.
    expect(first.orderNumber).toBe(second.orderNumber);
    expect(first.orderId).toBe(second.orderId);

    // The real, independent proof: query Postgres directly, not the app's own say-so.
    const { rows } = await dbClient.query<{ count: string }>(
      `select count(*)::int as count from orders where idempotency_key = $1`,
      [idempotencyKey],
    );
    expect(Number(rows[0].count)).toBe(1);

    const { rows: itemRows } = await dbClient.query<{ count: string }>(
      `select count(*)::int as count from order_items where order_id = $1`,
      [first.orderId],
    );
    // Exactly one item row for the one line item — not duplicated either.
    expect(Number(itemRows[0].count)).toBe(1);
  }, 20_000);

  it("a third, later request with the SAME idempotency key (a slow retry, not concurrent) also replays the same order rather than creating a second one", async () => {
    const email = `idempotency-sequential-${randomUUID()}@example.com`;
    const real = await getServerPricing(email);
    const body = buildCheckoutBody({ email, clientTotalPaise: real.totalPaise });

    const post = () =>
      fetch(`${BASE_URL}/api/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json());

    const first = await post();
    const second = await post();

    expect(first.orderNumber).toBe(second.orderNumber);

    const { rows } = await dbClient.query<{ count: string }>(
      `select count(*)::int as count from orders where idempotency_key = $1`,
      [body.idempotencyKey],
    );
    expect(Number(rows[0].count)).toBe(1);
  }, 20_000);
});
