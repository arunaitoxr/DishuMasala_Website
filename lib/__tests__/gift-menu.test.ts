import { describe, expect, it } from "vitest";
import { pickGiftMenu } from "@/lib/gift-menu";

const opt = (pillar: string, id: string) => ({ pillar, id, inStock: true });
const OPTIONS = [
  opt("red-tea", "red20"),
  opt("blue-tea", "blue20"),
  opt("classic-teas", "classic100"),
  opt("classic-teas", "assam100"),
  opt("spices", "coriander"),
  opt("spices", "turmeric"),
  opt("spices", "chilli"),
];
const ids = (m: { id: string }[]) => m.map((o) => o.id);

describe("pickGiftMenu", () => {
  it("offers one from each open pillar, in order, when a single pillar is in the cart", () => {
    const menu = pickGiftMenu(OPTIONS, new Set(["red-tea"]), 1);
    expect(menu.map((o) => o.pillar)).toEqual(["blue-tea", "classic-teas", "spices"]);
  });

  it("offers three different spices when Red, Blue and Black Tea are all in the cart", () => {
    const menu = pickGiftMenu(OPTIONS, new Set(["red-tea", "blue-tea", "classic-teas"]), 7);
    expect(ids(menu).sort()).toEqual(["chilli", "coriander", "turmeric"]);
  });

  it("fills spare slots from the open pillars (Blue + Red combo → black tea, spice, then another)", () => {
    const menu = pickGiftMenu(OPTIONS, new Set(["blue-tea", "red-tea"]), 3);
    expect(menu).toHaveLength(3);
    expect(menu.every((o) => o.pillar === "classic-teas" || o.pillar === "spices")).toBe(true);
    expect(new Set(ids(menu)).size).toBe(3);
  });

  it("varies the spice from one opening (seed) to the next, but is stable for the same seed", () => {
    const spiceFor = (seed: number) => pickGiftMenu(OPTIONS, new Set(["red-tea", "blue-tea", "classic-teas"]), seed)[0].id;
    expect(spiceFor(11)).toBe(spiceFor(11));
    const seen = new Set(Array.from({ length: 40 }, (_, s) => spiceFor(s)));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("shows three of the four pillars when every pillar is in the cart", () => {
    const menu = pickGiftMenu(OPTIONS, new Set(["red-tea", "blue-tea", "classic-teas", "spices"]), 5);
    expect(menu).toHaveLength(3);
    expect(new Set(menu.map((o) => o.pillar)).size).toBe(3);
  });

  it("skips out-of-stock gifts", () => {
    const menu = pickGiftMenu([...OPTIONS.filter((o) => o.pillar !== "spices"), { pillar: "spices", id: "x", inStock: false }], new Set(["red-tea"]), 1);
    expect(menu.some((o) => o.pillar === "spices")).toBe(false);
  });
});
