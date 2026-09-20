/**
 * Splits a variant's `option_value` into what the PDP pack card shows: a name, an optional detail
 * pill, and — when the value carries a real quantity — the basis for a per-unit price, so the card can
 * show a figure computed from the variant's own price (never a stored or guessed one).
 *
 * Understood shapes:
 *   "Starter Pack: 36 tea bags" / "Value (72 Teabags)"  → name + detail, per tea bag
 *   "100 gm" / "100 gm x2" / "52 gm x 4"                → "Single pack" / "Pack of 2" + "100 gm × 2",
 *                                                          per 100 g over the total weight
 * Anything else is all name. Display-only: pricing and stock never read this.
 */
export interface VariantUnitBasis {
  /** Total units in the variant (tea bags, or grams). */
  units: number;
  /** How many units the per-unit price is quoted for (1 tea bag, 100 g). */
  perUnits: number;
  /** Suffix for the ribbon: "bag" → "₹9.69/bag". */
  label: string;
}

export interface VariantOptionParts {
  name: string;
  detail: string | null;
  basis: VariantUnitBasis | null;
}

const COLON = /^(.+?)\s*:\s*(.+)$/;
const PARENS = /^(.+?)\s*\((.+)\)$/;
const TEABAGS = /(\d+)\s*tea\s*-?bags?\b/i;
const GRAMS = /^(\d+(?:\.\d+)?)\s*(?:gm|g)\s*(?:[x×]\s*(\d+))?$/i;

export function parseVariantOption(optionValue: string): VariantOptionParts {
  const value = optionValue.trim();

  const grams = GRAMS.exec(value);
  if (grams) {
    const each = Number(grams[1]);
    const packs = grams[2] ? Number(grams[2]) : 1;
    return {
      name: packs > 1 ? `Pack of ${packs}` : "Single pack",
      detail: packs > 1 ? `${grams[1]} gm × ${packs}` : `${grams[1]} gm`,
      basis: { units: each * packs, perUnits: 100, label: "100g" },
    };
  }

  const m = COLON.exec(value) ?? PARENS.exec(value);
  const name = m ? m[1].trim() : value;
  const detail = m ? m[2].trim() : null;
  const count = TEABAGS.exec(detail ?? "") ?? TEABAGS.exec(name);
  return {
    name,
    detail,
    basis: count ? { units: Number(count[1]), perUnits: 1, label: "bag" } : null,
  };
}
