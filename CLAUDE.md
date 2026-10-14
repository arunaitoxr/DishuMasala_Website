# CLAUDE.md — Dishu Masala Storefront

Project constitution. Claude Code must read this file before writing any code and must not
contradict it. If a request conflicts with this file, say so and ask.

---

## 1. What we are building

A premium, light-theme, India-only (INR, English) e-commerce platform for **Dishu Food and
Beverages** (dishumasala.com) — organic Indian spices and premium herbal teas.

**Fully custom. There is no WordPress and no WooCommerce.** No PHP, no wp-json, no plugins, no
themes, no WordPress-derived data or auth. We own the storefront, the database, the admin panel,
payments, shipping, email and the customer accounts. If any instruction anywhere in this repo
mentions WordPress or WooCommerce, it is stale — delete it.

The brand's hero asset is **Blue Tea (butterfly pea flower)**, which physically changes colour from
blue to violet to magenta when lemon (acid) is added. The client's own product copy already says so:
*"Brilliant blue that transforms into purple when mixed with lemon."* That colour shift is the spine
of the visual identity. We call it the **Lemon Shift**.

### Reference quality bar
`bluetea.co.in` — its premium feel comes from restraint: cream/white space, one dominant colour,
photography-led cards, heavy trust scaffolding. We match that discipline and beat it with the one
thing they don't have: the Lemon Shift.

### What building custom means we now own
Order emails, invoices and GST presentation, refunds, inventory, coupon logic, review moderation,
customer accounts, and a **staff-facing admin panel**. The admin is not a nice-to-have — without it
the client cannot run their business. Treat it as a first-class product, not a CRUD afterthought.

---

## 2. Stack — fixed, do not substitute

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 15+, App Router, TypeScript strict** | Server Components by default; `"use client"` only where interaction demands it. |
| Database | **Supabase Postgres** | Plain Postgres, reached with `pg` (no Neon serverless driver, no wsproxy sidecar). App uses the Supavisor **transaction** pooler; `drizzle-kit` uses the direct connection. |
| ORM | **Drizzle ORM** + `drizzle-kit` migrations | SQL-first, typed. Migrations are checked in and never hand-edited after being applied. |
| Styling | **Tailwind CSS v4**, CSS-first `@theme` | Tokens live in CSS variables (§5). No colour literals in components. |
| UI primitives | Radix UI in a **local** `components/ui` | No heavy component library. |
| Animation | CSS transitions + `motion` for the hero only | Always respect `prefers-reduced-motion`. |
| State | **Zustand** for cart + wishlist (localStorage-persisted) | Server is always the price authority (§7.5). |
| Validation | **Zod** on every input, every route handler, every server action | |
| Forms | `react-hook-form` + Zod resolver | |
| Auth | **Supabase Auth** (email + password), role-based | Identity in `auth.users`; the app's own `public.users` row (integer PK, `role` in `customer`/`staff`/`admin`) is linked by `auth_user_id` and created by the `on_auth_user_created` trigger. No Supabase client is ever built in the browser — every auth flow is a server action. |
| File storage | **Supabase Storage** via its S3-compatible gateway, presigned uploads, `sharp` for derivatives | Same S3 SDK code path as any S3 provider — only endpoint/credentials differ. |
| Email | **Resend** + **React Email** templates | All transactional mail. |
| Payments | **Razorpay** — Orders API, server-side, HMAC verified | Plus COD. |
| Logistics | **Shiprocket** — serviceability, order push, tracking | |
| Rich text | **Tiptap** in the admin, stored as JSON, rendered server-side | For blog and recipe posts. |
| Charts (admin) | `recharts` | Admin dashboard only. |
| Testing | Vitest + Playwright | |
| Deploy | **Vercel**, with `output: "standalone"` kept on | No Vercel-only APIs — must stay runnable under PM2 + Nginx. |

Node 20+. Package manager: pnpm.

**Never** introduce: PHP or anything WordPress-shaped, a second CSS framework,
styled-components, Redux, Prisma, a headless CMS, an admin-panel framework
(no Retool/Refine/AdminJS — we build it), or any paid service not listed above.

**Amended (2026-09-04, client decision):** the original text banned "an auth SaaS" and fixed the
database as Neon and storage as Cloudflare R2. The client chose to move the database, auth and
file storage to **Supabase**, and reaffirmed that choice after the conflict with this section was
flagged. The ban on an auth SaaS therefore no longer applies to Supabase Auth specifically; it
still applies to adding *any other* auth provider on top. See §12's 2026-09-04 log entry for what
this cost and what behaviour changed.

---

## 3. Architecture

```
                     ┌────────────────────────────────┐
Shopper ────────────►│  Next.js App Router (Vercel)   │
Staff  ──/admin─────►│  RSC + server actions + routes │
                     └────┬───────────┬───────────┬────┘
                         │           │           │
              Drizzle ────┤           │           ──── Razorpay  (orders, verify, webhook)
      Supabase Postgres  │           │           ──── Shiprocket (pincode, push, track)
                         │           │           ──── Resend     (order + auth email)
                         │           ─────────────┴─── Supabase Storage (images)
                         ── single source of truth for catalogue, orders, content
```

Rules:

1. **Postgres is the only source of truth.** No JSON file, no external commerce API, no cache is
   authoritative. `data/catalog.json` exists solely to seed the database and to power local
   development before the DB is provisioned.
2. Data access lives **only** in `lib/db/queries/*` (reads) and `lib/db/mutations/*` (writes).
   No component, page or route handler builds a query inline. No ORM import outside `lib/db/`.
3. Server-only modules start with `import "server-only"`. No database URL, API key or secret may
   carry a `NEXT_PUBLIC_` prefix. Grep for leaks before every phase is called done.
4. Storefront reads are cached with `unstable_cache` / `revalidateTag` on tags `products`,
   `product:<slug>`, `collection:<slug>`, `reviews:<productId>`, `posts`. Every admin mutation that
   changes public data must call `revalidateTag` for the affected tags — a stale storefront after an
   admin edit is a bug.
5. Mutations are **server actions** for form-driven work and **route handlers** for webhooks and
   third-party callbacks. Both Zod-validate their input and return a typed result, never a raw throw
   to the client.
6. Every admin mutation writes an `audit_log` row (actor, action, entity, entity id, diff).

---

## 4. Money, tax and data integrity

- **All money is stored and computed as integer paise.** Column names end in `_paise`. Never a
  float, never a `numeric` for money, never rupee arithmetic in JavaScript. Format for display only,
  at the edge, via `lib/money.ts` (`formatINR(paise)`).
- Prices are **GST-inclusive**, matching the client's current pricing. Never add tax at checkout.
  Every price surface carries an "Inclusive of all taxes" affordance.
- `order_items` stores a **snapshot** — product name, SKU, option label, unit price, MRP — at the
  moment of purchase. Never render a historical order by joining to live product data; prices and
  names change and invoices must not.
- Order numbers are human-readable and sequential-ish (`DM-2026-00042`) from a Postgres sequence,
  never a raw UUID shown to a customer.
- Every timestamp is `timestamptz`, stored UTC, rendered in Asia/Kolkata.

---

## 5. Design system — the non-negotiable part

### 5.1 Light theme only
There is no dark mode on the storefront. Do not add one, do not add a toggle, do not write
`prefers-color-scheme: dark` rules. (The admin may use the same light palette — see §9.)

### 5.2 Tokens (`app/globals.css`, `@theme`)

```css
@theme {
  /* Ground — ivory, not white. Warmth is what reads as premium. */
  --color-bg:        #FCFAF6;
  --color-surface:   #FFFFFF;
  --color-surface-2: #F5F1EA;
  --color-line:      #E7E1D8;

  /* Ink */
  --color-ink:    #17161A;
  --color-ink-2:  #4A4750;
  --color-ink-3:  #7C7885;

  /* Lemon Shift — the brand spine. Blue brew, lemon added, magenta. */
  --color-brew-1: #123FA8;  /* deep butterfly pea */
  --color-brew-2: #2E5BE0;  /* blue              */
  --color-brew-3: #6C3FD1;  /* violet            */
  --color-brew-4: #A62D9B;  /* orchid            */
  --color-brew-5: #D62A6B;  /* magenta           */
  --color-citrus: #F3C623;  /* lemon             */

  /* Product-family accents */
  --color-hibiscus: #C0263C;  /* Red Tea       */
  --color-leaf:     #2F6B4F;  /* Classic/Assam */
  --color-turmeric: #E39A1F;
  --color-chilli:   #C43B23;
  --color-coriander:#7C8F45;
  --color-pepper:   #37342F;

  /* Semantic (admin + storefront status) — separate from the accent system */
  --color-ok:   #2F6B4F;
  --color-warn: #B7791F;
  --color-crit: #B4232E;

  /* Premium hairline — 1px rules and small caps only */
  --color-gold: #B08D3F;

  --font-display: "Fraunces", ui-serif, Georgia, serif;
  --font-sans:    "Inter", ui-sans-serif, system-ui, sans-serif;

  --radius-sm: 6px;  --radius-md: 12px;  --radius-lg: 20px;  --radius-xl: 28px;
  --shadow-card: 0 1px 2px rgb(23 22 26 / .04), 0 8px 24px -12px rgb(23 22 26 / .10);
  --shadow-lift: 0 2px 4px rgb(23 22 26 / .05), 0 18px 40px -16px rgb(23 22 26 / .18);
}

:root {
  --gradient-lemon-shift: linear-gradient(100deg,
    var(--color-brew-1) 0%, var(--color-brew-2) 20%, var(--color-brew-3) 45%,
    var(--color-brew-4) 68%, var(--color-brew-5) 86%, var(--color-citrus) 100%);
  --gradient-brew-cool: linear-gradient(135deg, var(--color-brew-1), var(--color-brew-3));
}
```

Load Fraunces (variable, 400–700, opsz) and Inter (400/500/600) via `next/font/google`,
`display: "swap"`, real fallback stacks. No other typefaces.

### 5.3 Type scale

| Role | Font | Size | Weight | Tracking |
|---|---|---|---|---|
| Hero | display | `clamp(2.75rem, 6vw, 5rem)` | 600 | -0.02em |
| Section title | display | `clamp(1.75rem, 3vw, 2.75rem)` | 600 | -0.015em |
| Product name | sans | 1–1.125rem | 600 | -0.01em |
| Body | sans | 1rem / 1.65 | 400 | 0 |
| Eyebrow | sans | 0.75rem uppercase | 600 | 0.14em |
| Price / data | sans, tabular-nums | 1rem | 600 | 0 |

### 5.4 Where the gradient is allowed — and where it is banned

A showpiece plus an accent system, never a wallpaper.

**Allowed:** the homepage hero canvas (one per site); primary CTA fills; Blue Tea and Red Tea
collection tiles; 2–4px section-divider rules and the free-shipping progress bar; the Blue Tea PDP
brew-story block; a 6px top edge on the footer.

**Banned:** gradient text below section-title size (never on body copy or prices); gradient behind
product photography; gradient card backgrounds in a grid; more than **one** gradient surface in a
single viewport (hero excepted); any viewport where ivory/white holds less than 60% of the visible
area.

**Amended (2026-08-28, client request):** the homepage hero was removed entirely (see §8's
2026-08-28 log entry). The "Lemon Shift" colour-change idea it carried now lives in the Blue Tea →
Red Tea section handoff instead: each section's background scroll-shifts colour (blue → pink →
red) as it passes through the viewport (`components/sections/ScrollColorBand.tsx`), so both
sections now carry a full-bleed colour surface where before only Blue Tea's band did. Both are
still real, token-derived brand colours, never a hex literal in a component and never gradient
text/product-photo backgrounds — this amends the "one gradient surface" framing above to fit two
adjacent full-bleed sections deliberately designed as one continuous colour journey, not a lapse
in the original discipline.

**Amended (2026-09-10, client decision, following §7.2's amendment):** Masala now gets its own
full-bleed scroll-colour band too (`MasalaBand.tsx`, chilli → pepper), the pillar counterpart to
Blue Tea/Red Tea's. "The only full-bleed editorial band on the homepage" (§5.4's original allowed
list, and §7.2's original text) is no longer accurate or intended — read both pillars' bands as one
deliberately symmetric pair, the same reasoning the 2026-08-28 amendment above already established
for two adjacent tea sections sharing one colour journey, just applied to two separate pillars
instead of two sections of the same pillar. Still real, token-derived colours only: turmeric was
considered and rejected as a stop specifically because white text on it clears only ~2.4:1, the same
accessibility failure §5.6 already calls out for the citrus stop — chilli (~5.3:1) and pepper
(~12.4:1) were checked and both clear 4.5:1. The two pillar bands are never simultaneously in
viewport (they're far apart in scroll order), so "more than one gradient surface in a single
viewport" still holds; it's the total-per-page count, not the per-viewport one, that's now two
instead of one.

### 5.5 Motion
Micro-interactions 160–220ms `cubic-bezier(.2,.6,.2,1)`. Hero brew morph 900–1400ms. Card hover
lifts 2px and crossfades to the second image. Under `prefers-reduced-motion: reduce` everything
collapses to a finished static state — the hero shows its mid-gradient frame and looks complete.

### 5.6 Accessibility — hard floor
WCAG 2.1 AA. White on `--color-citrus` **fails** — never put white text on the lemon stop; use
`--color-ink`. Visible 2px focus rings (`--color-brew-2`, 2px offset) on everything interactive.
Real alt text on every image, sourced from the DB (`product_images.alt`), never auto-filled with the
filename. Full keyboard operability: size selectors, mega-menu, cart drawer, quantity steppers,
admin tables, admin dialogs.

---

## 6. Database schema — the contract

Drizzle, in `lib/db/schema/`, one file per domain. Snake_case columns, `timestamptz`, integer paise.

```
users              id, auth_user_id(uuid, uniq -> auth.users.id), email(uniq), phone, name,
                   role(customer|staff|admin), email_verified_at, last_login_at, created_at,
                   updated_at
                   -- no password column: Supabase Auth is the sole credential custodian
addresses          id, user_id, label, name, phone, line1, line2, city, state, pincode,
                   is_default, created_at
collections        id, slug(uniq), title, tagline, priority(int), accent_token, position,
                   seo_title, seo_description
products           id, slug(uniq), name, collection_id, short_description, description,
                   ingredients, brew_guide, tags(text[]), option_label, priority(int),
                   status(draft|published), seo_title, seo_description, created_at, updated_at
product_images     id, product_id, storage_key, alt, width, height, position, is_primary
variants           id, product_id, sku(uniq), option_value, mrp_paise, price_paise,
                   weight_grams, in_stock, stock_qty(nullable), position
coupons            id, code(uniq), kind(percent|fixed), value, min_spend_paise,
                   max_discount_paise, first_order_only, usage_limit, used_count,
                   per_user_limit, starts_at, ends_at, active, applies_to(jsonb)
coupon_redemptions id, coupon_id, order_id, user_id, created_at
orders             id, order_number(uniq), user_id(nullable), email, phone,
                   status(pending|confirmed|packed|shipped|delivered|cancelled|refunded),
                   payment_method(razorpay|cod), payment_status(pending|paid|failed|refunded),
                   subtotal_paise, discount_paise, shipping_paise, total_paise, coupon_code,
                   razorpay_order_id, razorpay_payment_id, shipping_address(jsonb),
                   billing_address(jsonb), shiprocket_order_id, awb, courier, tracking_url,
                   customer_note, staff_note, placed_at, created_at, updated_at
order_items        id, order_id, variant_id(nullable), product_name, option_value, sku,
                   mrp_paise, unit_price_paise, qty, line_total_paise, image_storage_key
reviews            id, product_id, user_id(nullable), order_id(nullable), author_name, email,
                   rating(1-5), title, body, status(pending|approved|rejected),
                   verified_buyer, created_at, moderated_at, moderated_by
review_photos      id, review_id, storage_key, position
wishlist_items     id, user_id, product_id, created_at   (uniq user_id+product_id)
posts              id, slug(uniq), kind(blog|recipe), title, excerpt, body(jsonb tiptap),
                   cover_storage_key, status(draft|published), author, published_at,
                   seo_title, seo_description, related_product_ids(int[])
pages              id, slug(uniq), title, body(jsonb), status, updated_at
newsletter_subs    id, email(uniq), confirmed_at, source, created_at
pincode_cache      pincode(pk), serviceable, cod_available, eta_days, checked_at
settings           key(pk), value(jsonb)   -- free-ship threshold, store address, GSTIN, etc.
audit_log          id, actor_user_id, action, entity, entity_id, diff(jsonb), created_at
```

Indexes are required on: `products.slug`, `products.collection_id`, `products(priority, status)`,
`variants.product_id`, `variants.sku`, `orders.order_number`, `orders(status, placed_at)`,
`orders.user_id`, `order_items.order_id`, `reviews(product_id, status)`, `posts(kind, status,
published_at)`, `wishlist_items.user_id`. Foreign keys with explicit `on delete` behaviour —
never cascade an order or an order item away.

Nothing outside `lib/db/` imports Drizzle. Everything else consumes the domain types in
`types/catalog.ts`, `types/order.ts`.

---

## 7. Commerce rules

### 7.1 Catalogue shape
Seeded from `data/catalog.json`: 20 products, 30 variants, 5 collections. Options are a single axis
per product, labelled by that product's own `option_label` — `Size`, `Combo`, or `Teabags`.

### 7.2 Priority — superseded 2026-09-10, client decision

**Original rule (kept below for history — no longer in effect):** "Blue Tea first. Then Red Tea.
Then everything else." Stored as `priority` on both `collections` and `products`: `1` blue-tea, `2`
red-tea, `3` classic-teas, `4` combos, `5` spices. Lower sorts first, everywhere: homepage section
order, `/shop` default sort, nav and mega-menu order, footer collection list, related products, cart
upsells. Blue Tea additionally got the hero, the only full-bleed editorial band on the homepage, and
a brew-story block on its PDP.

**Amended (2026-09-10, client decision): Tea and Masala are co-equal pillars, not a cascade.**
The client's own company is named Dishu **Masala** — tea doesn't appear in the name — and asked
directly for masala to carry equal importance, not sit structurally last behind the entire tea
range. The original rule, taken from an earlier decision, did the opposite of that by construction:
a single flat `priority` cascade means one category always fully precedes the other everywhere it's
read. Reversed as follows:

- **Two pillars, not five flat ranks.** Tea = `blue-tea`, `red-tea`, `classic-teas`. Masala =
  `spices`, `combos`. Each pillar has a primary collection (its strongest individual hook) and a
  secondary one.
- **`priority` is now interleaved, not grouped**, so every reader of the raw column — `/shop`'s
  default sort, the footer collection list, related products, cart upsells — gets pillar parity for
  free, with no separate template logic: `1` blue-tea, `2` spices, `3` red-tea, `4` combos, `5`
  classic-teas (`data/catalog.json`, re-seeded via `pnpm db:seed`'s existing upsert-on-conflict — no
  schema/migration change, purely a data decision). Blue Tea keeps rank 1 — it still has the
  strongest single lead hook, the Lemon Shift — but rank 2 is Masala, not more tea.
- **Homepage** (`app/page.tsx`) changed from a single tea-first cascade to alternating full-bleed
  pillar bands: Tea's primary band, then Masala's primary band (`MasalaBand.tsx`, new — the pillar
  counterpart to `BlueTeaBand.tsx`), then Tea's secondary section, then Masala's secondary section.
  §5.4 below is amended to match — a second full-bleed band is no longer an exception to "the only
  one," it's the other half of a deliberately symmetric pair.
- **Nav / mega-menu** (`lib/nav.ts`, `components/layout/HeaderClient.tsx`): a "Masala" column now
  sits alongside "Teas" (previously Spices and Combo Packs were two separate unlabelled misc
  columns next to one named "Teas" column — technically two columns to Teas' one, but not legible
  as a pillar). The flat desktop nav's explicit order literal was updated to match the new
  interleaved `priority`.
- **Not yet touched, flagged rather than guessed at:** related-product and cart-upsell logic still
  key off `priority`/collection the same way they always did — interleaving the numbers changes
  their output but no code there was rewritten, since "should an upsell ever cross pillars on
  purpose" is a product decision, not implied by "give masala equal billing." Revisit if the client
  wants cross-pillar upsells specifically.
- **Open item, flagged to the client, not invented:** Masala doesn't yet have a hook equivalent to
  Tea's Lemon Shift — "Single-Origin. Double-Layer Packed." is a real, honest packaging claim, not a
  sensory story. Equal visual weight (this amendment) isn't equal narrative weight; closing that gap
  for real — the aroma when the double-layer seal opens, the stone-grinding process, per-spice
  single-origin traceability — needs real content from the client, per §8's "invent nothing."

`priority` is still editable in the admin. The seed data sets it; nothing infers it.

### 7.3 Pricing display
Every variant has an MRP and a live sale price — real discounts of 6–27%. Always render MRP struck
through, sale price prominent, and a `Save X%` chip computed at render time. Never hardcode a
discount. When `price_paise == mrp_paise`, show no strike-through and no chip.

### 7.4 Cart
Client cart in Zustand (variant id + qty), persisted to localStorage inside try/catch, synced to the
`users` row when signed in. Free shipping at **₹500** (from `settings`, not a literal) with a
progress bar showing the exact rupees remaining. Coupon `WELCOME5` — 5% off, first order only — must
exist at launch.

### 7.5 Order integrity — the most important rule in this project
Never trust a price, quantity, discount, or shipping amount that arrives from the client. On every
cart validation and at checkout, the server re-reads each variant from Postgres, recomputes subtotal,
discount, shipping and total in paise, and rejects any mismatch by returning the corrected cart. The
Razorpay order amount is derived from the server total alone. Verify
`HMAC-SHA256(razorpay_order_id|razorpay_payment_id, RAZORPAY_KEY_SECRET)` with a timing-safe compare
before marking an order paid, and handle the `payment.captured` webhook idempotently — it may arrive
before, after, or alongside the client callback. Checkout takes an idempotency key so a
double-submit cannot create two orders. Stock decrements and coupon `used_count` increments happen
in the **same transaction** as the order insert.

### 7.6 Stock
The client's data has no counts, only in/out. `stock_qty` is nullable: when null, stock is a boolean
and no quantity is ever shown. Only when a real count exists and is under 10 may the UI say
"Only N left". Never invent scarcity.

---

## 8. Content, imagery and claims

- **Images live in Supabase Storage**, never in `/public` and never hot-linked from the old site. A migration
  script pulls the existing packshots off `dishumasala.com/wp-content/uploads/`, generates AVIF/WebP
  derivatives with `sharp`, uploads to Supabase Storage, and records keys, dimensions and alt text in
  `product_images`. This must run before the old site is decommissioned.
- Lifestyle and brew imagery is **AI-generated placeholder** for launch. Every placeholder is
  listed in `PLACEHOLDERS.md` with its slot, aspect ratio and the real photo it stands in for, and
  is referenced only through `components/media/Placeholder.tsx`. No text, no logo, no award badge,
  no certification mark, and no human face presented as a named customer or farmer.
- **Invent nothing.** No fabricated reviews, customer counts, awards, certifications, press
  mentions, or health and medicinal claims. Trust claims ship only with what is verifiable:
  double-layer packaging, free shipping over ₹500, sourced in Punjab, COD available. If the client
  wants more, they supply it in writing.
- **Logged exception (2026-08-28, standing for this project):** several homepage banner sections
  (`PromoBannerSlider` instances — the top homepage slider, the Red Tea section banner, the Spices
  section banner) use client-supplied images as-is, with the client's own marketing text —
  including health/certification-adjacent phrasing this project would never write itself ("Belly
  Fat Reduction & Slimming", "Aids Digestion") — baked directly into the image pixels. Claude
  flagged the conflict with this section directly to the client stakeholder before building the
  first one; the client explicitly chose to use the banners unedited, and this has now recurred
  consistently enough across multiple banners that it's treated as a standing decision for this
  project's banner sections specifically, not re-litigated per image.
  One instance is client-dictated **text**, not an image: the Spices section's marquee separator
  ("100% Organic · Stone Ground · Zero Preservatives", `components/sections/SpicesBanner.tsx`) — a
  specific certification-style claim ("100% Organic") with no organic-certification data behind it
  in this project, authored directly into the codebase rather than placed as a pre-made client
  image. Flagged once, then treated on the same standing basis as the banner images above.
  This does not change the rule for content this project writes on its own initiative — copy,
  accordions, policy pages, and any new claim Claude itself proposes still follow every constraint
  in this section unless the client makes the same explicit call again.
- **Logged exception (2026-09-09, extends the 2026-08-28 entry to the PDP gallery):** the Blue Tea
  (teabags) product page (`premium-herbal-blue-tea-teabags`, `product_images` ids 104/105/106) now
  carries 3 client-supplied images with the same kind of claims as the homepage banners above, but
  in a placement the 2026-08-28 entry explicitly did **not** cover — the product gallery itself,
  not a `PromoBannerSlider` banner slot. The images include a specific timed claim ("What people
  noticed after drinking Blue Tea consistently for 8 weeks" with a body-image visual), "Belly Fat
  Reduction & Slimming" baked into a pouch mockup, and a competitor-comparison graphic asserting
  other teabags "Contain Microplastics — Leaches harmful particles in hot water". Claude flagged
  this as materially different from the banner exception — a live product listing, a specific
  timeframe, a body-image weight-loss visual, and a claim about a competitor's product safety, none
  of which the original entry's images did — before uploading anything. The client explicitly chose
  to use them on the PDP as-is. Treated as its own decision, not an automatic extension of the
  banner exception to every future PDP gallery image; a different product's gallery carrying
  similar claims would need the same explicit call made again, not an assumption that this entry
  covers it.
- **Logged exception (2026-09-10, same explicit-call pattern, a second product — corrected same
  day):** 4 client-supplied images (2 with health claims — "Supports Heart Health", "Helps Regulate
  Blood Sugar", "Strengthens Immunity", "Enhances Skin Glow"; 1 resealable-pack/double-layer/
  hygienic-processing image needing no exception, every claim on it already independently
  verifiable under this section; 1 nutrition-facts panel with specific per-100g values and an
  allergen statement) were flagged before uploading — the nutrition panel specifically because
  fabricated nutrition labeling is an FSSAI packaging-law question, not a brand-voice one, so
  Claude asked directly whether the figures were real lab/packaging data rather than treating it as
  covered by any standing exception. The client confirmed both: use the health claims as-is, and
  the nutrition data is real. **These 4 images were first uploaded to the wrong product**
  (`classic-tea-250gm`) and moved same-day to their correct one (`classic-tea-500gm`,
  `product_images` ids 150–153) once the client caught the mix-up — the content decision above is
  about the images themselves, not the SKU, so it carries over to `classic-tea-500gm` rather than
  needing to be re-asked for a mere placement correction. `classic-tea-250gm` separately received 3
  of its own new images the same day (`product_images` ids 147–149) — also health-claim-bearing
  ("Supports Immunity", "Good for Heart Health", "Provides Natural Energy", "Aids Digestion", "Rich
  in Antioxidants") — covered by this same entry's approval since it's the same product already
  cleared here, not a new one. Same standing rule as before: a genuinely different product's gallery
  still needs this asked again, not assumed from this entry.
- **Logged exception (2026-09-10, extends the pattern to the Spices category):** the Black Pepper +
  Garam Masala + Coriander combo (`black-pepper-garam-masala-coriander`, `product_images` ids
  154/155) carries 2 client-supplied images with vague wellness framing — "Supports A Healthier
  You", "Supports Wellness" (with a heart icon) — genuinely milder than the teas' specific medical
  claims (no organ or condition named), but still asked about explicitly rather than assumed,
  since this is the first time the pattern extends to Spices rather than Teas. The client confirmed
  use as-is. Also worth recording: while sorting these, an image the client had placed in
  `garam-masala-black-pepper`'s folder turned out to actually show Coriander + Black Pepper
  packaging — the client confirmed it belonged on `black-pepper-coriander` instead once flagged.
  Two mis-filed-image catches in as many days is a real pattern, not a one-off — worth a quick
  double-check of what a dropped image actually shows against the product folder it landed in
  before uploading, every time, not just when something looks obviously off.

## 9. The admin panel (`/admin`)

Staff-facing, built by us, and the client's daily tool. Same tokens, denser: ivory ground, white
cards, `--color-ink` type, semantic colours for status only, tabular numerals everywhere, no
gradient except a hairline in the sidebar header.

Scope: dashboard (today's orders, revenue, low stock, pending reviews) · orders (filterable table,
detail view, status transitions, Shiprocket dispatch, resend invoice, refund note) · products and
variants (create/edit, drag-to-order images uploaded to Supabase Storage, pricing, stock, priority, SEO fields,
draft/publish) · collections · coupons · reviews moderation queue · customers (with order history) ·
posts and pages (Tiptap) · settings.

**Note (2026-08-26, confirmed with the client stakeholder):** this is a traditional dashboard admin
— sidebar nav, tables, forms — built exactly as scoped above, not an inline WYSIWYG/click-to-edit
page-builder. That pattern was considered and explicitly declined for this project: orders, stock,
coupons and customers are structured operational data, not marketing page content.

Rules: `role` in `staff` or `admin` required, enforced in middleware **and** re-checked in every
server action — never rely on the client hiding a button. Every mutation writes `audit_log` and
calls `revalidateTag`. Destructive actions need typed confirmation and prefer soft-delete
(`archived_at`) over a hard delete; orders and order items are never deletable. Tables are
keyboard-navigable with real pagination and URL-driven filters. Optimistic UI is fine; silent
failure is not.

**Amended (2026-10-13, client request): never-paid orders can be deleted.** The client asked to
clear out abandoned and test checkouts. A paid, refunded, shipped or COD-confirmed order is still
never deletable — cancel or refund it. Deletion is typed-confirmation, audited as `order_deleted`,
releases any stock the order still held, and the rule lives in one place
(`lib/commerce/order-delete.ts`). A Razorpay checkout becomes deletable only 72 hours after it was
placed, because a retried or slow UPI payment can still be captured against it; deleting it earlier
would leave a captured payment with no order.

---

## 10. Deployment

Storefront and admin are one Next.js app on **Vercel**. Postgres, auth and images all on
**Supabase** (one project), mail via **Resend**. Keep `output: "standalone"` on and use no Vercel-only API, so the same build
runs under PM2 behind Nginx on a VPS if the client ever wants to move — document that path in
`docs/DEPLOY.md`.

Env (`.env.example`, every line commented, no `NEXT_PUBLIC_` on any secret):
`DATABASE_URL`, `DIRECT_DATABASE_URL`, `DATABASE_POOL_MAX`, `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `STORAGE_ENDPOINT`, `STORAGE_REGION`,
`STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_BUCKET`,
`STORAGE_PUBLIC_BASE_URL`, `ORDER_LINK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`,
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SHIPROCKET_EMAIL`,
`SHIPROCKET_PASSWORD`, `NEXT_PUBLIC_SITE_URL`.

Not even the Supabase *publishable* key carries a `NEXT_PUBLIC_` prefix, because this app never
constructs a Supabase client in the browser (`lib/supabase/config.ts` explains why). Two settings
live in the Supabase dashboard rather than in env and are easy to miss on a new project — the
**access-token hook** (Auth → Hooks, pointed at `public.custom_access_token_hook`) and the
**allowed redirect URL** `<site>/auth/confirm`. Without the first, `middleware.ts` sees no
`user_role` claim and locks staff out of `/admin`. `.env.example` carries both as a checklist.

### SEO and migration
The old site is ranked, so keep its URL shapes: `/product/<slug>/` and `/collections/<slug>/`, with
the existing product slugs (they are in `catalog.json`). Before launch, crawl the live site for its
full URL list, diff it against the new sitemap, and 301 every gap from a checked-in `redirects.csv`
via `middleware.ts`. **A ranked URL with no destination is a launch blocker** — list gaps
explicitly, never silently point them at the homepage. Ship `next-sitemap`, `robots.txt`,
canonicals, per-page OG images, and JSON-LD for Organization, BreadcrumbList, Product + Offer
(+ AggregateRating only when real reviews exist), FAQPage, Article/Recipe.

---

## 11. Quality gates — every phase must pass before the next

- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` clean. No `any`, no `@ts-ignore`, no
  `eslint-disable` without a one-line justification.
- Lighthouse mobile on `/`, `/shop`, a PDP, `/cart`: Performance ≥ 90, Accessibility 100, SEO ≥ 95.
  LCP < 2.0s, CLS < 0.05, INP < 200ms. Homepage first-load JS ≤ 180KB gzip.
- Vitest on: money helpers, cart maths, coupon application, server-side total recomputation, the
  Razorpay signature verifier, and the priority sort.
- Playwright E2E: browse → variant select → add to cart → coupon → checkout → mocked payment →
  order confirmation; plus a COD run; plus a tampered-price run that **must** be rejected.
- Every DB migration applies cleanly to an empty database and the seed runs green after it.
- No secret in the client bundle — grep and report.
- No hardcoded prices, product names, image URLs or copy in components; everything comes from the
  DB layer or `content/`.

---


**Follow-up (2026-09-05): the access-token hook was abandoned.** The claim-based design failed in
the worst possible way on a real project. A Supabase access-token hook has to be enabled per
project in the dashboard, and the hook function runs as `supabase_auth_admin` — which is not the
table owner, so the moment RLS is enabled on `public.users` (which Supabase's own dashboard
prompts you to do) its `SELECT` returns zero rows. Either failure produces the same outcome: the
`user_role` claim is absent or defaults to `customer`, `middleware.ts` locks every staff account
out of `/admin`, and **nothing is logged anywhere**. It fails closed, which is safe, but silently,
which is worse than loudly.

`middleware.ts` now reads the role from `public.users` directly, over PostgREST, using the
caller's own session (`lib/db/session-role.ts`). Migration 0010's `users_can_read_own_row` policy
is what makes that safe — `SELECT` only, `authenticated` only, `USING (auth_user_id = auth.uid())`
— so a signed-in customer can read their own role and nobody else's. Costs one round-trip, on the
`/account/*` and `/admin/*` prefixes only.

What this bought: no dashboard step in the deploy checklist, the role is authoritative at the first
gate instead of up to one token-refresh stale, and the failure mode is now "no row → rejected"
rather than "claim missing → silently a customer". `getDisplaySessionUser()` correspondingly stopped
needing any custom claim and now returns only the Supabase user id, because nothing on the client
ever needed the role.

Migration 0008's `custom_access_token_hook` function is deliberately left in place rather than
dropped: dropping it while a dashboard hook still points at it would make token issuance fail
outright. It is inert. Removing it is a separate manual step once the hook is switched off in the
dashboard.

## 12. Working style for Claude Code

**Logged migration (2026-09-04, client decision): Neon + Auth.js + Cloudflare R2 → Supabase.**
The client asked to move the database to Supabase and, when offered a database-only swap, chose to
move auth and file storage too. The conflict with §2's "fixed, do not substitute" table and its
no-auth-SaaS rule was flagged first and the choice reaffirmed; §2 now records the amendment. What
this actually changed, so nobody has to rediscover it:

- **Database.** `@neondatabase/serverless` + `ws` are gone; `lib/db/index.ts` and
  `lib/db/script-client.ts` now share one `pg` driver. The `ghcr.io/neondatabase/wsproxy` sidecar
  local dev needed is gone with them. Nothing may call Drizzle's `.prepare()` — transaction-mode
  pooling cannot carry server-side prepared statements. Migrations run against
  `DIRECT_DATABASE_URL`, never the pooler.
- **Storage.** `lib/storage/r2*.ts` → `lib/storage/storage*.ts`, `R2_*` env → `STORAGE_*`, and the
  four `*r2_key*` columns → `*storage_key*` (migration 0006). Supabase Storage is addressed over
  its S3 gateway, so the presigned-upload and `sharp`-derivative pipeline is unchanged code.
  `forcePathStyle` is now always on, and `next.config.ts`'s `dangerouslyAllowLocalIP` is derived
  from whether the storage host is *actually* loopback — not from `STORAGE_ENDPOINT` being set,
  which under Supabase is always true including in production.
- **Auth.** `auth.ts`, `auth.config.ts`, `lib/auth/password.ts`, `app/api/auth/[...nextauth]/` and
  `lib/tokens.ts` are all deleted, along with `next-auth` and `@node-rs/argon2`. `public.users`
  keeps its integer primary key (every FK in `addresses`, `orders`, `reviews`, `wishlist_items` and
  `audit_log` depends on it) and gains `auth_user_id` → `auth.users.id`; `password_hash` is dropped
  outright. Migration 0008 adds the `on_auth_user_created` trigger and the
  `custom_access_token_hook` that stamps `user_role` into the JWT.
- **Two gates, both reading Postgres.** `middleware.ts` cannot import `lib/db` (it is
  "server-only"), so the role initially travelled in a `user_role` JWT claim stamped by a Supabase
  access-token hook. **That was abandoned on 2026-09-05** — see the follow-up entry below.
  `middleware.ts` now reads the role over PostgREST as the caller (`lib/db/session-role.ts`,
  constrained to the caller's own row by the `users_can_read_own_row` policy in migration 0010),
  and `lib/auth/session.ts` re-reads it with Drizzle for every server action. Middleware is the
  first gate, never the only one, and no claim can go stale.
- **What was genuinely lost.** The hand-built timing-equalisation burns are gone — they hid a fast
  "no such user" DB miss behind a slow Argon2 verify, and Supabase answers over the network on its
  own timing. The no-enumeration discipline and the per-email rate limiting in `lib/rate-limit.ts`
  are both KEPT (Supabase's own limits are per-IP only).
- **Behaviour change to be aware of.** `enable_confirmations = true` means a new account cannot
  sign in until its email is confirmed. Under Auth.js an unverified user could sign in and was
  merely nudged to verify. This was chosen to keep the verification flow real rather than
  vestigial; revisit it if the client wants immediate sign-in.
- **Not a browser client.** No Supabase client is constructed client-side, so no Supabase key is
  inlined into the bundle and §3.3's no-`NEXT_PUBLIC_`-secrets rule holds unchanged. `useSession()`
  is now this project's own context (`components/providers/SessionProvider.tsx`), fed from the
  server in `app/layout.tsx`. If a feature ever needs a browser-side Supabase client, that is the
  moment to revisit the rule deliberately.


- Work strictly one phase at a time (`PROMPTS.md`). Do not scaffold future phases early.
- Open each phase by restating its acceptance criteria; close it by self-checking against them and
  reporting anything unmet. Never claim completion for something you could not verify.
- Prefer fewer, better files. No barrel-file sprawl, no premature abstraction, no `utils.ts` dump.
- Every server action and route handler: Zod-validated input, typed result, explicit error shape,
  no stack traces to the client.
- Stop and ask when the brief is ambiguous or the data can't support it. Invent no product claims,
  reviews, or numbers.
- Conventional commits, one logical unit each.
