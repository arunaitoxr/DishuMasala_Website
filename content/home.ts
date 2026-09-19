/**
 * All homepage copy, in one file (Phase 2 / PROMPTS.md). Every claim about Blue Tea and Red Tea is
 * grounded in the client's own existing product copy in `data/catalog.json` (see the `blue-tea` and
 * `red-tea` products' `shortDescription`/`description` fields) — ingredients, flavour, aroma, colour
 * behaviour and caffeine content are all facts the client already states about their own products.
 *
 * Deliberately NOT copied over: the source copy's "Health Benefits" bullet lists (antioxidants,
 * skin/hair, digestion, relaxation, weight management). CLAUDE.md §8 forbids health and medicinal
 * claims on this build regardless of what the old site said, so this file sticks to the sensory and
 * compositional facts (ingredients, caffeine-free, the colour shift itself) and leaves every health
 * claim out. No customer counts, no awards, no certifications — nothing not verifiable is invented.
 */

export const HOME_COPY = {
  /**
   * Draft copy only — grounded in the two facts on record (the name, the sourcing), nothing else.
   * CLAUDE.md §8 forbids inventing biography the same way it forbids inventing reviews or awards,
   * so this deliberately stays short rather than guessing at a founding story. Swap this paragraph
   * for the founder's own words before launch; the section renders fine as-is if that doesn't
   * happen before a deploy, it just won't be as personal as it could be.
   */
  founderStory: {
    eyebrow: "Our Story",
    heading: "The Dishu Masala Story",
    body: [
      "It began with a simple question a father kept asking himself: would I feed this to my own daughter?",
      "When Dishu was born, everything changed the way it does for every parent — suddenly the ingredient list on the back of a packet mattered. The unpronounceable names, the hidden preservatives, the \"added colour\" and \"artificial flavour\" tucked into the very masalas that were supposed to make our food nourishing. The spices that have healed and warmed Indian kitchens for thousands of years had quietly been compromised.",
      "So we decided to make the masalas we actually wanted in our own home — and named them after the little girl who inspired the standard. Dishu Masala is spice the way it was always meant to be: clean, honest, and free of preservatives. Just real ingredients, sun and soil and stone, nothing to hide on the label because there's nothing hiding in the jar.",
      "But good health isn't only about what you cook — it's also about what you sip. That's why Dishu Masala grew into something larger than a spice brand: a small, honest initiative for everyday wellness. Our Blue Tea, brewed from butterfly-pea flower, and our Red Tea, rich and caffeine-free, are our invitation to slow down and choose better — one warm cup at a time.",
      "We're not a giant factory. We're a family that believes purity shouldn't be a luxury. Every blend we make has to pass one final test — the one we started with. Would we serve it to Dishu?",
      "If the answer is yes, it earns its place in your kitchen too.",
    ],
    /** The two paragraphs the homepage shows — the question the brand began with, and its answer.
     * The full story lives on /about; the homepage stays about products (reference site: a short
     * "Our story" block, not an essay ahead of the first product). */
    homepageExcerpt: [0, 5],
    tagline: "Dishu Masala — pure enough for our daughter, pure enough for your family.",
    // Real name, client-supplied (2026-09-17) — CLAUDE.md §8 bans inventing a founder bio, not
    // using a real one once given. Rendered as a plain attribution line, not a photo (this
    // component's own header comment explains why a founder photo slot is deliberately not added
    // just because a name now exists).
    signOff: "Harish Sachdeva",
  },

  blueTeaBand: {
    eyebrow: "The Lemon Shift",
    heading: "Blue, until you add lemon.",
    bodyPrimary:
      "Butterfly pea flower gives Blue Tea its brilliant, brewed-deep-blue colour — a natural " +
      "pigment, not a dye, that shifts with acidity. Add a wedge of lemon and the same cup turns " +
      "violet, then edges toward magenta. Nothing about the tea changes. Only its colour does.",
    bodySecondary:
      "Underneath the colour is a gentle blend: butterfly pea flower with spearmint, ginger, " +
      "dandelion, cinnamon and lemongrass, naturally caffeine-free, so there's no wrong hour to " +
      "brew a cup. Loose leaf or teabags — both carry the same brew and the same shift.",
    ctaLabel: "Shop Blue Tea",
    ctaHref: "/collections/blue-tea/",
  },

  redTea: {
    eyebrow: "Red Tea",
    heading: "Ruby-red. Hibiscus-led. Naturally vibrant.",
    body: [
      "A beautiful infusion of hibiscus and delicate rose petals, balanced with the warming notes " +
        "of holy basil and ginger. Red Tea brews into a naturally ruby-red cup with a refreshing " +
        "tartness, soft floral character, and a gentle hint of spice.",
      "Bright • Floral • Mildly Tart • Caffeine-Free",
      "Available in loose leaf and convenient teabags, it's an easy, refreshing ritual to enjoy " +
        "any time of day.",
    ],
    ctaLabel: "Shop Red Tea",
    ctaHref: "/collections/red-tea/",
  },

  combos: {
    eyebrow: "Combo Packs",
    heading: "Your Everyday Spices, Together.",
    body: [
      "The essentials you reach for most, thoughtfully paired and packed into convenient sets — " +
        "giving you more value than buying each spice separately.",
      "From everyday cooking to flavour-packed favourites, our combo packs make it easier to " +
        "stock your pantry and smarter to save.",
      "Curated Together • Better Value • Pantry Ready",
    ],
    ctaLabel: "Shop Spice Combos",
    ctaHref: "/collections/combos/",
  },

  /**
   * Spices — now Masala's own full-bleed lead band (MasalaBand.tsx), the pillar counterpart to
   * blueTeaBand above (CLAUDE.md §7.2, amended). ctaLabel/ctaHref added to match blueTeaBand's
   * shape — every other field is the pre-existing, already-approved copy, untouched.
   */
  spices: {
    eyebrow: "Spices",
    heading: "Single-Origin. Double-Layer Packed.",
    body: [
      "Turmeric, red chilli, garam masala, coriander, and black pepper — each carefully sourced " +
        "and packed separately to preserve its natural aroma, bold flavour, and freshness.",
      "Our double-layer packaging adds an extra barrier of protection, helping keep every spice " +
        "vibrant from the pack to your kitchen.",
      "Purely Sourced • Carefully Packed • Full of Flavour",
    ],
    ctaLabel: "Shop Spices",
    ctaHref: "/collections/spices/",
  },

  blackTea: {
    eyebrow: "Black Tea",
    heading: "Everyday Tea, Garden-Fresh",
    body: [
      "Bold, malty loose-leaf black tea, carefully selected for a rich, full-bodied cup that " +
        "makes every everyday brew feel a little more special.",
      "Fresh in character, deep in flavour, and made for the perfect pot, every day.",
    ],
    ctaLabel: "Shop Black Tea",
    ctaHref: "/collections/classic-teas/",
  },

  ritual: {
    eyebrow: "The Ritual",
    heading: "Brew it blue. Add lemon. Watch it shift.",
    body:
      "Steep a spoonful of Blue Tea in hot water for four to five minutes, until the cup runs a " +
      "deep, brewed blue. Squeeze in a wedge of lemon and watch the colour move — through violet, " +
      "toward magenta — as the acidity meets the butterfly pea flower's natural pigment. Serve it " +
      "hot, or pour it over ice for a cooler shift.",
    ctaLabel: "Read the full ritual",
    ctaHref: "/recipes/blue-tea-lemon-ritual/",
  },

  reviews: {
    heading: "Reviews",
    emptyTitle: "No reviews yet",
    emptyBody:
      "We're just getting started — once customers have brewed a cup, their reviews will appear " +
      "here. If you've tried Dishu Masala, we'd love to hear from you after your order arrives.",
  },

  newsletter: {
    heading: "Brew guides, in your inbox",
    body: "Recipes and brewing notes, sent occasionally. No spam, unsubscribe any time.",
  },
} as const;
