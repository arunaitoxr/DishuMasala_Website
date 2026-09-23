"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/Accordion";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { RazorpayButton } from "./RazorpayButton";
import { OrderSummary } from "@/components/cart/OrderSummary";
import { CouponField } from "@/components/cart/CouponField";
import { CartNotices } from "@/components/cart/CartNotices";
import { INDIAN_STATES } from "@/lib/commerce/address";
import { checkPincodeAction } from "@/lib/actions/pincode";
import type { ServiceabilityResult } from "@/lib/shiprocket";
import { useCartStore, selectItemCount } from "@/lib/store/cart";

const checkoutSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  name: z.string().trim().min(2, "Enter your name").max(80),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  line1: z.string().trim().min(3, "Enter your address").max(160),
  line2: z.string().trim().max(160).optional(),
  city: z.string().trim().min(2, "Enter a city").max(80),
  state: z.enum(INDIAN_STATES, { message: "Choose a state" }),
  pincode: z.string().trim().regex(/^\d{6}$/, "Enter a valid 6-digit pincode"),
  paymentMethod: z.literal("razorpay"),
});

type CheckoutFormValues = z.infer<typeof checkoutSchema>;

type Step = "contact" | "address" | "payment";

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }
  | { kind: "awaiting_payment"; razorpayOrderId: string; razorpayKeyId: string; amountPaise: number; confirmationUrl: string }
  | { kind: "redirecting" };

const CONTACT_FIELDS = ["email", "phone"] as const;
const ADDRESS_FIELDS = ["name", "line1", "line2", "city", "state", "pincode"] as const;

export function CheckoutForm() {
  const router = useRouter();
  const lines = useCartStore((s) => s.lines);
  const itemCount = useCartStore(selectItemCount);
  const pricing = useCartStore((s) => s.pricing);
  const couponCode = useCartStore((s) => s.couponCode);
  const setEmail = useCartStore((s) => s.setEmail);
  const revalidate = useCartStore((s) => s.revalidate);
  const clearAfterOrder = useCartStore((s) => s.clearAfterOrder);

  const [step, setStep] = useState<Step>("contact");
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });
  const [pincodeStatus, setPincodeStatus] = useState<{ pincode: string; result: ServiceabilityResult } | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const formId = useId();

  const {
    register,
    handleSubmit,
    trigger,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { paymentMethod: "razorpay" },
    mode: "onBlur",
  });

  const pincode = watch("pincode");

  // Drives the same Shiprocket serviceability check the PDP uses (lib/shiprocket.ts), reused —
  // never duplicated — via the same server action (PROMPTS.md Phase 5 item 5).
  useEffect(() => {
    if (!pincode || !/^\d{6}$/.test(pincode)) {
      setPincodeStatus(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await checkPincodeAction(pincode);
      if (!cancelled && res.ok) setPincodeStatus({ pincode, result: res.result });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pincode]);

  const goToStep = async (target: Step) => {
    if (target === "address") {
      if (!(await trigger(CONTACT_FIELDS))) return;
      // Set the cart's guest identity as soon as it's known (not only at final submit) — coupon
      // rules like WELCOME5's first-order-only check (lib/commerce/pricing.ts) need an email to
      // evaluate at all, and the coupon field is reachable from here on (checkout's sticky
      // summary) before the shopper ever reaches the Payment step.
      setEmail(getValues("email"));
      void revalidate();
    }
    if (target === "payment" && !(await trigger([...CONTACT_FIELDS, ...ADDRESS_FIELDS]))) return;
    setStep(target);
  };

  const clientTotalPaise = pricing?.totalPaise ?? null;

  const onPlaceOrder = handleSubmit(async (values) => {
    if (lines.length === 0 || clientTotalPaise == null) {
      setSubmitState({ kind: "error", message: "Your cart is empty." });
      return;
    }
    setEmail(values.email);
    setSubmitState({ kind: "submitting" });

    const body = {
      idempotencyKey,
      email: values.email,
      lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
      couponCode,
      paymentMethod: values.paymentMethod,
      shippingAddress: {
        name: values.name,
        phone: values.phone,
        line1: values.line1,
        line2: values.line2 || undefined,
        city: values.city,
        state: values.state,
        pincode: values.pincode,
      },
      customerNote: null,
      clientTotalPaise,
    };

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!data.ok) {
        if (data.error?.code === "price_mismatch" || data.error?.code === "cart_changed") {
          await revalidate();
          setSubmitState({
            kind: "error",
            message: "Your cart changed since you last checked it — we've updated it below. Please review and place your order again.",
          });
          return;
        }
        setSubmitState({ kind: "error", message: data.error?.message ?? "Something went wrong. Please try again." });
        return;
      }

      // razorpay: order created (or replayed) — now show the pay button.
      setSubmitState({
        kind: "awaiting_payment",
        razorpayOrderId: data.razorpayOrderId,
        razorpayKeyId: data.razorpayKeyId,
        amountPaise: data.totalPaise,
        confirmationUrl: data.confirmationUrl,
      });
    } catch {
      setSubmitState({ kind: "error", message: "Couldn't reach the server. Please check your connection and try again." });
    }
  });

  const values = watch();

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_360px]">
      <form id={formId} noValidate onSubmit={onPlaceOrder} className="flex flex-col gap-4">
        <div aria-live="polite" role="status" className="sr-only">
          {submitState.kind === "submitting" ? "Placing your order…" : ""}
        </div>

        <Accordion type="single" value={step} onValueChange={(v) => v && setStep(v as Step)} className="rounded-lg border border-line bg-surface">
          <AccordionItem value="contact" className="px-4">
            <AccordionTrigger>1. Contact</AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-3">
                <div>
                  <label htmlFor="checkout-email" className="mb-1.5 block text-sm font-semibold text-ink">
                    Email
                  </label>
                  <Input
                    id="checkout-email"
                    type="email"
                    autoComplete="email"
                    invalid={!!errors.email}
                    aria-describedby={errors.email ? "checkout-email-error" : undefined}
                    {...register("email")}
                  />
                  {errors.email && (
                    <p id="checkout-email-error" role="alert" className="mt-1 text-xs text-crit">
                      {errors.email.message}
                    </p>
                  )}
                </div>
                <Field id="checkout-phone" label="Mobile number" error={errors.phone?.message}>
                  <Input id="checkout-phone" type="tel" inputMode="numeric" autoComplete="tel" maxLength={10} invalid={!!errors.phone} {...register("phone")} />
                </Field>
                <p className="text-xs text-ink-2">No account needed — your order confirmation will be sent to this email.</p>

                <Button type="button" variant="solid-ink" size="md" className="self-start" onClick={() => void goToStep("address")}>
                  Continue to address
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="address" className="px-4">
            <AccordionTrigger>2. Address</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field id="checkout-name" label="Full name" error={errors.name?.message} className="sm:col-span-2">
                  <Input id="checkout-name" autoComplete="name" invalid={!!errors.name} {...register("name")} />
                </Field>
                <Field id="checkout-pincode" label="Pincode" error={errors.pincode?.message}>
                  <Input id="checkout-pincode" inputMode="numeric" maxLength={6} autoComplete="postal-code" invalid={!!errors.pincode} {...register("pincode")} />
                </Field>
                <Field id="checkout-line1" label="Address line 1" error={errors.line1?.message} className="sm:col-span-2">
                  <Input id="checkout-line1" autoComplete="address-line1" invalid={!!errors.line1} {...register("line1")} />
                </Field>
                <Field id="checkout-line2" label="Address line 2 (optional)" className="sm:col-span-2">
                  <Input id="checkout-line2" autoComplete="address-line2" {...register("line2")} />
                </Field>
                <Field id="checkout-city" label="City" error={errors.city?.message}>
                  <Input id="checkout-city" autoComplete="address-level2" invalid={!!errors.city} {...register("city")} />
                </Field>
                <div>
                  <label htmlFor="checkout-state" className="mb-1.5 block text-sm font-semibold text-ink">
                    State
                  </label>
                  <Select value={values.state} onValueChange={(v) => setValue("state", v as CheckoutFormValues["state"], { shouldValidate: true })}>
                    <SelectTrigger id="checkout-state" aria-describedby={errors.state ? "checkout-state-error" : undefined}>
                      <SelectValue placeholder="Choose a state" />
                    </SelectTrigger>
                    <SelectContent>
                      {INDIAN_STATES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.state && (
                    <p id="checkout-state-error" role="alert" className="mt-1 text-xs text-crit">
                      {errors.state.message as string}
                    </p>
                  )}
                </div>

                <div className="sm:col-span-2" aria-live="polite" role="status">
                  {pincodeStatus != null && pincodeStatus.pincode === pincode && (
                    <PincodeStatusLine result={pincodeStatus.result} pincode={pincode} />
                  )}
                </div>

                <div className="sm:col-span-2">
                  <Button type="button" variant="solid-ink" size="md" onClick={() => void goToStep("payment")}>
                    Continue to payment
                  </Button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="payment" className="px-4">
            <AccordionTrigger>3. Payment</AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-4">
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold text-ink">Payment method</legend>
                  <div className="flex items-center gap-2.5 rounded-md border border-line bg-surface px-3.5 py-3 text-sm font-medium text-ink">
                    <span className="size-2 rounded-full bg-ok" aria-hidden="true" />
                    Pay online — UPI, cards, netbanking
                  </div>
                </fieldset>

                <div aria-live="assertive" role="alert">
                  {submitState.kind === "error" && <p className="text-sm text-crit">{submitState.message}</p>}
                </div>

                <CartNotices />

                {submitState.kind === "awaiting_payment" ? (
                  <RazorpayButton
                    razorpayOrderId={submitState.razorpayOrderId}
                    razorpayKeyId={submitState.razorpayKeyId}
                    amountPaise={submitState.amountPaise}
                    shopName="Dishu Food and Beverages"
                    prefill={{ name: values.name, email: values.email, contact: values.phone }}
                    onSuccess={({ razorpayPaymentId, razorpaySignature }) =>
                      void verifyPayment({
                        razorpayOrderId: submitState.razorpayOrderId,
                        razorpayPaymentId,
                        razorpaySignature,
                        confirmationUrl: submitState.confirmationUrl,
                        setSubmitState,
                        clearAfterOrder,
                        router,
                      })
                    }
                    onDismiss={() => setSubmitState({ kind: "error", message: "Payment was cancelled. You can try again below." })}
                    onFailure={(message) => setSubmitState({ kind: "error", message })}
                  />
                ) : (
                  <Button type="submit" variant="gradient" size="lg" loading={submitState.kind === "submitting"} disabled={itemCount === 0}>
                    Continue to pay
                  </Button>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </form>

      <aside className="flex flex-col gap-4 rounded-lg border border-line bg-transparent p-5 lg:sticky lg:top-24 lg:self-start">
        <h2 className="font-display text-lg font-semibold text-ink">Order summary ({itemCount})</h2>
        <CouponField />
        <OrderSummary pricing={pricing} />
      </aside>
    </div>
  );
}

function Field({
  id,
  label,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-crit">
          {error}
        </p>
      )}
    </div>
  );
}

function PincodeStatusLine({ result, pincode }: { result: ServiceabilityResult; pincode: string }) {
  if (result.status === "serviceable") {
    return (
      <p className="text-sm text-ok">
        Delivers to {pincode}
        {result.etaDays != null ? ` in ~${result.etaDays} day${result.etaDays === 1 ? "" : "s"}` : ""}.
      </p>
    );
  }
  if (result.status === "unserviceable") {
    return <p className="text-sm text-crit">We currently can&apos;t deliver to {pincode}.</p>;
  }
  return <p className="text-sm text-ink-2">We couldn&apos;t check delivery for this pincode right now — you can still place your order.</p>;
}

async function verifyPayment({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
  confirmationUrl,
  setSubmitState,
  clearAfterOrder,
  router,
}: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  confirmationUrl: string;
  setSubmitState: (s: SubmitState) => void;
  clearAfterOrder: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  setSubmitState({ kind: "submitting" });
  try {
    const res = await fetch("/api/payment/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ razorpayOrderId, razorpayPaymentId, razorpaySignature }),
    });
    const data = await res.json();
    if (!data.ok) {
      setSubmitState({
        kind: "error",
        message: "We couldn't confirm your payment yet — if the amount was deducted, it will still be captured shortly and your order confirmed by email.",
      });
      return;
    }
    clearAfterOrder();
    setSubmitState({ kind: "redirecting" });
    const url = new URL(data.confirmationUrl ?? confirmationUrl);
    router.push(url.pathname + url.search);
  } catch {
    setSubmitState({
      kind: "error",
      message: "We couldn't reach the server to confirm your payment — if the amount was deducted, your order will still be confirmed shortly.",
    });
  }
}
