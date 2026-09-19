import { getFreeGiftThresholdPaise } from "@/lib/db/queries/settings";
import { formatINR } from "@/lib/money";

function PackagingIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5 shrink-0 text-white sm:size-6" aria-hidden="true">
      <rect x="3.5" y="8" width="17" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 12h17M8 8V6.5A2.5 2.5 0 0 1 10.5 4h3A2.5 2.5 0 0 1 16 6.5V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function GiftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5 shrink-0 text-white sm:size-6" aria-hidden="true">
      <rect x="3.5" y="10" width="17" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 10h17M12 10v10" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 10c0-3-2.5-4.5-4-4.5S6 7 6 8s1 2 2.5 2H12Zm0 0c0-3 2.5-4.5 4-4.5S18 7 18 8s-1 2-2.5 2H12Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SourcedIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5 shrink-0 text-white sm:size-6" aria-hidden="true">
      <path d="M12 21c0-5 2.5-8.5 7-10-.5 5-3 8.5-7 10Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 21c0-4.2-2-7.2-5.5-8.6C7 16.6 9 19.7 12 21Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 21v-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function CustomersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5 shrink-0 text-white sm:size-6" aria-hidden="true">
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 20c0-3.6 2.5-6 5.5-6s5.5 2.4 5.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M15.5 5.2c1.4.4 2.5 1.7 2.5 3.3s-1.1 2.9-2.5 3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 14.3c2.3.5 4 2.6 4 5.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Trust strip — client-directed content (2026-09-17): double-layer packaging, the real free-gift
 * threshold, "Thousands of happy customers" and sourcing. (Free shipping moved to the announcement
 * bar only, 2026-09-20 — it was stated twice within the first 175px.) "Sourced in Punjab" was dropped per that same request (it wasn't in the new copy given).
 *
 * **Logged exception (2026-09-17), same standing pattern as CLAUDE.md §8's logged banner-copy
 * exceptions:** "Thousands of happy customers" is a customer-count claim with no real, verifiable
 * number behind it anywhere in this codebase — CLAUDE.md §8 bans inventing exactly this kind of
 * claim, and it was flagged to the client directly before being added. The client's explicit
 * answer was to use it anyway, unverified. Treated as that specific decision, not a precedent for
 * inventing other numbers elsewhere — a different unverified claim would need the same explicit
 * call made again, not an assumption that this entry covers it.
 *
 * Broad, prominent padding and centered on desktop, with smooth marquee on narrow viewports.
 */
export async function TrustStrip() {
  // Free shipping is deliberately not repeated here: the announcement bar directly above the
  // header already states it on every page, and saying it twice in the first 175px wasted the most
  // valuable strip on the page.
  const freeGiftThresholdPaise = await getFreeGiftThresholdPaise();

  const items = [
    { icon: <PackagingIcon />, label: "Double-layer packaging" },
    ...(freeGiftThresholdPaise != null
      ? [{ icon: <GiftIcon />, label: `Free gift on orders above ${formatINR(freeGiftThresholdPaise)}` }]
      : []),
    { icon: <CustomersIcon />, label: "Thousands of happy customers" },
    // Added 2026-09-17 on the client's written bug list ("add : Sourced from the Best specified
    // areas"). Verifiable-sourcing phrasing, so no §8 exception needed — it names a sourcing
    // practice, not a certification, award or health outcome.
    { icon: <SourcedIcon />, label: "Sourced from the best specified areas" },
  ];

  function list(ariaHidden: boolean) {
    return (
      <ul aria-hidden={ariaHidden || undefined} className={`flex shrink-0 items-center ${ariaHidden ? "trust-marquee-duplicate" : ""}`}>
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-3 px-6 py-4 sm:px-8 text-white">
            {item.icon}
            <span className="whitespace-nowrap text-[15px] font-semibold text-white">{item.label}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-label="Why shop with us" className="w-full bg-brew-1 text-white border-y border-brew-1/30">
      {/* One continuously scrolling single line at EVERY viewport (client bug list, 2026-09-17:
       * "move left to right in mobile / desktop view both - Single line"). Previously desktop got a
       * static centered row and only mobile scrolled, which meant the fifth item pushed the desktop
       * row into wrapping. A marquee has no such ceiling, so items can be added without re-tuning
       * the layout. `prefers-reduced-motion` still freezes the track and drops the duplicate copy
       * (app/globals.css), leaving one readable static line. */}
      <div className="overflow-hidden">
        <div className="trust-marquee-track">
          {list(false)}
          {list(true)}
        </div>
      </div>
    </section>
  );
}
