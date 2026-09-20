/**
 * One-time content seed (PROMPTS.md Phase 8 items 7–8): the four policy pages and the flagship
 * Blue Tea + lemon recipe, written directly as Tiptap JSON and inserted with `scriptDb` — the same
 * shape of operation app/admin/content/actions.ts's createPageDb/createPostDb/publishPageDb/
 * publishPostDb perform, just run here as a standalone script (like scripts/seed.ts) rather than
 * through the "server-only"-guarded app mutation modules, which can't be imported from a plain tsx
 * process (see lib/db/script-client.ts's own comment on exactly this constraint).
 *
 * Idempotent — upserts on `pages.slug` / `posts.slug`, safe to re-run.
 *
 * CONTENT DISCIPLINE (CLAUDE.md §8 / this phase's brief — "invent nothing"):
 * - The policy pages state ONLY verifiable facts already established elsewhere in this project:
 *   free shipping over ₹500 (settings.free_shipping_threshold_paise), GST-
 *   inclusive pricing, the real business name "Dishu Food and Beverages", the real Sangrur,
 *   Punjab address and +91 77102 19958 phone (both already used in the Phase 1 footer). GSTIN and
 *   the street address/pincode/email are rendered as the honest "to be confirmed" placeholders
 *   they actually are in `settings` (scripts/seed.ts) — never a fabricated GSTIN or return
 *   window. There is no stated return/refund window or named grievance officer anywhere in
 *   CLAUDE.md/PRD.md, so none is invented here; the refund page says so plainly and points to the
 *   real contact channel instead.
 * - The flagship recipe's every factual claim (ingredients, flavour, aroma, the blue-to-purple
 *   colour change, brewing method, storage) is taken directly from data/catalog.json's own Blue
 *   Tea product copy (read fresh for this script, not from memory) — no health/medicinal claims,
 *   matching the same discipline content/home.ts (Phase 2) and Details.tsx (Phase 4) already
 *   apply by deliberately excluding the source copy's "Health Benefits" section.
 *
 * Run with: pnpm tsx --env-file-if-exists=.env scripts/seed-content.ts
 */
import { closeScriptDb, eq, scriptDb } from "../lib/db/script-client";
import { pages, posts } from "../lib/db/schema";
import type { TiptapDoc, TiptapElementNode, TiptapTextNode } from "../lib/content/tiptap-schema";

function p(text: string): TiptapElementNode {
  return { type: "paragraph", content: [{ type: "text", text } satisfies TiptapTextNode] };
}
function h(level: number, text: string): TiptapElementNode {
  return { type: "heading", attrs: { level }, content: [{ type: "text", text } satisfies TiptapTextNode] };
}
function ul(items: string[]): TiptapElementNode {
  return { type: "bulletList", content: items.map((t): TiptapElementNode => ({ type: "listItem", content: [p(t)] })) };
}
function ol(items: string[]): TiptapElementNode {
  return { type: "orderedList", content: items.map((t): TiptapElementNode => ({ type: "listItem", content: [p(t)] })) };
}

const SELLER_BLOCK = [
  h(2, "Seller identity"),
  p("Dishu Food and Beverages, Sangrur, Punjab, India."),
  p("Phone: +91 77102 19958"),
  p("GSTIN: to be confirmed — this page will be updated with the registered GSTIN once supplied."),
  p("Registered address: to be confirmed."),
];

const GRIEVANCE_BLOCK = [
  h(2, "Questions or concerns"),
  p("For any question about this policy, an order, or a complaint, call +91 77102 19958. There is no separate grievance officer or email on file yet — this phone line is the real, current contact channel and handles it directly."),
];

// ---------------------------------------------------------------------------------------------
// Policy pages
// ---------------------------------------------------------------------------------------------

const shippingPolicy: TiptapDoc = {
  type: "doc",
  content: [
    p("This page explains how orders from Dishu Food and Beverages are shipped."),
    h(2, "Free shipping"),
    p("Orders over ₹500 ship free. Orders below that qualify for standard shipping at the rate shown at checkout."),
    h(2, "Delivery estimates"),
    p("An estimated delivery window is shown on the product page and at checkout once you enter your pincode. This is an estimate, not a guarantee, and can vary with courier load, weather, and location."),
    h(2, "Packaging"),
    p("Every order ships in double-layer packaging to protect the product in transit."),
    h(2, "Tracking"),
    p("Once an order is dispatched, a tracking link is sent by email so you can follow it to delivery."),
    ...SELLER_BLOCK,
    ...GRIEVANCE_BLOCK,
  ],
};

const refundPolicy: TiptapDoc = {
  type: "doc",
  content: [
    p("This page explains how refunds and cancellations work for orders from Dishu Food and Beverages."),
    h(2, "Cancellations"),
    p("An order can be cancelled before it is dispatched. Once dispatched, it can no longer be cancelled — contact us and we will do what we can."),
    h(2, "Returns and refunds"),
    p("Full return and refund terms — including the exact return window and condition requirements — are being finalised and are not yet published here. If you need to return or report a problem with an order, contact us directly using the details below and we will work it out with you individually in the meantime."),
    h(2, "Damaged or incorrect items"),
    p("If an order arrives damaged or incorrect, contact us with your order number and photos of the item as received, and we will sort out a resolution."),
    h(2, "Refund method"),
    p("Where a refund is agreed, it is issued back to the original payment method. Processing time is not yet finalised — we will confirm it when we confirm the refund."),
    ...SELLER_BLOCK,
    ...GRIEVANCE_BLOCK,
  ],
};

const privacyPolicy: TiptapDoc = {
  type: "doc",
  content: [
    p("This page explains what information Dishu Food and Beverages collects when you use this site and place an order, and how it is used."),
    h(2, "What we collect"),
    ul([
      "Account details you provide: name, email, phone number, password (stored as a salted Argon2id hash — never in plain text).",
      "Order details: shipping and billing address, phone, email, items ordered, and payment status (payment card/UPI details themselves are handled by our payment processor, Razorpay, and never stored on our own servers).",
      "Reviews you submit: your name, email, rating, review text, and any photos you attach.",
    ]),
    h(2, "How we use it"),
    ul([
      "To process and deliver your order, including sharing your name, address and phone with our shipping partner, Shiprocket, solely to deliver that order.",
      "To send order-related email (confirmation, shipping, delivery) via our email provider, Resend.",
      "To process payment via Razorpay.",
      "To respond if you contact us.",
    ]),
    h(2, "What we don't do"),
    p("We do not sell your personal information to third parties."),
    h(2, "Marketing communications and on-site activity"),
    ul([
      "If you submit your phone number through a pop-up on this site, we store it only after you actively check a consent box, and use it solely to send you WhatsApp or SMS messages about offers and updates. We never assume consent from browsing alone.",
      "We use a first-party cookie to recognise your browser and record which pages and products you view on this site. This is kept on our own servers only and used solely to decide what to message you about, if you have separately given phone consent as above.",
      "Separately, this site uses the Meta (Facebook/Instagram) Pixel, which shares some browsing and purchase activity with Meta so we can measure and target advertising on Facebook and Instagram. This is standard, third-party ad-platform tracking — different from the first-party cookie above, and not something we can selectively turn off per visitor. You can control it through your own browser or ad-blocking settings, or through your Meta account's ad preferences.",
      "You can ask us to stop contacting you, or to delete a phone number and its associated browsing record, at any time using the contact details below.",
    ]),
    h(2, "Your account"),
    p("You can view and update your saved addresses, name and phone number from your account at any time. Contact us to request deletion of your account."),
    ...SELLER_BLOCK,
    ...GRIEVANCE_BLOCK,
  ],
};

const termsOfService: TiptapDoc = {
  type: "doc",
  content: [
    p("These terms apply to any purchase made from Dishu Food and Beverages through this website."),
    h(2, "Pricing"),
    p("All prices shown are inclusive of GST unless stated otherwise. Prices, discounts and availability can change without notice; the price charged is the price shown at checkout at the time your order is placed."),
    h(2, "Orders"),
    p("Placing an order is an offer to buy, which we accept once your order is confirmed (once payment is captured). We reserve the right to cancel an order that cannot genuinely be fulfilled, in which case any payment taken is refunded."),
    h(2, "Payment"),
    p("All orders are prepaid and processed through Razorpay."),
    h(2, "Shipping and returns"),
    p("See the Shipping Policy and Refund & Cancellation Policy pages for current terms."),
    h(2, "Product information"),
    p("We describe our products as accurately as we can. Actual packaging and appearance may vary slightly from photos."),
    ...SELLER_BLOCK,
    ...GRIEVANCE_BLOCK,
  ],
};

// ---------------------------------------------------------------------------------------------
// Flagship recipe: the Blue Tea + lemon colour ritual
// ---------------------------------------------------------------------------------------------
// Every factual line below is grounded in data/catalog.json's own Blue Tea product copy (both the
// teabag and loose listings): ingredients (Butterfly Pea Flower, Spearmint, Ginger, Dandelion,
// Cinnamon & Lemongrass), "naturally caffeine-free", flavour "mild, floral, and slightly earthy",
// aroma "fresh and naturally floral", colour "deep blue infusion that turns purple when mixed with
// lemon", enjoyed "hot or iced", and the storage instructions. No health/medicinal claim from the
// source copy's "Health Benefits" section is repeated here — same exclusion Phase 2 and Phase 4
// already apply.

const blueTeaRitual: TiptapDoc = {
  type: "doc",
  content: [
    p("Butterfly Pea Flower gives Blue Tea its brilliant blue colour — and that colour is not fixed. Add a few drops of lemon and, in front of you, the brew shifts from deep blue toward violet and then magenta. This is the Lemon Shift, and it's the easiest piece of theatre in the kitchen."),
    h(2, "What's in the cup"),
    p("Dishu's Blue Tea is a naturally caffeine-free herbal infusion of Butterfly Pea Flower, Spearmint, Ginger, Dandelion, Cinnamon and Lemongrass. The flavour is mild, floral and slightly earthy, with a fresh, naturally floral aroma — closer to a delicate herbal tisane than a bitter tea."),
    h(2, "How to brew it"),
    ol([
      "Bring water just off the boil (not a hard rolling boil) — around 90°C is enough to draw out the colour without scorching the flowers.",
      "Steep one Blue Tea teabag, or a spoonful of the loose blend, for 4–5 minutes in a clear glass or cup so you can watch the colour develop.",
      "Remove the teabag or strain the loose leaves. You now have a deep blue infusion.",
    ]),
    h(2, "The colour-change ritual"),
    p("This is the part worth doing slowly, and in front of someone. Add lemon juice a few drops at a time, stirring gently after each addition, and watch the brew move: blue, then violet, then magenta — the more lemon, the further the shift goes. There's no fixed amount; stop wherever the colour looks right to you."),
    p("Serve it hot as is, or pour it over ice for an iced version — the colour shift works the same way either way."),
    h(2, "Beyond the cup"),
    p("The same blue infusion is also used, cooled, as a natural colourant — a splash in a mocktail or lemonade turns it a striking blue, and the same lemon trick shifts that drink's colour too. It also works as a natural food colouring for rice, desserts and jellies."),
    h(2, "Storing your Blue Tea"),
    p("Keep it in an airtight container, in a cool, dry place away from direct sunlight, and reseal the pack tightly after every use — that's what keeps the colour and aroma intact for the next brew."),
  ],
};

async function upsertPage(slug: string, title: string, body: TiptapDoc): Promise<void> {
  const existing = await scriptDb.select({ id: pages.id }).from(pages).where(eq(pages.slug, slug)).limit(1);
  if (existing.length > 0) {
    await scriptDb.update(pages).set({ title, body, status: "published", updatedAt: new Date() }).where(eq(pages.slug, slug));
  } else {
    await scriptDb.insert(pages).values({ slug, title, body, status: "published", updatedAt: new Date() });
  }
  console.log(`  page /${slug} — upserted, published`);
}

async function upsertPost(input: {
  slug: string;
  kind: "blog" | "recipe";
  title: string;
  excerpt: string;
  body: TiptapDoc;
  seoTitle: string;
  seoDescription: string;
  relatedTagSlugs: number[];
}): Promise<void> {
  const existing = await scriptDb.select({ id: posts.id }).from(posts).where(eq(posts.slug, input.slug)).limit(1);
  const values = {
    kind: input.kind,
    title: input.title,
    excerpt: input.excerpt,
    body: input.body,
    author: "Dishu Food and Beverages",
    status: "published" as const,
    publishedAt: new Date(),
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
    relatedProductIds: input.relatedTagSlugs,
  };
  if (existing.length > 0) {
    await scriptDb.update(posts).set(values).where(eq(posts.slug, input.slug));
  } else {
    await scriptDb.insert(posts).values({ slug: input.slug, ...values });
  }
  console.log(`  post /${input.kind === "recipe" ? "recipes" : "blog"}/${input.slug} — upserted, published`);
}

async function main() {
  console.log("Seeding policy pages...");
  await upsertPage("shipping-policy", "Shipping Policy", shippingPolicy);
  await upsertPage("refund-policy", "Refund & Cancellation Policy", refundPolicy);
  await upsertPage("privacy", "Privacy Policy", privacyPolicy);
  await upsertPage("terms", "Terms of Service", termsOfService);

  console.log("Seeding the flagship Blue Tea recipe...");
  const { products } = await import("../lib/db/schema");
  const blueTeaProducts = await scriptDb.select({ id: products.id }).from(products).where(eq(products.slug, "premium-herbal-blue-tea-loose"));
  const relatedIds = blueTeaProducts.map((p) => p.id);

  await upsertPost({
    slug: "blue-tea-lemon-ritual",
    kind: "recipe",
    title: "The Blue Tea Lemon Ritual: Watch Your Tea Change Colour",
    excerpt: "Brew Butterfly Pea Flower Blue Tea, then add lemon and watch it shift from blue to violet to magenta.",
    body: blueTeaRitual,
    seoTitle: "Blue Tea Lemon Ritual — Colour-Changing Butterfly Pea Tea",
    seoDescription: "How to brew Dishu's Butterfly Pea Flower Blue Tea and add lemon to watch it change colour from blue to violet to magenta.",
    relatedTagSlugs: relatedIds,
  });

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeScriptDb();
  });
