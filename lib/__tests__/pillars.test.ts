import { describe, expect, it } from "vitest";
import { pillarsOf } from "@/lib/pillars";

describe("pillarsOf", () => {
  it("returns the pillar itself for a pillar collection", () => {
    expect(pillarsOf("blue-tea")).toEqual(["blue-tea"]);
    expect(pillarsOf("classic-teas", "classic-tea-250gm")).toEqual(["classic-teas"]);
  });
  it("treats every spice combo as spices", () => {
    expect(pillarsOf("combos", "turmeric-red-chilli")).toEqual(["spices"]);
  });
  it("reads which teas a tea combo contains from its slug", () => {
    expect(pillarsOf("tea-combos", "blue-tea-red-tea-teabags-combo")).toEqual(["blue-tea", "red-tea"]);
    expect(pillarsOf("tea-combos", "blue-tea-red-tea-loose-combo")).toEqual(["blue-tea", "red-tea"]);
    expect(pillarsOf("tea-combos", "blue-tea-twin-pack")).toEqual(["blue-tea"]);
    expect(pillarsOf("tea-combos", "red-tea-twin-pack")).toEqual(["red-tea"]);
  });
  it("returns nothing for an unknown collection or a tea combo with no slug", () => {
    expect(pillarsOf("gifting", "x")).toEqual([]);
    expect(pillarsOf("tea-combos")).toEqual([]);
  });
});
