import "server-only";

import { notInArray } from "drizzle-orm";
import { variants } from "../schema";

/**
 * Variants the storefront never shows.
 *
 *  - Gift-only (client, 2026-09-21: "the 20gm packs are just for free gift — don't show them anywhere
 *    except the free gift section"): the 20 gm Blue/Red Tea packs and the 100 gm Classic/Assam packs.
 *    The 100 gm spice gifts are ordinary catalogue variants and stay visible.
 *  - Retired: variants dropped from the range (client's variant table, 2026-09-21) that past orders
 *    still point to, so they can't be deleted — hidden instead.
 *
 * Every storefront read skips them via `notGiftOnly`. The cart's pricing lookup (variants.ts) and the
 * free-gift menu (free-gift.ts) read them directly, so gifts and existing carts keep working.
 */
export const GIFT_ONLY_SKUS = ["0023-20-gm", "0032-20-gm", "0030-100-gm", "0035-100-gm"];
export const RETIRED_SKUS = ["0033-36-4PK", "0023-105-gm", "0032-105-gm"];

/** SQL condition: this variant row is shown on the storefront. Use in a query's WHERE or a join's ON. */
export const notGiftOnly = notInArray(variants.sku, [...GIFT_ONLY_SKUS, ...RETIRED_SKUS]);
