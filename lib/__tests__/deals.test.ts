import { describe, expect, it } from "vitest";
import { dealsFor } from "@/lib/deals";

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
