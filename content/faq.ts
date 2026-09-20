/**
 * FAQ content per collection page (client request: "FAQ for all the pages... make it very good and
 * SEO rich"). Every answer is grounded in real facts already established elsewhere in this
 * project — `data/catalog.json`'s own ingredient/format lists, CLAUDE.md §8's four verifiable trust
 * claims, and real product variant data — never an invented certification, health claim, return
 * window, or number (CLAUDE.md §8's "invent nothing" rule applies to this content exactly like
 * every other page). Where the client hasn't supplied a fact (e.g. a specific shelf-life duration),
 * this file simply doesn't ask that question rather than answering it with a guess.
 *
 * Shipping/COD facts are intentionally NOT hardcoded here even though they're shared across every
 * collection — the free-shipping threshold comes from `settings` at render time
 * (`buildSharedCommerceFaqs`), never a literal ₹500 baked into content.
 */

export interface FaqItem {
  question: string;
  answer: string;
}

export const COLLECTION_FAQS: Record<string, FaqItem[]> = {
  general: [
    {
      question: "What does Dishu Masala sell?",
      answer:
        "Herbal teas — Blue Tea and Red Tea — alongside Classic and Premium Assam black teas, a range of ground spices, and combo packs that pair our most popular spices together.",
    },
    {
      question: "Which of your teas are caffeine-free?",
      answer:
        "Blue Tea and Red Tea are both naturally caffeine-free herbal infusions. Classic Tea and Premium Assam Tea are traditional black teas and do contain caffeine.",
    },
    {
      question: "Where are your spices sourced from?",
      answer: "Our spices are sourced from the best specified areas to maintain quality and aroma.",
    },
    {
      question: "How should I store my order?",
      answer:
        "Keep teas and spices in an airtight container in a cool, dry place away from direct sunlight, and reseal the pack tightly after every use.",
    },
  ],
  "blue-tea": [
    {
      question: "What is Blue Tea made of?",
      answer:
        "Blue Tea is a herbal infusion of butterfly pea flower, spearmint, ginger, dandelion, cinnamon and lemongrass.",
    },
    {
      question: "Is Blue Tea caffeine-free?",
      answer: "Yes — Blue Tea is naturally caffeine-free, so it's suitable any time of day.",
    },
    {
      question: "Why does Blue Tea change colour when you add lemon?",
      answer:
        "Butterfly pea flower carries a natural blue pigment that shifts toward violet and magenta when it meets an acid, like a squeeze of lemon — a real, visible reaction, not a dye or an additive.",
    },
    {
      question: "What's the difference between the loose leaf and teabag options?",
      answer:
        "Same blend, two formats: loose leaf comes in 52 gm or 105 gm pouches, and teabags come as a 36-count box — pick whichever brewing style suits you.",
    },
    {
      question: "How should I store Blue Tea?",
      answer:
        "Keep it in an airtight container in a cool, dry place away from direct sunlight, and reseal the pack tightly after every use to preserve its colour and aroma.",
    },
  ],
  "red-tea": [
    {
      question: "What is Red Tea made from?",
      answer: "Red Tea is a herbal blend of hibiscus, rose petals, holy basil (tulsi) and ginger extracts.",
    },
    {
      question: "Is Red Tea caffeine-free?",
      answer: "Yes, Red Tea is naturally caffeine-free.",
    },
    {
      question: "What does Red Tea taste like?",
      answer:
        "A mildly tart, floral cup with a gentle hint of spice — it brews into a naturally ruby-red colour from the hibiscus and rose.",
    },
    {
      question: "Loose leaf or teabags — what's the difference?",
      answer:
        "The same blend either way: loose leaf comes in 52 gm or 105 gm pouches, and teabags come as a 36-count box.",
    },
    {
      question: "How should I store Red Tea?",
      answer: "In an airtight container, away from direct sunlight and moisture, resealed after every use.",
    },
  ],
  "classic-teas": [
    {
      question: "What's the difference between Classic Tea and Premium Assam Tea?",
      answer:
        "Classic Tea is a straightforward blend of natural tea leaves. Premium Assam Tea is sourced specifically from Assam's tea gardens and includes ginger, tulsi, mulethi and cardamom for a spiced, more layered cup.",
    },
    {
      question: "Does Black Tea contain caffeine?",
      answer:
        "Yes — unlike our herbal Blue Tea and Red Tea, Classic Tea and Premium Assam Tea are traditional black teas and do contain caffeine.",
    },
    {
      question: "What pack sizes are available?",
      answer: "Both Classic Tea and Premium Assam Tea are available in 250 gm and 500 gm packs.",
    },
    {
      question: "How do I brew it?",
      answer:
        "Works well as a classic milk tea, a spiced masala chai, black tea on its own, or brewed and chilled for iced tea.",
    },
    {
      question: "How should I store it?",
      answer: "In an airtight container in a cool, dry place away from moisture and direct sunlight.",
    },
  ],
  spices: [
    {
      question: "Which spices does Dishu Masala offer?",
      answer: "Turmeric, red chilli, garam masala, coriander and black pepper powders.",
    },
    {
      question: "How are Dishu Masala spices packaged?",
      answer: "In double-layer packaging, which helps keep every spice's flavour and aroma intact for longer.",
    },
    {
      question: "Where are the spices sourced from?",
      answer: "Our spices are sourced from the best specified areas to maintain quality and aroma.",
    },
    {
      question: "What pack sizes are available?",
      answer:
        "Most spices come in 100 gm and 200 gm packs; Black Pepper Powder is currently available in 100 gm only.",
    },
    {
      question: "How should I store the spices?",
      answer:
        "In an airtight container in a cool, dry place away from moisture and direct sunlight — always use a dry spoon to keep them fresh.",
    },
  ],
  combos: [
    {
      question: "What's included in a combo pack?",
      answer:
        "Each combo pairs 2 or 3 of our most popular single spices into one pack — the exact spices and weights are listed on each combo's own product page.",
    },
    {
      question: "Do combo packs cost less than buying the spices separately?",
      answer:
        "Yes — each combo shows a real \"Save ₹X vs. separately\" figure, computed from the current price of buying the same spices on their own, not a flat marketing discount.",
    },
    {
      question: "What sizes do combo packs come in?",
      answer:
        "It varies by pack — options include 100 gm × 2, 100 gm × 3, and 200 gm × 2 or × 3, depending on which spices are paired together.",
    },
    {
      question: "How are combo packs packaged?",
      answer: "Each spice inside a combo keeps the same double-layer packaging used across our single spices.",
    },
  ],
};

/** Shipping facts, shared across every collection — built with the LIVE free-shipping
 * threshold (never a hardcoded ₹500), so this is a function, not a static array. */
export function buildSharedCommerceFaqs(freeShippingLabel: string): FaqItem[] {
  return [
    {
      question: "Do you offer free shipping?",
      answer: `Yes — orders over ${freeShippingLabel} ship free.`,
    },
    {
      question: "Are your prices inclusive of tax?",
      answer: "Yes — every price shown is GST-inclusive; there's nothing added at checkout.",
    },
  ];
}
