"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const schema = z.object({
  email: z.email("Enter a valid email address"),
});
type FormValues = z.infer<typeof schema>;

/** Footer newsletter sign-up, saved through app/api/marketing/newsletter (it used to confirm without
 * sending anything). The thank-you only shows once the server has the address. */
export function NewsletterForm() {
  const [submitted, setSubmitted] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ email }) => {
    setFailed(null);
    try {
      const res = await fetch("/api/marketing/newsletter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, sourcePath: window.location.pathname }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setFailed(data?.error ?? "Couldn't sign you up just now — please try again.");
        return;
      }
      setSubmitted(true);
      reset();
    } catch {
      setFailed("Couldn't sign you up just now — please try again.");
    }
  });

  if (submitted) {
    return (
      <p role="status" className="text-sm font-medium text-ink">
        Thanks — you&apos;re on the list.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
      <label htmlFor="newsletter-email" className="text-sm font-semibold text-ink">
        Get brew guides and launch news
      </label>
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            id="newsletter-email"
            type="email"
            placeholder="you@example.com"
            invalid={!!errors.email}
            aria-describedby={errors.email ? "newsletter-email-error" : undefined}
            {...register("email")}
          />
        </div>
        <Button type="submit" variant="solid-ink" loading={isSubmitting}>
          Subscribe
        </Button>
      </div>
      {failed && (
        <p role="alert" className="text-xs text-crit">
          {failed}
        </p>
      )}
      {errors.email && (
        <p id="newsletter-email-error" role="alert" className="text-xs text-crit">
          {errors.email.message}
        </p>
      )}
    </form>
  );
}
