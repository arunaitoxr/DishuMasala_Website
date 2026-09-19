import { test, expect } from "@playwright/test";

/**
 * The full happy path (PROMPTS.md Phase 5 item 12): browse → select variant → add to cart →
 * apply WELCOME5 at checkout → complete checkout → mocked Razorpay success → land on the
 * confirmation page.
 *
 * No real Razorpay account exists in this environment. Rather than skip the "mocked Razorpay
 * success" requirement, this test arms lib/razorpay/client.ts's explicit test-only override
 * (app/api/testing/razorpay-mock, 404s whenever NODE_ENV is "production") so order creation
 * skips the real network call, and replaces `window.Razorpay` with a fake that "captures" a
 * payment via that same test route — which computes a REAL, validly-signed HMAC using the actual
 * RAZORPAY_KEY_SECRET. Everything downstream — RazorpayButton's outcome handling, the real
 * /api/payment/verify signature check, finalizeOrderPayment, the redirect — runs for real; only
 * the third-party Razorpay checkout surface itself is replaced.
 */
const BLUE_TEA_LOOSE = "/product/premium-herbal-blue-tea-loose";

test("browse → variant → add to cart → WELCOME5 → checkout → mocked Razorpay success → confirmation", async ({ page, request }) => {
  const armRes = await request.post("/api/testing/razorpay-mock", { data: { action: "arm" } });
  expect(armRes.ok()).toBeTruthy();

  await page.addInitScript(() => {
    class FakeRazorpay {
      private options: {
        order_id: string;
        handler: (r: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;
      };
      constructor(options: FakeRazorpay["options"]) {
        this.options = options;
      }
      async open() {
        const res = await fetch("/api/testing/razorpay-mock", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "capture", orderId: this.options.order_id }),
        });
        const data = await res.json();
        this.options.handler({
          razorpay_payment_id: data.paymentId,
          razorpay_order_id: this.options.order_id,
          razorpay_signature: data.signature,
        });
      }
      on() {
        /* payment.failed listener — unused on the success path */
      }
    }
    window.Razorpay = FakeRazorpay;
  });

  await page.goto(BLUE_TEA_LOOSE);

  // Select the second variant (a real interaction — proves the whole flow works off a genuine
  // variant switch, not just whatever loaded first).
  const chips = page.locator('div[role="radiogroup"] input[type="radio"]');
  if ((await chips.count()) > 1) await chips.nth(1).check({ force: true });

  await page.locator("#pdp-buy-box").getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("heading", { name: /your cart \(/i })).toBeVisible();

  await page.getByRole("link", { name: "Checkout" }).click();
  await expect(page).toHaveURL(/\/checkout\/?$/);

  const email = `e2e-happy-${Date.now()}@example.com`;
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue to address" }).click();

  await page.getByLabel("Full name").fill("Playwright Tester");
  await page.getByLabel("Mobile number").fill("9876543210");
  await page.getByLabel("Pincode").fill("148001");
  await page.getByLabel("Address line 1").fill("221B Test Lane");
  await page.getByLabel("City").fill("Sangrur");
  await page.locator("#checkout-state").click();
  await page.keyboard.type("Punjab");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Continue to payment" }).click();

  // Apply WELCOME5 — server-validated, not computed client-side (lib/commerce/pricing.ts).
  await page.getByPlaceholder("Coupon code").fill("WELCOME5");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText(/coupon.*welcome5.*applied/i)).toBeVisible();
  await expect(page.getByText(/discount \(welcome5\)/i)).toBeVisible();

  await page.getByRole("radio", { name: /pay online/i }).check();
  await page.getByRole("button", { name: "Continue to pay" }).click();

  const payButton = page.getByRole("button", { name: /^pay ₹/i });
  await expect(payButton).toBeVisible({ timeout: 10_000 });
  await payButton.click();

  await expect(page).toHaveURL(/\/order\/DM-\d{4}-\d{5}/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /order confirmed|thank you/i })).toBeVisible();
  await expect(page.getByText(/discount \(welcome5\)/i)).toBeVisible();

  await request.post("/api/testing/razorpay-mock", { data: { action: "disarm" } });
});
