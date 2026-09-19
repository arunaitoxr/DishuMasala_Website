import { discountPct, formatINR, type Paise } from "@/lib/money";
import { cn } from "@/lib/cn";

export interface PriceBlockProps {
  mrpPaise: Paise;
  pricePaise: Paise;
  /** Visual weight — "lg" for the PDP, "md" (default) for cards. */
  size?: "md" | "lg";
  /** Show the "Inclusive of all taxes" affordance (CLAUDE.md §4). Default true. */
  showTaxNote?: boolean;
  /** Leading qualifier for a price that depends on the chosen option — "From" on a product card
   * whose pack sizes are priced differently (the lowest real variant price, never a guessed one). */
  prefix?: string;
  className?: string;
}

/**
 * MRP struck through + sale price prominent + a "Save X%" chip computed at render time
 * (CLAUDE.md §7.3). When price === MRP there is no genuine saving, so — deliberately — no
 * strikethrough and no chip render at all, not even "Save 0%".
 */
export function PriceBlock({ mrpPaise, pricePaise, size = "md", showTaxNote = true, prefix, className }: PriceBlockProps) {
  const pct = discountPct(mrpPaise, pricePaise);
  const hasSaving = pct > 0;

  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {prefix && <span className="text-sm text-ink-2">{prefix}</span>}
        <span
          className={cn(
            "tabular-nums font-sans font-semibold text-ink",
            size === "lg" ? "text-2xl" : "text-base",
          )}
        >
          {formatINR(pricePaise)}
        </span>
        {hasSaving && (
          <>
            <span className="tabular-nums text-sm text-ink-2 line-through decoration-1">
              {formatINR(mrpPaise)}
            </span>
            <span className="tabular-nums rounded-sm bg-leaf/10 px-1.5 py-0.5 text-xs font-semibold text-leaf">
              Save {pct}%
            </span>
          </>
        )}
      </div>
      {showTaxNote && (
        <span className="text-xs text-ink-2">Inclusive of all taxes</span>
      )}
    </div>
  );
}
