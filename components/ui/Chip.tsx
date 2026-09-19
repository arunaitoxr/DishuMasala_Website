"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  /** A CSS color value (e.g. `var(--color-hibiscus)`) rendered as a small leading dot — used for
   * product-family accent chips. Never a hex literal at the call site. */
  accentColor?: string;
}

/** An option/filter chip — e.g. a size selector on the PDP, or a family-accent label on a card.
 * Plain <button> under the hood so it's keyboard- and screen-reader-native for free. */
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { selected = false, accentColor, className, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-sm font-medium transition-colors duration-[180ms]",
        "disabled:opacity-50 disabled:pointer-events-none",
        selected
          ? "border-citrus bg-citrus text-ink" // same selected state as the product page's pack cards
          : "border-line bg-surface text-ink-2 hover:border-ink-3",
        className,
      )}
      {...props}
    >
      {accentColor && (
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: accentColor }}
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
});
