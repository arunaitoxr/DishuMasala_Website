"use client";

import { useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/Accordion";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Chip } from "@/components/ui/Chip";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/Dialog";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from "@/components/ui/Drawer";
import { Input } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { PriceBlock } from "@/components/ui/PriceBlock";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { RadioGroup, RadioGroupItem } from "@/components/ui/RadioGroup";
import { Rating, RatingInput } from "@/components/ui/Rating";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { Separator } from "@/components/ui/Separator";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Textarea";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";
import { ProductCard } from "@/components/product/ProductCard";
import { Placeholder } from "@/components/media/Placeholder";
import { DESIGN_TOKEN_HEX, type DesignTokenName } from "@/lib/design-tokens";
import { AA_TEXT_MIN, contrastRatio, formatRatio } from "@/lib/contrast";
import { toPaise } from "@/lib/money";

function Section({ id, title, allowed, children }: { id: string; title: string; allowed?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="border-t border-line py-10 first:border-t-0 first:pt-0">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.015em] text-ink">{title}</h2>
        {allowed && <Badge tone="gold">§5.4 — {allowed}</Badge>}
      </div>
      {children}
    </section>
  );
}

function PaletteTable() {
  const names = Object.keys(DESIGN_TOKEN_HEX) as DesignTokenName[];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-[0.08em] text-ink-3">
            <th className="py-2 pr-4">Token</th>
            <th className="py-2 pr-4">Swatch</th>
            <th className="py-2 pr-4">Hex</th>
            <th className="py-2 pr-4">vs. ivory (bg)</th>
            <th className="py-2 pr-4">vs. white (surface)</th>
          </tr>
        </thead>
        <tbody>
          {names.map((name) => {
            const hex = DESIGN_TOKEN_HEX[name];
            const vsBg = contrastRatio(hex, DESIGN_TOKEN_HEX.bg);
            const vsSurface = contrastRatio(hex, DESIGN_TOKEN_HEX.surface);
            return (
              <tr key={name} className="border-b border-line/60">
                <td className="py-2 pr-4 font-mono text-xs text-ink-2">--color-{name}</td>
                <td className="py-2 pr-4">
                  <span className="inline-block size-6 rounded-sm border border-line" style={{ backgroundColor: hex }} />
                </td>
                <td className="tabular-nums py-2 pr-4 font-mono text-xs text-ink-3">{hex}</td>
                <td className={`tabular-nums py-2 pr-4 ${vsBg < AA_TEXT_MIN ? "text-crit" : "text-ink-2"}`}>
                  {formatRatio(vsBg)} {vsBg < AA_TEXT_MIN ? "(fails AA text)" : ""}
                </td>
                <td className={`tabular-nums py-2 pr-4 ${vsSurface < AA_TEXT_MIN ? "text-crit" : "text-ink-2"}`}>
                  {formatRatio(vsSurface)} {vsSurface < AA_TEXT_MIN ? "(fails AA text)" : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ToastDemo() {
  const { show } = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => show({ title: "Added to cart", description: "Blue Tea — Teabags (20 pk)", tone: "ok" })}>
        Trigger ok toast
      </Button>
      <Button size="sm" variant="outline" onClick={() => show({ title: "Low stock", description: "Only a few left.", tone: "warn" })}>
        Trigger warn toast
      </Button>
      <Button size="sm" variant="outline" onClick={() => show({ title: "Coupon invalid", description: "WELCOME5 is for first orders only.", tone: "crit" })}>
        Trigger crit toast
      </Button>
    </div>
  );
}

export interface DesignSystemContentProps {
  /** Rendered by the server-side page.tsx wrapper — TrustStrip is an async server component
   * (reads the free-shipping threshold from Postgres) and this file is a client component, so it
   * arrives pre-rendered as a slot rather than being imported and called directly here. */
  trustStrip: React.ReactNode;
}

export function DesignSystemContent({ trustStrip }: DesignSystemContentProps) {
  const [ratingValue, setRatingValue] = useState(0);
  const [qty, setQty] = useState(1);
  const [page, setPage] = useState(3);
  const [selectValue, setSelectValue] = useState("250g");

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <header className="mb-12">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">Dev-only · noindex</p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-[-0.02em] text-ink">Design system</h1>
        <p className="mt-3 max-w-2xl text-ink-2">
          Every component from <code className="font-mono text-sm">components/ui/</code> in every meaningful
          state, the palette with computed WCAG contrast, the type scale, and the Lemon Shift gradient in
          each placement CLAUDE.md §5.4 allows. This page is the Phase 1 sign-off reference.
        </p>
      </header>

      <Section id="palette" title="Palette & contrast">
        <PaletteTable />
      </Section>

      <Section id="type" title="Type scale">
        <div className="flex flex-col gap-8">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-ink-3">Hero — display 600, -0.02em</p>
            <p className="font-display font-semibold tracking-[-0.02em] text-ink" style={{ fontSize: "clamp(2.75rem, 6vw, 5rem)" }}>
              Brilliant blue, brewed
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-ink-3">Section title — display 600, -0.015em</p>
            <p className="font-display font-semibold tracking-[-0.015em] text-ink" style={{ fontSize: "clamp(1.75rem, 3vw, 2.75rem)" }}>
              The Lemon Shift
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-ink-3">Product name — sans 600, -0.01em</p>
            <p className="font-sans text-lg font-semibold tracking-[-0.01em] text-ink">Premium Herbal Blue Tea — Teabags</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-ink-3">Body — sans 400, 1rem/1.65</p>
            <p className="max-w-xl font-sans text-base leading-[1.65] text-ink-2">
              Butterfly pea flower tea that shifts from brilliant blue to violet to magenta the moment
              lemon hits the cup — grown and packed in Punjab.
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-ink-3">Eyebrow — sans 600, uppercase, 0.14em</p>
            <p className="font-sans text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">Signature blend</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-ink-3">Price / data — sans 600, tabular-nums</p>
            <p className="tabular-nums font-sans text-base font-semibold text-ink">₹349.00</p>
          </div>
        </div>
      </Section>

      <Section id="gradient" title="Lemon Shift — allowed placements">
        <p className="mb-2 max-w-2xl text-sm text-ink-2">
          CLAUDE.md §5.4 bans more than one gradient surface in a single viewport (hero excepted).
          Each placement below is deliberately given its own generously spaced, near-full-height
          slot — even on this reference gallery — so scrolling through never shows two at once; see
          the phase report for the scripted, multi-viewport check that confirms this.
        </p>
        <div className="flex flex-col" data-gradient-gallery="true">
          <div className="flex min-h-screen flex-col justify-center gap-3 border-b border-line/60">
            <Badge tone="gold" className="w-fit">Hero canvas stand-in</Badge>
            <div className="h-40 rounded-md sm:h-56" data-gradient-demo="true" style={{ backgroundImage: "var(--gradient-lemon-shift)" }} />
          </div>
          <div className="flex min-h-screen flex-col justify-center gap-3 border-b border-line/60">
            <Badge tone="gold" className="w-fit">CTA fill (brew-cool — see Button.tsx comment)</Badge>
            <div data-gradient-demo="true" className="w-fit">
              <Button variant="gradient" size="lg">Shop Blue Tea</Button>
            </div>
          </div>
          <div className="flex min-h-screen flex-col justify-center gap-3 border-b border-line/60">
            <Badge tone="gold" className="w-fit">Blue Tea / Red Tea collection tile</Badge>
            <div className="flex h-40 max-w-xs items-end rounded-md p-4 sm:h-56" data-gradient-demo="true" style={{ backgroundImage: "var(--gradient-lemon-shift)" }}>
              <span className="font-display text-lg font-semibold text-ink">Blue Tea</span>
            </div>
          </div>
          <div className="flex min-h-screen flex-col justify-center gap-3 border-b border-line/60">
            <Badge tone="gold" className="w-fit">Section-divider rule</Badge>
            <Separator gradient data-gradient-demo="true" className="max-w-md" />
          </div>
          <div className="flex min-h-screen flex-col justify-center gap-3 border-b border-line/60">
            <Badge tone="gold" className="w-fit">Free-shipping progress bar</Badge>
            <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-surface-2">
              <div className="h-full w-[62%] rounded-full" data-gradient-demo="true" style={{ backgroundImage: "var(--gradient-lemon-shift)" }} />
            </div>
            <p className="text-xs text-ink-3">₹190 away from free shipping</p>
          </div>
          <div className="flex min-h-screen flex-col justify-center gap-3 border-b border-line/60">
            <Badge tone="gold" className="w-fit">PDP brew-story stand-in</Badge>
            <div data-gradient-demo="true" className="w-fit">
              <Placeholder slot="pdp-brew-story-blue-tea" className="max-w-sm" />
            </div>
          </div>
          <div className="flex min-h-screen flex-col justify-center gap-3">
            <Badge tone="gold" className="w-fit">Footer top edge (6px)</Badge>
            <div className="h-1.5 w-full max-w-md rounded-full" data-gradient-demo="true" style={{ backgroundImage: "var(--gradient-lemon-shift)" }} />
          </div>
        </div>
      </Section>

      <Section id="trust-strip" title="TrustStrip">
        <div className="overflow-hidden rounded-md border border-line">{trustStrip}</div>
      </Section>

      <Section id="buttons" title="Button">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="gradient">Gradient</Button>
            <Button variant="solid-ink">Solid ink</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
            <Button asChild>
              <a href="#buttons">asChild (renders an &lt;a&gt;)</a>
            </Button>
          </div>
        </div>
      </Section>

      <Section id="forms" title="Form controls">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ds-input" className="text-sm font-medium text-ink">Input — default</label>
            <Input id="ds-input" placeholder="you@example.com" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ds-input-invalid" className="text-sm font-medium text-ink">Input — invalid</label>
            <Input id="ds-input-invalid" invalid defaultValue="not-an-email" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ds-input-disabled" className="text-sm font-medium text-ink">Input — disabled</label>
            <Input id="ds-input-disabled" disabled placeholder="Disabled" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ds-textarea" className="text-sm font-medium text-ink">Textarea</label>
            <Textarea id="ds-textarea" placeholder="Write a review…" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink" id="ds-select-label">Select</label>
            <Select value={selectValue} onValueChange={setSelectValue}>
              <SelectTrigger aria-labelledby="ds-select-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="100g">100g</SelectItem>
                <SelectItem value="250g">250g</SelectItem>
                <SelectItem value="500g">500g</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink">Checkbox</span>
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <Checkbox defaultChecked /> Subscribe to restock alerts
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-2 opacity-50">
              <Checkbox disabled /> Disabled
            </label>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink">Radio group</span>
            <RadioGroup defaultValue="teabags" className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-ink-2">
                <RadioGroupItem value="teabags" /> Teabags
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-2">
                <RadioGroupItem value="loose" /> Loose leaf
              </label>
            </RadioGroup>
          </div>
        </div>
      </Section>

      <Section id="badges-chips" title="Badge & Chip">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">Neutral</Badge>
          <Badge tone="ok">In stock</Badge>
          <Badge tone="warn">Low stock</Badge>
          <Badge tone="crit">Out of stock</Badge>
          <Badge tone="gold">Featured</Badge>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Chip selected>250g (selected)</Chip>
          <Chip>500g</Chip>
          <Chip disabled>1kg (disabled)</Chip>
          <Chip accentColor="var(--color-hibiscus)">Red Tea</Chip>
        </div>
      </Section>

      <Section id="accordion" title="Accordion">
        <Accordion type="single" collapsible className="max-w-xl" defaultValue="brew">
          <AccordionItem value="brew">
            <AccordionTrigger>How do I brew Blue Tea?</AccordionTrigger>
            <AccordionContent>Steep one teabag in hot water for 4–5 minutes. Add lemon to watch it shift.</AccordionContent>
          </AccordionItem>
          <AccordionItem value="ship">
            <AccordionTrigger>Shipping & delivery</AccordionTrigger>
            <AccordionContent>Free shipping over the site-wide threshold.</AccordionContent>
          </AccordionItem>
        </Accordion>
      </Section>

      <Section id="tabs" title="Tabs">
        <Tabs defaultValue="desc" className="max-w-xl">
          <TabsList>
            <TabsTrigger value="desc">Description</TabsTrigger>
            <TabsTrigger value="ingredients">Ingredients</TabsTrigger>
            <TabsTrigger value="brew">Brew guide</TabsTrigger>
          </TabsList>
          <TabsContent value="desc">Butterfly pea flower tea, whole-flower, single-origin.</TabsContent>
          <TabsContent value="ingredients">100% dried butterfly pea flowers.</TabsContent>
          <TabsContent value="brew">4–5 min steep, 90–95°C water.</TabsContent>
        </Tabs>
      </Section>

      <Section id="tooltip" title="Tooltip">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm">Hover or focus me</Button>
            </TooltipTrigger>
            <TooltipContent>Inclusive of all taxes</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </Section>

      <Section id="dialog-drawer" title="Dialog & Drawer">
        <div className="flex flex-wrap gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle className="font-display text-lg font-semibold text-ink">Confirm</DialogTitle>
              <DialogDescription className="mt-2 text-sm text-ink-2">
                Escape closes this, and focus returns to the trigger button.
              </DialogDescription>
              <div className="mt-5 flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="solid-ink">Confirm</Button>
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>

          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="outline">Open drawer</Button>
            </DrawerTrigger>
            <DrawerContent side="right">
              <DrawerTitle className="font-display text-lg font-semibold text-ink">Cart preview</DrawerTitle>
              <DrawerDescription className="mt-2 text-sm text-ink-2">
                Focus is trapped inside this panel; Escape closes it and returns focus to the trigger.
              </DrawerDescription>
              <div className="mt-5">
                <DrawerClose asChild>
                  <Button variant="outline" size="sm">Close</Button>
                </DrawerClose>
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </Section>

      <Section id="skeleton-separator" title="Skeleton & Separator">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-14 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>
          <Separator />
        </div>
      </Section>

      <Section id="rating" title="Rating">
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-1 text-xs text-ink-3">Read-only, with count</p>
            <Rating value={4.5} count={128} />
          </div>
          <div>
            <p className="mb-1 text-xs text-ink-3">Read-only, no count</p>
            <Rating value={3} />
          </div>
          <div>
            <p className="mb-1 text-xs text-ink-3">Interactive (current: {ratingValue || "none"})</p>
            <RatingInput value={ratingValue} onChange={setRatingValue} aria-label="Rate this product" />
          </div>
        </div>
      </Section>

      <Section id="quantity" title="QuantityStepper">
        <QuantityStepper value={qty} onChange={setQty} min={1} max={10} aria-label="Quantity" />
      </Section>

      <Section id="price" title="PriceBlock">
        <div className="grid gap-6 sm:grid-cols-3">
          <div>
            <p className="mb-1 text-xs text-ink-3">With discount</p>
            <PriceBlock mrpPaise={toPaise(399)} pricePaise={toPaise(299)} />
          </div>
          <div>
            <p className="mb-1 text-xs text-ink-3">Price === MRP (no strike, no chip)</p>
            <PriceBlock mrpPaise={toPaise(199)} pricePaise={toPaise(199)} />
          </div>
          <div>
            <p className="mb-1 text-xs text-ink-3">Large, PDP-sized</p>
            <PriceBlock mrpPaise={toPaise(899)} pricePaise={toPaise(649)} size="lg" />
          </div>
        </div>
      </Section>

      <Section id="toast" title="Toast">
        <ToastDemo />
      </Section>

      <Section id="pagination" title="Pagination">
        <Pagination page={page} totalPages={8} onPageChange={setPage} />
      </Section>

      <Section id="product-card" title="ProductCard">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <ProductCard
            slug="premium-herbal-blue-tea-teabags"
            name="Premium Herbal Blue Tea — Teabags"
            collectionSlug="blue-tea"
            collectionTitle="Blue Tea"
            tags={["blue-tea-teabags", "tea"]}
            optionLabel="Teabags"
            optionValues={["20 pk"]}
            mrpPaise={toPaise(349)}
            pricePaise={toPaise(299)}
            priority={1}
            rating={{ value: 4.6, count: 42 }}
          />
          <ProductCard
            slug="classic-tea-250gm"
            name="Classic Tea"
            collectionSlug="classic-teas"
            collectionTitle="Black Tea"
            optionLabel="Size"
            optionValues={["250g"]}
            mrpPaise={toPaise(199)}
            pricePaise={toPaise(199)}
            priority={3}
          />
          <ProductCard
            slug="turmeric-powder-haldi-powder"
            name="Turmeric Powder (Haldi)"
            collectionSlug="spices"
            collectionTitle="Spices"
            tags={["powder", "spices", "turmeric"]}
            optionLabel="Size"
            optionValues={["100g", "250g"]}
            mrpPaise={toPaise(149)}
            pricePaise={toPaise(119)}
            priority={5}
          />
        </div>
        <p className="mt-4 text-sm text-ink-2">
          Left: single image, has a rating. Middle: no image (falls back to the placeholder slot), no
          rating, single variant, price === MRP. Right: multi-variant with a discount. All three
          reserve their image box up front via a fixed 1:1 aspect-ratio, so none of them shift layout.
        </p>
      </Section>

      <Section id="placeholders" title="Placeholder system">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs text-ink-3">product-packshot-generic (1:1)</p>
            <Placeholder slot="product-packshot-generic" className="max-w-48" />
          </div>
          <div>
            <p className="mb-1 text-xs text-ink-3">lifestyle-sourced-punjab (4:5)</p>
            <Placeholder slot="lifestyle-sourced-punjab" className="max-w-48" />
          </div>
        </div>
        <p className="mt-3 text-sm text-ink-2">Full manifest and swap instructions live in PLACEHOLDERS.md.</p>
      </Section>
    </div>
  );
}
