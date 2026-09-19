# Changes to merge — 2026-09-19

## Navigation

- Renamed the `classic-teas` navigation label from **Classic & Assam** to **Black Tea** in both desktop and mobile navigation. The collection slug and stored catalog title are unchanged.
- Removed **Contact** from desktop and mobile navigation. The contact route and footer link are unchanged.

## Product and homepage video

- Added the supplied `data/videos/` clips to `public/product-videos/` without conversion, cropping, recolouring, or re-encoding. SHA-256 checksums were verified identical after copying.
- Added video gallery media to the matching PDPs:
  - Blue Tea (loose and teabags) → `BlueTea.mp4`
  - Red Tea (loose and teabags) → `RedTea.mp4`
  - Black Pepper → `BlackPepper.mp4`
  - Garam Masala → `GaramMasala.mp4`
  - Turmeric → `TurmericPower.mp4`
  - Red Chilli → `RedChili.mp4`
  - Coriander → `CorrianderPowder.mp4`
- Updated the lower homepage ritual video to use the supplied `BlueTea.mp4`.

## Collection experience

- Added one shared collection hero component based on the Corporate Gifting page structure:
  - desktop: unmodified supplied banner with collection copy positioned in its existing left-side open space;
  - mobile: unmodified supplied mobile banner where available, followed by a solid collection-copy band;
  - intrinsic dimensions and `object-contain` preserve all supplied artwork and packaging with no crop.
- Wired the supplied CategoryBanners assets to:
  - Blue Tea → `BannerBlueTeaWeb.png`
  - Red Tea → `BannerRedTeaWeb.png` and `BannerRedTeaMobile.png`
  - Spices → `BannerSpiceComboWeb.png` and `BannerSpicesComboMobile.png`
  - Spice Combos → the same supplied masala-range creative, because no separate combo-specific artwork was supplied.
- Other collection routes retain their existing banner fallback until matching supplied assets are provided.

## Validation

- `pnpm typecheck` passes.
- `pnpm lint` passes with only five pre-existing warnings in unrelated account/checkout/PDP files.
- Local route checks return HTTP 200 for the homepage, updated collections, and sampled video PDPs.

## Reviews

- Imported 1,462 approved reviews from the supplied catalog CSV into the matching current product
  records. The source identifies them as synthetic/non-customer reviews, so all imported entries
  remain explicitly **unverified** and do not receive a “Verified buyer” badge.
- Skipped 266 reviews tied to unmatched legacy combo names rather than assigning them to a different
  product: `Rakhi Special Combo`, `Blue Tea + Red Tea Duo`,
  `Blue Tea + Red Tea Transformation Combo (4 Packs)`, and `Red Tea + Blue Tea Gift Combo`.
- Product pages already show five reviews initially; renamed the expansion action to **View more
  reviews** and retained its paginated full-list dialog.
- Homepage reviews now show five reviews initially, with a **View more reviews** dialog and
  pagination for the remaining approved reviews.

## Storefront consistency

- Reverted the later Red Tea feature and footer visual treatment at the user’s request. The
  homepage now returns to the earlier continuous Blue Tea → Red Tea colour band and the earlier
  footer layout; DB-backed product, rating, and review functionality remains unchanged.

- Reworked the homepage category navigation into a framed category shelf with restrained
  collection-colour rings, aligned labels, visible focus/hover treatment, and database-backed
  collection titles (with the approved `Black Tea` display alias retained). Removed its added
  heading, supporting copy, Shop all link, and surrounding shelf container after review, keeping
  the category strip image-first.
- Removed the rounded card background and shadow from the homepage promotional banner below the
  category strip; collection-page banners retain their framing.
- Wired the newly supplied category artwork without modification: the Blue Tea mobile banner and
  Black Tea desktop/mobile banner pair now serve their matching collection pages.
- Collection-page main banners now render only the supplied `data/CategoryBanners` files, with no
  title overlay, colour band, crop, or Supabase promotional-banner fallback. A collection without
  a supplied asset uses its standard database-backed collection heading instead of a substitute
  hero image.
- Homepage collection shelves and Shop product cards now include rating summaries calculated from
  approved Supabase review rows. Products without approved reviews display no fabricated rating.

## Shopping-experience refinement

- Benchmarked the product-discovery and shopping patterns against the live Blue Tea storefront:
  persistent value messaging, immediate product discovery, filter/sort controls, wishlist/quick-buy
  affordances, and product-first browsing.
- Refined Dishu without copying Blue Tea's identity or unverified marketing claims:
  - product cards with several real variants now use an explicit **Choose size / Choose teabags /
    Choose combo** action instead of silently adding the first option;
  - single-option cards retain direct Add to cart;
  - desktop filters remain in reach while browsing long product grids;
  - the shop result/sort row now has a calmer aligned control bar and clear visible result context;
  - desktop PDP purchase controls remain visible beside gallery media while the shopper scrolls;
  - the PDP's primary image uses `object-contain`, preserving supplied packaging artwork rather
    than cropping it to the square media frame.
- Visual QA performed with local desktop (1440px) and mobile (390px) screenshots for Shop, homepage,
  collection pages, and a representative product page.

# Changes to merge — 2026-09-20 (UI/UX consistency pass)

Brief: every page consistent in the way bluetea.co.in is; category pages built like Corporate
Gifting; Black Tea everywhere; category circles from `data/category`.

## Data (already applied to the database)

- **Category circles** now use the client's six studio photos from `data/category/`
  (`BlueTea.png` … `TeaCombo.png`), keyed by collection slug. The script expected `1.png`–`6.png`, so
  it had never picked them up. Ran `pnpm migrate-category-circles`.
- **Classic & Assam → Black Tea**: the stored collection title (`pnpm rename-classic-teas-to-black-tea`)
  and `data/catalog.json`. Slug stays `classic-teas`, so URLs and redirects are unchanged. The two
  display aliases (nav, homepage circles) are removed. **One manual step:** product lists cached
  before the rename (shop filter labels) still say "Classic & Assam" until the cache refreshes — open
  Admin → Collections → Black Tea → Save once (or restart the dev server).

## Bugs fixed

- `app/globals.css`: the unlayered `* { border-color }` rule overrode every Tailwind border-colour
  utility — invalid form fields never turned red, checked radios stayed beige, the selected pack card
  lost its border. Moved into `@layer base`.
- Justified text is now opt-in (`.copy-justify`, long-form copy only, `sm`+). The global `p` rule was
  stretching product names, hero subheads, card copy and review bodies, and hyphenating mobile text.
- Footer printed "GSTIN TODO." on every page — `getGstin()` returns null for the placeholder.
- PDP "Best Value" badge was clipped by its card.
- Eight pages nested a second `<main>` (blog, recipes, policies, admin).
- PDP "Shipping & Returns" said the policy "will appear here shortly" — now links the policy pages.
- Wishlist cards showed an empty grey square instead of the product photo.
- Homepage review cards collapsed to ~80px wide on phones.

## One system instead of many

- **Product card** (every grid and carousel): same rows on every card — name, pack, rating, price,
  "Add to cart". Multi-pack products show their real lowest price as "From ₹X" and open a pack
  picker (`components/product/QuickAddDialog.tsx`) instead of a different, price-less card with a
  "Choose size" link. Collection chip removed (redundant on collection pages). Empty-cart
  "Bestsellers" now uses the same card. *This replaces the 2026-09-17 decision to hide prices on
  multi-pack cards — the reference site shows "From" prices on every card.*
- **Headings**: one `SectionHeading` and two type roles (`.type-page-title`, `.type-section-title`)
  for every page title and section title — they had drifted to seven sizes.
- **Page width**: one `PAGE_CONTAINER` (`lib/design-tokens.ts`); cart, contact, blog, recipes and
  policies no longer shift the left edge.
- **Selected state**: pack/option pickers = citrus fill (PDP cards, pack picker, Chip); form
  controls = ink (filter radios and checkboxes, checkout radios).
- **Buttons**: remaining hand-rolled buttons moved onto `Button`; arrow glyphs removed from labels.

## Page structure

- **Collection pages** follow Corporate Gifting: shared `PageHero` (copy in the banner's open left
  side on desktop; banner then a colour band on phones) → benefit strip (herbal teas) → products under
  a heading and intro → "Why shop with Dishu" trust band → FAQ on one white card. Tea Combos now
  uses its newly supplied banner (`data/CategoryBanners/TeaComboWeb.png` / `TeaComboMobile.png`); a
  collection with no banner would get the colour-band version of the same hero. Gifting now renders through the same `PageHero` and
  `TrustBand`. `/shop` opens with the same hero, titled "All products" to match the nav.
- **Homepage**: products come first; founder story shortened to two paragraphs after the products,
  full story on the new `/about` page (linked from the footer). Second blue marquee replaced by the
  same quiet strip the collection pages use, reading "Caffeine-free herbal teas" instead of "Zero
  Caffeine" (Black Tea contains caffeine — confirmed). "Free shipping" no longer repeated in the trust
  strip under the announcement bar. The standalone "Spices" heading removed (it said Spices three
  times in a row). Black Tea and Spice Combos sections use the same heading + CTA as the others.
  Reviews show six (a full 3×2 grid).
- **Motion**: scroll fade-ins on homepage sections and the staggered grid entrance removed; the
  colour bands remain the one signature motion.
- Breadcrumbs start at Home. Shop filter "Type: Size / Combo" is now "Pack type: Loose, by weight /
  Combo packs / Teabags". Footer social icons (inert placeholders) removed until real URLs exist.

## Still needs the client

- Product photography: packshots sit on different saturated grounds, and several images carry a
  baked-in marketplace "1" tile in the corner. Needs re-exported images on one neutral ground.
- Blue Tea (teabags) has near-duplicate variants ("Starter (1 Pack)" ₹349 and "36" ₹324; "Value
  (2 Packs)" and "36 x2" both ₹628) — six options where three are intended.

## Validation

- `pnpm typecheck` clean; `pnpm lint` 0 errors (5 pre-existing warnings); unit tests 60/60.
- E2E selectors for the PDP "Add to cart" scoped to `#pdp-buy-box` (cards now carry the same label).
- Visual QA at 1440px and 390px: home, all six collections, shop, two PDPs, cart, gifting, about,
  contact; pack picker exercised end to end (adds the chosen pack, opens the drawer, no console errors).

## Red Tea (teabags) photos — 2026-09-20

- Ran `pnpm migrate-product-images -- premium-herbal-red-tea-teabags`: photos 1–6 replaced with the
  new pack design (7–8 unchanged). Same content and claims as the set they replace, so no new §8 call.
- Why the new files didn't show: dropping files into `data/products/<slug>/` does nothing until that
  script runs, and even then the storefront keeps serving `unstable_cache`d product data — a script
  runs outside Next.js and can't revalidate. Added `POST /api/testing/revalidate` (dev-only, 404 in
  production, same guard as the other testing routes) to clear tags locally after a script:
  `curl -X POST localhost:3000/api/testing/revalidate -H 'content-type: application/json' -d '{"tags":["products"]}'`.
  In production, saving the product (or any product) once in the admin does the same.
- The pack-size cards on this PDP still use the older per-size images in `varients/` (1, 2, 4.png) —
  replace those and run `pnpm migrate-variant-images -- premium-herbal-red-tea-teabags` to match.

## Product page gallery — 2026-09-20

- Removed the empty bands above and below the main product photo (every PDP with ~6+ photos). The
  thumbnail rail sat beside the square frame in a flex row, so a tall rail (8–9 photos ≈ 740px)
  stretched the frame taller than it was wide and the square photo floated in the middle. The square
  photo now sets the block's height; the rail is fitted to it.
- The desktop thumbnail rail scrolls within that height and gets up/down buttons (shown only when
  there is more in that direction). Browsing with arrow keys/swipes keeps the active thumbnail in view
  inside the rail without scrolling the page — the old effect targeted the hidden mobile strip's
  buttons, because both rails shared one ref array.

## Pack selector and Blue Tea (teabags) packs — 2026-09-20

- PDP pack cards sit in one row that scrolls sideways (they wrapped onto 2–3 rows), with left/right
  arrows shown only when there is more in that direction, and keyboard selection kept in view. The
  fieldset needed `min-w-0` — a `<fieldset>` defaults to `min-inline-size: min-content`, which let the
  one-row rail stretch the phone page to 656px instead of scrolling.
- Blue Tea (teabags) now offers only Starter (1 Pack), Value (2 Packs) and Transformation (3 Packs)
  — the three `data/catalog.json` has always listed. Removed the older duplicate variants "36",
  "36 x2", "36 x4" (`pnpm remove-duplicate-blue-tea-teabag-variants`); their only order lines were
  test orders, and order history keeps its own snapshot. `lib/db/script-client.ts` now also exports
  `and` for scripts.
- `tests/e2e/checkout-tamper.spec.ts` hard-coded `variantId: 1` (one of the removed duplicates); it
  now reads a real variant id off a live product page.

## Homepage main banners — 2026-09-20

- New main banner set from `data/mainBanner/` (`MB<n>_W.png` desktop, `MB<n>_M.png` mobile): Spices →
  /collections/spices/, Blue Tea → /collections/blue-tea/, Red Tea → /collections/red-tea/, in file
  order. `pnpm migrate-homepage-banners` now reads that folder (`migrateBannerSet` takes a source dir).
  Their baked-in wellness phrasing falls under CLAUDE.md §8's standing homepage-banner exception.
- The main slider is full-bleed again (client: "fill the screen, no need for border") — no card,
  padding or page container (`fullBleed` prop, replaces `bare`). Section banners stay contained cards.
- Its dots and pause button moved to a slim row under the image; over it they covered the artwork's
  own bottom badge row.
- Banner uploads now also produce a 1920px derivative (`processImage` takes optional widths) — a
  full-width banner capped at 1200px rendered soft on wider screens.
- Removed the padded wrapper divs around the Red Tea, Spices and Black Tea section banners on the
  homepage — their padding stacked on the banner's own and left 88px of empty space above and below
  each (64px on phones). Now 32px (24px on phones), and a banner directly under another drops its
  top padding so the pair sits one gap apart instead of two.
