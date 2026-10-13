import { describe, expect, it } from "vitest";
import { dealShelf, dealsFor } from "@/lib/deals";

describe("dealsFor", () => {
  const none = new Set<string>();

  it("follows the client's table for each purchase, in order", () => {
    expect(dealsFor(["blue-tea"], none)).toEqual(["red-tea", "spices", "classic-teas"]);
    expect(dealsFor(["red-tea"], none)).toEqual(["blue-tea", "spices", "classic-teas"]);
    expect(dealsFor(["classic-teas"], none)).toEqual(["blue-tea", "spices", "red-tea"]);
    expect(dealsFor(["spices"], none)).toEqual(["blue-tea", "red-tea", "classic-teas"]);
  });

  it("leaves out categories already in the cart", () => {
    expect(dealsFor(["blue-tea"], new Set(["blue-tea", "spices"]))).toEqual(["red-tea", "classic-teas"]);
  });

  it("offers nothing for a non-pillar purchase or when everything is in the cart", () => {
    expect(dealsFor([], none)).toEqual([]);
    expect(dealsFor(["blue-tea"], new Set(["red-tea", "spices", "classic-teas"]))).toEqual([]);
  });

  it("merges the offers for a combo that counts as several pillars, minus what's in the cart", () => {
    // A Blue + Red tea combo already has both teas in the cart, so only spices and black tea are left.
    expect(dealsFor(["blue-tea", "red-tea"], new Set(["blue-tea", "red-tea"]))).toEqual(["spices", "classic-teas"]);
    // A spice combo counts as spices.
    expect(dealsFor(["spices"], new Set(["spices"]))).toEqual(["blue-tea", "red-tea", "classic-teas"]);
  });
});

describe("dealShelf", () => {
  // Fisher–Yates with a rand this close to 1 swaps nothing, so each pillar keeps catalogue order.
  const keepOrder = () => 0.999999;
  const byPillar = new Map([
    ["blue-tea", [{ productId: 1 }, { productId: 2 }]],
    ["red-tea", [{ productId: 3 }, { productId: 4 }]],
    ["classic-teas", [{ productId: 5 }]],
    ["spices", [{ productId: 6 }, { productId: 7 }, { productId: 8 }]],
  ]);
  const ids = (items: { productId: number }[]) => items.map((p) => p.productId);

  it("leads with one product of each recommended pillar in turn, then every other product", () => {
    // Blue Tea (1) just added: Red Tea, Spices and Black Tea lead; the other Blue Tea (2) comes last.
    const shelf = dealShelf(["blue-tea"], { pillars: new Set(["blue-tea"]), productIds: new Set([1]) }, byPillar, keepOrder);
    expect(ids(shelf)).toEqual([3, 6, 5, 4, 7, 8, 2]);
  });

  it("leaves out products already in the cart, but not the rest of their pillar", () => {
    const inCart = { pillars: new Set(["blue-tea", "spices"]), productIds: new Set([1, 6]) };
    expect(ids(dealShelf(["blue-tea"], inCart, byPillar, keepOrder))).toEqual([3, 5, 4, 2, 7, 8]);
  });

  it("is empty once every product is in the cart", () => {
    const all = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
    const inCart = { pillars: new Set(["blue-tea", "red-tea", "classic-teas", "spices"]), productIds: all };
    expect(dealShelf(["spices"], inCart, byPillar, keepOrder)).toEqual([]);
  });
});
