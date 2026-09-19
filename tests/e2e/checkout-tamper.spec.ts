import { test, expect } from "@playwright/test";

/**
 * The tampered-price run PROMPTS.md Phase 5 explicitly requires ("don't skip it"): deliberately
 * POST a manipulated total straight to the checkout API and assert it is rejected with a
 * corrected cart, not silently accepted.
 */
test("POSTing a manipulated total to /api/checkout is rejected with the server's corrected cart, not silently accepted", async ({
  page,
  request,
}) => {
  // A real, in-stock variant read off a live product page rather than a hard-coded id — variant 1
  // was a duplicate Blue Tea teabag pack, removed from the catalogue on 2026-09-20.
  await page.goto("/product/premium-herbal-red-tea-loose");
  const { variantId } = JSON.parse(await page.locator('[data-testid="add-to-cart-payload"]').innerText()) as { variantId: number };

  const validateRes = await request.post("/api/cart/validate", {
    data: { lines: [{ variantId, qty: 1 }], email: `e2e-tamper-${Date.now()}@example.com` },
  });
  expect(validateRes.ok()).toBeTruthy();
  const { pricing: realPricing } = await validateRes.json();
  const realTotal = realPricing.totalPaise;
  expect(realTotal).toBeGreaterThan(0);

  const tamperedTotal = 1; // the attack: claim the order is worth ₹0.01

  const checkoutRes = await request.post("/api/checkout", {
    data: {
      idempotencyKey: crypto.randomUUID(),
      email: `e2e-tamper-${Date.now()}@example.com`,
      lines: [{ variantId, qty: 1 }],
      paymentMethod: "cod",
      shippingAddress: {
        name: "Tamper Tester",
        phone: "9876543212",
        line1: "1 Attack Ave",
        city: "Sangrur",
        state: "Punjab",
        pincode: "148001",
      },
      customerNote: null,
      clientTotalPaise: tamperedTotal,
    },
  });

  expect(checkoutRes.status()).toBe(409);
  const body = await checkoutRes.json();
  expect(body.ok).toBe(false);
  expect(body.error.code).toBe("price_mismatch");
  // The server's own recomputation is returned — never an echo of the tampered figure.
  expect(body.error.correctedCart.totalPaise).toBe(realTotal);
  expect(body.error.correctedCart.totalPaise).not.toBe(tamperedTotal);
});
