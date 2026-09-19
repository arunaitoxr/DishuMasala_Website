"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

export const RadioGroup = RadioGroupPrimitive.Root;

export type RadioGroupItemProps = ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>;

export function RadioGroupItem({ className, ...props }: RadioGroupItemProps) {
  return (
    <RadioGroupPrimitive.Item
      className={cn(
        "size-5 shrink-0 rounded-full border border-ink-3 bg-surface",
        // Ink when checked — the one "on" colour every form control uses (shop filters, checkout).
        "data-[state=checked]:border-ink",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "flex items-center justify-center transition-colors duration-[180ms]",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="size-2.5 rounded-full bg-ink" />
    </RadioGroupPrimitive.Item>
  );
}
