"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BuyBox, type AddToCartPayload } from "@/components/pdp/BuyBox";
import { StickyAddToCart } from "@/components/pdp/StickyAddToCart";
import { useCartStore } from "@/lib/store/cart";
import { trackViewContent, trackAddToCart } from "@/lib/meta-pixel";
import type { Paise } from "@/lib/money";
import type { Variant } from "@/types/catalog";

const BUY_BOX_ID = "pdp-buy-box";

export interface PdpInteractiveProps {
  productId: number;
  productName: string;
  optionLabel: string;
  variants: Variant[];
  priority: number;
  primaryImageUrl: string | null;
  reviewCount: number;
  reviewAverage: number;
  freeShippingThresholdPaise: Paise;
  /** Passed straight through to BuyBox's `beforeTrust` slot. */
  beforeTrust?: ReactNode;
}

/**
 * Owns the one piece of state BuyBox and StickyAddToCart both need to agree on — the currently
 * selected variant/quantity — so switching a variant in the main BuyBox is reflected in the sticky
 * mobile bar's price too. Phase 5 wires "add to cart" for real, into lib/store/cart.ts (the first
 * phase with a persistent cart store) — the BuyBox payload that used to just be logged now pushes
 * a real line into the cart, which itself immediately revalidates against the server.
 */
export function PdpInteractive({
  productId,
  productName,
  optionLabel,
  variants,
  priority,
  primaryImageUrl,
  reviewCount,
  reviewAverage,
  freeShippingThresholdPaise,
  beforeTrust,
}: PdpInteractiveProps) {
  const addItem = useCartStore((s) => s.addItem);
  const [payload, setPayload] = useState<AddToCartPayload | null>(() => {
    const first = variants[0];
    return first ? { variantId: first.id, sku: first.sku, qty: 1, unitPricePaise: first.pricePaise } : null;
  });

  const selectedVariant = variants.find((v) => v.id === payload?.variantId) ?? variants[0];

  // Fires once per page load, off the variant this page actually rendered with (not whatever gets
  // selected afterward) — matches Meta's own "ViewContent = viewed this product's page" semantics.
  useEffect(() => {
    if (!selectedVariant) return;
    trackViewContent({
      content_ids: [selectedVariant.sku],
      content_type: "product",
      content_name: productName,
      value: selectedVariant.pricePaise / 100,
      currency: "INR",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally once on mount, using whatever variant was selected at that moment
  }, []);

  const addToCart = (p: AddToCartPayload) => {
    const variant = variants.find((v) => v.id === p.variantId);
    if (!variant) return;
    void addItem({
      variantId: variant.id,
      productId,
      priority,
      qty: p.qty,
      productName,
      optionValue: variant.optionValue,
      sku: variant.sku,
      mrpPaise: variant.mrpPaise,
      unitPricePaise: variant.pricePaise,
      imageUrl: primaryImageUrl,
    });
    trackAddToCart({
      content_ids: [variant.sku],
      content_type: "product",
      content_name: productName,
      value: (variant.pricePaise * p.qty) / 100,
      currency: "INR",
    });
  };

  return (
    <>
      <div id={BUY_BOX_ID}>
        <BuyBox
          productId={productId}
          productName={productName}
          optionLabel={optionLabel}
          variants={variants}
          imageUrl={primaryImageUrl}
          reviewCount={reviewCount}
          reviewAverage={reviewAverage}
          freeShippingThresholdPaise={freeShippingThresholdPaise}
          onPayloadChange={setPayload}
          onAddToCart={addToCart}
          beforeTrust={beforeTrust}
        />
      </div>

      {selectedVariant && payload && (
        <StickyAddToCart
          buyBoxId={BUY_BOX_ID}
          productName={productName}
          mrpPaise={selectedVariant.mrpPaise}
          pricePaise={selectedVariant.pricePaise}
          disabled={!selectedVariant.inStock}
          onAddToCart={() => addToCart(payload)}
        />
      )}
    </>
  );
}
