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
