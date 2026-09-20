"use client";

import { useState } from "react";
import { Placeholder } from "@/components/media/Placeholder";
import { PriceBlock } from "@/components/ui/PriceBlock";
import { Button } from "@/components/ui/Button";
import { paise } from "@/lib/money";
import { useCartStore } from "@/lib/store/cart";
import type { ProductCardData, Variant } from "@/types/catalog";

/**
 * Cart merchandising rail (PROMPTS.md Phase 5 item 2, cart-redesign brief §10/§11): "Complete your
 * spice box" — the server-fetched `candidates` (CartUpsells.tsx) filtered to higher-priority
 * collections than what's already in the cart and never a product already in it (CLAUDE.md §7.2's
 * priority order stands in for "complementary" since there is no separate tag-based affinity system
 * in this schema). Combo packs are left out of it. The "Save more with combos" block that used to sit
 * above it was removed at the client's request (2026-09-20).
 *
 * Renders only from real catalogue data passed down from the server; nothing here invents a product
 * or price.
 */
export function CartUpsellsList({ candidates }: { candidates: ProductCardData[] }) {
  const lines = useCartStore((s) => s.lines);

  const cartProductIds = new Set(lines.map((l) => l.productId));
  const minCartPriority = lines.length > 0 ? Math.min(...lines.map((l) => l.priority)) : Infinity;

  const inStockWithVariant = candidates.filter((p) => p.variants[0] && !cartProductIds.has(p.id));

  const regular = inStockWithVariant
    .filter((p) => p.collectionSlug !== "combos" && p.priority < minCartPriority)
    .slice(0, 4);

  if (regular.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      {regular.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-ink-2">Complete your spice box</h2>
          <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible">
            {regular.map((product) => (
              <UpsellCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function useAddState() {
  const addItem = useCartStore((s) => s.addItem);
  const [state, setState] = useState<"idle" | "adding" | "added">("idle");

  const add = async (payload: Parameters<typeof addItem>[0]) => {
    setState("adding");
    await addItem(payload);
    setState("added");
    window.setTimeout(() => setState("idle"), 1600);
  };

  return { state, add };
}

function buildPayload(product: ProductCardData, variant: Variant, image?: { url: string }) {
  return {
    variantId: variant.id,
    productId: product.id,
    priority: product.priority,
    qty: 1,
    productName: product.name,
    optionValue: variant.optionValue,
    sku: variant.sku,
    mrpPaise: variant.mrpPaise,
    unitPricePaise: variant.pricePaise,
    imageUrl: image?.url ?? null,
  };
}

function UpsellCard({ product }: { product: ProductCardData }) {
  const variant = product.variants[0]!;
  const image = product.images[0];
  const { state, add } = useAddState();

  return (
    <div className="flex w-36 shrink-0 flex-col gap-2 rounded-md border border-line bg-surface p-3 sm:w-auto">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- small fixed-size thumbnail, not worth next/image's overhead here.
        <img src={image.url} alt={image.alt} className="aspect-square w-full rounded-sm object-cover" loading="lazy" />
      ) : (
        <Placeholder slot="product-packshot-generic" className="rounded-sm" />
      )}
      <p className="text-sm font-semibold text-ink line-clamp-2">{product.name}</p>
      <PriceBlock mrpPaise={paise(variant.mrpPaise)} pricePaise={paise(variant.pricePaise)} showTaxNote={false} />
      <Button
        type="button"
        variant={state === "added" ? "outline" : "outline"}
        size="sm"
        disabled={!variant.inStock || state === "adding"}
        onClick={() => void add(buildPayload(product, variant, image))}
      >
        {state === "adding" ? "Adding…" : state === "added" ? "✓ Added" : "+ Add"}
      </Button>
    </div>
  );
}
