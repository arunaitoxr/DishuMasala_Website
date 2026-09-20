import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
beforeAll(() => {
  process.env.ORDER_LINK_SECRET = "test-secret";
});

describe("checkout OTP", () => {
  it("verifies the right code and yields a proof valid only for that email", async () => {
    const { createOtpChallenge, verifyOtp, isEmailProofValid } = await import("@/lib/checkout-otp");
    const { code, challenge } = createOtpChallenge("A@x.com");
    const proof = verifyOtp("a@x.com", code, challenge);
    expect(proof).not.toBeNull();
    expect(isEmailProofValid("a@x.com", proof)).toBe(true);
    expect(isEmailProofValid("b@x.com", proof)).toBe(false);
  });

  it("rejects a wrong code, another email, an expired challenge and a tampered proof", async () => {
    const { createOtpChallenge, verifyOtp, isEmailProofValid } = await import("@/lib/checkout-otp");
    const now = Date.now();
    const { code, challenge } = createOtpChallenge("a@x.com", now);
    expect(verifyOtp("a@x.com", code === "000000" ? "111111" : "000000", challenge, now)).toBeNull();
    expect(verifyOtp("b@x.com", code, challenge, now)).toBeNull();
    expect(verifyOtp("a@x.com", code, challenge, now + 11 * 60 * 1000)).toBeNull();
    const proof = verifyOtp("a@x.com", code, challenge, now)!;
    expect(isEmailProofValid("a@x.com", proof, now + 61 * 60 * 1000)).toBe(false);
    expect(isEmailProofValid("a@x.com", proof.slice(0, -1) + "0", now)).toBe(false);
    expect(isEmailProofValid("a@x.com", null)).toBe(false);
  });
});
