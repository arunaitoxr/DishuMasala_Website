import { describe, expect, it } from "vitest";
import { parsePlainDescription, parseProductDescription, parseWellnessBenefits } from "../parse-description";

const BLUE_TEA_DESCRIPTION = `Blue Tea is a naturally caffeine-free herbal tea made from premium Butterfly Pea Flowers. Renowned for its vibrant deep blue colour, delicate floral taste, and wellness benefits, it offers a refreshing and soothing tea experience. It can also change colour to purple when lemon is added, making it both visually appealing and enjoyable.

Key Characteristics:

Flavor: Mild, earthy, and subtly floral with a smooth finish.
Aroma: Light, fresh, and naturally floral.
Ingredients: Butterfly Pea Flower, Spearmint, Ginger, Dandelion, Cinnamon & Lemongrass.
Color: Deep blue infusion that turns purple with lemon.

Culinary Uses:

Herbal Tea: Enjoy hot or iced as a refreshing caffeine-free beverage.
Mocktails & Cocktails: Adds a stunning natural blue hue to drinks.

Health Benefits:

Rich in Antioxidants: Helps protect the body from free radical damage.
Naturally Caffeine-Free: A perfect tea to enjoy any time of the day.

Storage:

Store in an airtight container in a cool, dry place away from direct sunlight.
Keep the pack tightly sealed after every use to maintain freshness, aroma, and colour.`;

describe("parseProductDescription", () => {
  it("extracts Key Characteristics with the Ingredients line stripped out", () => {
    const { keyCharacteristics } = parseProductDescription(BLUE_TEA_DESCRIPTION);
    expect(keyCharacteristics).toContain("Flavor: Mild, earthy");
    expect(keyCharacteristics).toContain("Color: Deep blue infusion");
    expect(keyCharacteristics).not.toContain("Ingredients:");
  });

  it("extracts the ingredients list from Key Characteristics' own Ingredients line", () => {
    const { ingredients } = parseProductDescription(BLUE_TEA_DESCRIPTION);
    expect(ingredients).toBe("Butterfly Pea Flower, Spearmint, Ginger, Dandelion, Cinnamon & Lemongrass.");
  });

  it("maps Culinary Uses to howToUse", () => {
    const { howToUse } = parseProductDescription(BLUE_TEA_DESCRIPTION);
    expect(howToUse).toContain("Herbal Tea: Enjoy hot or iced");
  });

  it("never surfaces Health Benefits content anywhere in its output", () => {
    const parsed = parseProductDescription(BLUE_TEA_DESCRIPTION);
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toContain("Rich in Antioxidants");
    expect(serialized).not.toContain("free radical");
  });

  it("degrades to all-null for a product description with no structured sections", () => {
    const parsed = parseProductDescription("Just a plain sentence, no sections at all.");
    expect(parsed.keyCharacteristics).toBeNull();
    expect(parsed.ingredients).toBeNull();
    expect(parsed.howToUse).toBeNull();
    expect(parsed.intro).toBe("Just a plain sentence, no sections at all.");
  });

  it("handles a null description without throwing", () => {
    expect(parseProductDescription(null)).toEqual({
      intro: null,
      keyCharacteristics: null,
      ingredients: null,
      howToUse: null,
    });
  });
});

describe("parseWellnessBenefits", () => {
  const COPY = [
    "Dishu Masala Blue Tea is a potent blend of Butterfly Pea, Lemongrass, Ginger, and Spearmint that boosts metabolism, burns fat, reduces bloating, and aids digestion for a healthier, slimmer you!",
    "Promotes weight loss",
    "Reduces cravings & Boosts metabolism",
    "Improves digestive health",
    "Flushes out toxins",
    "Caffeine-free & keto-friendly",
    "Kickstart your fat loss journey by sipping on Dishu Masala Blue Tea 3 times a day, and pair it with a balanced diet for best results!",
  ].join("\n");

  it("splits intro, benefit lines and closing note, keeping the words as written", () => {
    const w = parseWellnessBenefits(COPY);
    expect(w.intro).toMatch(/^Dishu Masala Blue Tea is a potent blend/);
    expect(w.benefits).toEqual([
      "Promotes weight loss",
      "Reduces cravings & Boosts metabolism",
      "Improves digestive health",
      "Flushes out toxins",
      "Caffeine-free & keto-friendly",
    ]);
    expect(w.note).toMatch(/^Kickstart your fat loss journey/);
  });

  it("strips leading bullet characters from benefit lines", () => {
    const w = parseWellnessBenefits("• Regulates blood pressure\n- Improves immunity\n* Supports heart health");
    expect(w.benefits).toEqual(["Regulates blood pressure", "Improves immunity", "Supports heart health"]);
  });

  it("treats a block of only short lines as all benefits", () => {
    expect(parseWellnessBenefits("Calming\nCaffeine-free")).toEqual({ intro: null, benefits: ["Calming", "Caffeine-free"], note: null });
  });
});

describe("parsePlainDescription", () => {
  it("splits paragraphs and turns the 'Perfect for' line into tags", () => {
    const d = parsePlainDescription("First paragraph.\n\nSecond paragraph.\n\nPerfect for: Curries • Gravies • Everyday Cooking");
    expect(d.paragraphs).toEqual(["First paragraph.", "Second paragraph."]);
    expect(d.perfectFor).toEqual(["Curries", "Gravies", "Everyday Cooking"]);
  });
  it("handles a description with no 'Perfect for' line, and null", () => {
    expect(parsePlainDescription("Just one paragraph.")).toEqual({ paragraphs: ["Just one paragraph."], perfectFor: [] });
    expect(parsePlainDescription(null)).toEqual({ paragraphs: [], perfectFor: [] });
  });
});
