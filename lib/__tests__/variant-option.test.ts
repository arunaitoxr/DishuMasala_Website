import { describe, expect, it } from "vitest";
import { parseVariantOption } from "@/lib/variant-option";

const BAG = (units: number) => ({ units, perUnits: 1, label: "bag" });

describe("parseVariantOption", () => {
  it("splits 'Name: N tea bags' and reads the count", () => {
    expect(parseVariantOption("Starter Pack: 36 tea bags")).toEqual({ name: "Starter Pack", detail: "36 tea bags", basis: BAG(36) });
  });
  it("splits 'Name (detail)' and reads a teabag count", () => {
    expect(parseVariantOption("Value (72 Teabags)")).toEqual({ name: "Value", detail: "72 Teabags", basis: BAG(72) });
  });
  it("reads a teabag count from the name when the detail is a breakdown", () => {
    expect(parseVariantOption("72 teabags (36 + 36)")).toEqual({ name: "72 teabags", detail: "36 + 36", basis: BAG(72) });
  });
  it("keeps a non-count detail without a basis", () => {
    expect(parseVariantOption("Starter (1 Pack)")).toEqual({ name: "Starter", detail: "1 Pack", basis: null });
  });
  it("keeps a weight option's own wording and derives per-100 g from the total weight", () => {
    expect(parseVariantOption("52 Grams")).toEqual({ name: "52 Grams", detail: null, basis: { units: 52, perUnits: 100, label: "100g" } });
    expect(parseVariantOption("105 Grams").basis?.units).toBe(105);
    expect(parseVariantOption("100 gm").basis?.units).toBe(100);
  });
  it("multiplies 'N gm * K' / 'x K' / '× K' by the pack count", () => {
    for (const v of ["500 gm * 2", "500 gm x2", "500 gm x 2", "500 gm × 2"]) {
      expect(parseVariantOption(v)).toEqual({ name: v, detail: null, basis: { units: 1000, perUnits: 100, label: "100g" } });
    }
    expect(parseVariantOption("500 gm * 1").basis?.units).toBe(500);
  });
  it("treats an unrecognised value as the name only", () => {
    expect(parseVariantOption("Deluxe")).toEqual({ name: "Deluxe", detail: null, basis: null });
  });
});
