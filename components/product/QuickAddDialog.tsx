"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/Dialog";
import { PriceBlock } from "@/components/ui/PriceBlock";
import { cn } from "@/lib/cn";
import { formatINR, type Paise } from "@/lib/money";

export interface QuickAddVariant {
  id: number;
  sku: string;
  optionValue: string;
  mrpPaise: Paise;
  pricePaise: Paise;
  inStock: boolean;
}

export interface QuickAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  optionLabel: string;
  href: string;
  variants: QuickAddVariant[];
  onAdd: (variant: QuickAddVariant) => void;
}

/**
 * The option picker a product card opens when its product comes in more than one pack. Every card
 * carries the same "Add to cart" action (the reference site's one-treatment-everywhere rule); a
 * card can't know which pack a shopper wants, so instead of silently adding the first one, or
 * sending them off to the product page, it asks here and then adds exactly what was picked.
 *
 * Same selected-state treatment as the product page's pack cards (citrus fill, ink text), and a
 * real radio group underneath, so arrow keys and screen readers behave natively.
 */
export function QuickAddDialog({ open, onOpenChange, productName, optionLabel, href, variants, onAdd }: QuickAddDialogProps) {
  const firstInStock = variants.find((v) => v.inStock) ?? variants[0];
  const [selectedId, setSelectedId] = useState(firstInStock?.id);
  const groupName = useId();
  const selected = variants.find((v) => v.id === selectedId) ?? firstInStock;
  if (!selected) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle className="pr-8 font-display text-xl font-semibold text-ink">{productName}</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-ink-2">Choose a {optionLabel.toLowerCase()} to add to your cart.</DialogDescription>

        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-semibold text-ink">{optionLabel}</legend>
          <div role="radiogroup" aria-label={optionLabel} className="grid grid-cols-2 gap-2">
            {variants.map((v) => {
              const checked = v.id === selected.id;
              return (
                <label
                  key={v.id}
                  className={cn(
                    "flex cursor-pointer flex-col gap-0.5 rounded-md border-2 px-3 py-2.5 transition-colors duration-[180ms]",
                    "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brew-2 has-[:focus-visible]:ring-offset-2",
                    checked ? "border-citrus bg-citrus text-ink" : "border-line bg-surface text-ink hover:border-ink-3",
                    !v.inStock && "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type="radio"
                    name={groupName}
                    value={v.optionValue}
                    checked={checked}
                    disabled={!v.inStock}
                    onChange={() => setSelectedId(v.id)}
                    className="sr-only"
                  />
                  <span className="text-sm font-semibold leading-tight">{v.optionValue}</span>
                  <span className={cn("text-xs tabular-nums", checked ? "text-ink/80" : "text-ink-2")}>
                    {v.inStock ? formatINR(v.pricePaise) : "Out of stock"}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <PriceBlock className="mt-5" mrpPaise={selected.mrpPaise} pricePaise={selected.pricePaise} size="lg" />

        <Button
          type="button"
          variant="gradient"
          size="lg"
          className="mt-5 w-full"
          disabled={!selected.inStock}
          onClick={() => onAdd(selected)}
        >
          Add to cart
        </Button>
        <Link
          href={href}
          className="mt-3 block text-center text-sm font-medium text-ink-2 underline underline-offset-4 hover:text-ink"
        >
          View product details
        </Link>
      </DialogContent>
    </Dialog>
  );
}
