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
  it("reads a single weight as a single pack, per 100 g", () => {
    expect(parseVariantOption("100 gm")).toEqual({ name: "Single pack", detail: "100 gm", basis: { units: 100, perUnits: 100, label: "100g" } });
  });
  it("reads 'N gm xK' (with or without spaces) as a pack of K over the total weight", () => {
    const expected = { name: "Pack of 4", detail: "52 gm × 4", basis: { units: 208, perUnits: 100, label: "100g" } };
    expect(parseVariantOption("52 gm x4")).toEqual(expected);
    expect(parseVariantOption("52 gm x 4")).toEqual(expected);
  });
  it("treats an unrecognised value as the name only", () => {
    expect(parseVariantOption("Deluxe")).toEqual({ name: "Deluxe", detail: null, basis: null });
  });
});
