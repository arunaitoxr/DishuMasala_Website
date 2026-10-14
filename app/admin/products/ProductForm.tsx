"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { AdminProductDetail, AdminVariantRow } from "@/lib/db/queries/admin-products";
import {
  createProductAction,
  updateProductAction,
  publishProductAction,
  unpublishProductAction,
  checkSlugAvailableAction,
} from "./actions";
import { ProductImages } from "./ProductImages";

interface CollectionOption {
  id: number;
  title: string;
}

type VariantDraft = {
  id?: number;
  sku: string;
  optionValue: string;
  mrpRupees: string;
  priceRupees: string;
  weightGrams: string;
  inStock: boolean;
  stockQty: string;
  position: number;
};

function toVariantDraft(v: AdminVariantRow): VariantDraft {
  return {
    id: v.id,
    sku: v.sku,
    optionValue: v.optionValue,
    mrpRupees: (v.mrpPaise / 100).toString(),
    priceRupees: (v.pricePaise / 100).toString(),
    weightGrams: v.weightGrams != null ? String(v.weightGrams) : "",
    inStock: v.inStock,
    stockQty: v.stockQty != null ? String(v.stockQty) : "",
    position: v.position,
  };
}

function emptyVariant(position: number): VariantDraft {
  return { sku: "", optionValue: "", mrpRupees: "", priceRupees: "", weightGrams: "", inStock: true, stockQty: "", position };
}

/** Live paise preview for a rupee input — same rounding rule as lib/money.ts's toPaise, so what's
 * shown here always matches what the server will actually store (PROMPTS.md's explicit "show the
 * resulting paise value next to the input so it's never a guess"). */
function previewPaise(rupees: string): string {
  const n = Number(rupees);
  if (!Number.isFinite(n) || rupees.trim() === "") return "—";
  return `${Math.round(n * 100).toLocaleString("en-IN")} paise`;
}

export function ProductForm({
  mode,
  product,
  collections,
}: {
  mode: "create" | "edit";
  product?: AdminProductDetail;
  collections: CollectionOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [slugWarning, setSlugWarning] = useState<string | null>(null);
  const [collectionId, setCollectionId] = useState<number>(product?.collectionId ?? collections[0]?.id ?? 0);
  const [shortDescription, setShortDescription] = useState(product?.shortDescription ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [ingredients, setIngredients] = useState(product?.ingredients ?? "");
  const [brewGuide, setBrewGuide] = useState(product?.brewGuide ?? "");
  const [tagsText, setTagsText] = useState((product?.tags ?? []).join(", "));
  const [optionLabel, setOptionLabel] = useState(product?.optionLabel ?? "Size");
  const [priority, setPriority] = useState(product?.priority ?? 3);
  const [seoTitle, setSeoTitle] = useState(product?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(product?.seoDescription ?? "");
  const [variants, setVariants] = useState<VariantDraft[]>(
    product?.variants.length ? product.variants.map(toVariantDraft) : [emptyVariant(0)],
  );

  const originalSlug = product?.slug;
  const isLiveProduct = product?.status === "published";

  function autoSlug(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(autoSlug(value));
  }

  async function handleSlugBlur() {
    if (!slug) return;
    if (isLiveProduct && originalSlug && slug !== originalSlug) {
      setSlugWarning(
        `This product is live. Changing its slug from "${originalSlug}" to "${slug}" will break its current URL — no redirect exists yet, so set one up separately or search engines/bookmarks pointing at the old URL will 404.`,
      );
    } else {
      setSlugWarning(null);
    }
    const res = await checkSlugAvailableAction(slug, product?.id);
    if (!res.available) setError(`The slug "${slug}" is already used by another product.`);
    else if (error?.startsWith("The slug")) setError(null);
  }

  function updateVariant(index: number, patch: Partial<VariantDraft>) {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }

  function addVariant() {
    setVariants((prev) => [...prev, emptyVariant(prev.length)]);
  }

  function removeVariant(index: number) {
    setVariants((prev) => prev.filter((_, i) => i !== index).map((v, i) => ({ ...v, position: i })));
  }

  function moveVariant(index: number, dir: -1 | 1) {
    setVariants((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((v, i) => ({ ...v, position: i }));
    });
  }

  const tags = useMemo(
    () => tagsText.split(",").map((t) => t.trim()).filter(Boolean),
    [tagsText],
  );

  function buildPayload() {
    return {
      slug,
      name,
      collectionId,
      shortDescription: shortDescription || null,
      description: description || null,
      ingredients: ingredients || null,
      brewGuide: brewGuide || null,
      tags,
      optionLabel,
      priority,
      seoTitle: seoTitle || null,
      seoDescription: seoDescription || null,
      variants: variants.map((v, i) => ({
        id: v.id,
        sku: v.sku,
        optionValue: v.optionValue,
        mrpRupees: Number(v.mrpRupees),
        priceRupees: Number(v.priceRupees),
        weightGrams: v.weightGrams ? Number(v.weightGrams) : null,
        inStock: v.inStock,
        stockQty: v.stockQty ? Number(v.stockQty) : null,
        position: i,
      })),
    };
  }

  function handleSave() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const payload = buildPayload();
      const result =
        mode === "create" ? await createProductAction(payload) : await updateProductAction(product!.id, payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(result.message);
      if (mode === "create" && "data" in result && result.data) {
        router.push(`/admin/products/${result.data.id}`);
      } else {
        router.refresh();
      }
    });
  }

  function handlePublishToggle() {
    if (!product) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = product.status === "published" ? await unpublishProductAction(product.id) : await publishProductAction(product.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(result.message);
      router.refresh();
    });
  }

  return (
    <div className="max-w-3xl space-y-8">
      {error && (
        <div role="alert" className="rounded-md border border-crit/30 bg-crit/5 px-4 py-3 text-sm text-crit">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-md border border-ok/30 bg-ok/5 px-4 py-3 text-sm text-ok">
          {notice}
        </div>
      )}

      <section className="space-y-4 rounded-lg border border-line bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">Details</h2>
          {product && (
            <Badge tone={product.status === "published" ? "ok" : product.status === "archived" ? "crit" : "neutral"}>
              {product.status === "archived" ? "deleted (archived)" : product.status}
            </Badge>
          )}
        </div>

        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-ink">Name</label>
          <Input id="name" value={name} onChange={(e) => handleNameChange(e.target.value)} />
        </div>

        <div>
          <label htmlFor="slug" className="mb-1 block text-sm font-medium text-ink">Slug</label>
          <Input
            id="slug"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(autoSlug(e.target.value));
            }}
            onBlur={handleSlugBlur}
          />
          {slugWarning && <p className="mt-1.5 text-sm text-warn">{slugWarning}</p>}
        </div>

        <div>
          <label htmlFor="collection" className="mb-1 block text-sm font-medium text-ink">Collection</label>
          <select
            id="collection"
            value={collectionId}
            onChange={(e) => setCollectionId(Number(e.target.value))}
            className="h-11 w-full rounded-md border border-line bg-surface px-3.5 text-[0.95rem] text-ink"
          >
            {collections.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="optionLabel" className="mb-1 block text-sm font-medium text-ink">Option label</label>
            <Input id="optionLabel" value={optionLabel} onChange={(e) => setOptionLabel(e.target.value)} placeholder="Size / Combo / Teabags" />
          </div>
          <div>
            <label htmlFor="priority" className="mb-1 block text-sm font-medium text-ink">Priority</label>
            <Input id="priority" type="number" min={1} max={99} value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
          </div>
        </div>

        <div>
          <label htmlFor="tags" className="mb-1 block text-sm font-medium text-ink">Tags (comma-separated)</label>
          <Input id="tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="blue-tea, caffeine-free" />
        </div>

        <div>
          <label htmlFor="shortDescription" className="mb-1 block text-sm font-medium text-ink">Short description</label>
          <Textarea id="shortDescription" rows={2} value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} />
        </div>
        <div>
          <label htmlFor="description" className="mb-1 block text-sm font-medium text-ink">Description</label>
          <Textarea id="description" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ingredients" className="mb-1 block text-sm font-medium text-ink">Ingredients</label>
          <Textarea id="ingredients" rows={3} value={ingredients} onChange={(e) => setIngredients(e.target.value)} />
        </div>
        <div>
          <label htmlFor="brewGuide" className="mb-1 block text-sm font-medium text-ink">Brew guide</label>
          <Textarea id="brewGuide" rows={3} value={brewGuide} onChange={(e) => setBrewGuide(e.target.value)} />
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-line bg-surface p-5">
        <h2 className="font-display text-lg font-semibold text-ink">SEO</h2>
        <div>
          <label htmlFor="seoTitle" className="mb-1 block text-sm font-medium text-ink">SEO title</label>
          <Input id="seoTitle" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} maxLength={70} />
        </div>
        <div>
          <label htmlFor="seoDescription" className="mb-1 block text-sm font-medium text-ink">SEO description</label>
          <Textarea id="seoDescription" rows={2} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} maxLength={200} />
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-line bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">Variants</h2>
          <Button type="button" variant="outline" size="sm" onClick={addVariant}>Add variant</Button>
        </div>

        <ul className="space-y-4">
          {variants.map((v, i) => (
            <li key={v.id ?? `new-${i}`} className="rounded-md border border-line p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">Variant {i + 1}</span>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => moveVariant(i, -1)} className="rounded px-2 py-1 text-sm text-ink-2 hover:bg-surface-2 disabled:opacity-30">↑</button>
                  <button type="button" aria-label="Move down" disabled={i === variants.length - 1} onClick={() => moveVariant(i, 1)} className="rounded px-2 py-1 text-sm text-ink-2 hover:bg-surface-2 disabled:opacity-30">↓</button>
                  <button type="button" aria-label={`Remove variant ${i + 1}`} onClick={() => removeVariant(i)} className="rounded px-2 py-1 text-sm text-crit hover:bg-crit/10">Remove</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`variant-${i}-sku`} className="mb-1 block text-xs font-medium text-ink-2">SKU</label>
                  <Input id={`variant-${i}-sku`} value={v.sku} onChange={(e) => updateVariant(i, { sku: e.target.value })} />
                </div>
                <div>
                  <label htmlFor={`variant-${i}-optionValue`} className="mb-1 block text-xs font-medium text-ink-2">Option value</label>
                  <Input id={`variant-${i}-optionValue`} value={v.optionValue} onChange={(e) => updateVariant(i, { optionValue: e.target.value })} />
                </div>
                <div>
                  <label htmlFor={`variant-${i}-mrp`} className="mb-1 block text-xs font-medium text-ink-2">MRP (₹)</label>
                  <Input id={`variant-${i}-mrp`} type="number" step="0.01" value={v.mrpRupees} onChange={(e) => updateVariant(i, { mrpRupees: e.target.value })} />
                  <p className="mt-1 text-xs text-ink-3">{previewPaise(v.mrpRupees)}</p>
                </div>
                <div>
                  <label htmlFor={`variant-${i}-price`} className="mb-1 block text-xs font-medium text-ink-2">Price (₹)</label>
                  <Input id={`variant-${i}-price`} type="number" step="0.01" value={v.priceRupees} onChange={(e) => updateVariant(i, { priceRupees: e.target.value })} />
                  <p className="mt-1 text-xs text-ink-3">{previewPaise(v.priceRupees)}</p>
                </div>
                <div>
                  <label htmlFor={`variant-${i}-weight`} className="mb-1 block text-xs font-medium text-ink-2">Weight (grams)</label>
                  <Input id={`variant-${i}-weight`} type="number" value={v.weightGrams} onChange={(e) => updateVariant(i, { weightGrams: e.target.value })} />
                </div>
                <div>
                  <label htmlFor={`variant-${i}-stockQty`} className="mb-1 block text-xs font-medium text-ink-2">Stock count (optional)</label>
                  <Input id={`variant-${i}-stockQty`} type="number" value={v.stockQty} onChange={(e) => updateVariant(i, { stockQty: e.target.value })} placeholder="Leave blank if unknown" />
                </div>
              </div>
              <label htmlFor={`variant-${i}-inStock`} className="mt-3 flex items-center gap-2 text-sm text-ink">
                <Checkbox id={`variant-${i}-inStock`} checked={v.inStock} onCheckedChange={(c) => updateVariant(i, { inStock: c === true })} />
                In stock
              </label>
            </li>
          ))}
        </ul>
      </section>

      {product ? (
        // The SAVED slug: uploads are keyed under it on the server, so an unsaved slug edit mustn't leak in.
        <ProductImages productId={product.id} productSlug={product.slug} images={product.images} onChanged={() => router.refresh()} />
      ) : (
        <section className="rounded-lg border border-line bg-surface-2 p-5 text-sm text-ink-2">
          Save the product first — images (and the publish step, which requires alt text on every
          image) become available once it has an id.
        </section>
      )}

      <div className="flex items-center gap-3">
        <Button type="button" variant="solid-ink" disabled={pending} onClick={handleSave}>
          {mode === "create" ? "Create draft" : "Save changes"}
        </Button>
        {product && product.status !== "archived" && (
          <Button type="button" variant={product.status === "published" ? "outline" : "gradient"} disabled={pending} onClick={handlePublishToggle}>
            {product.status === "published" ? "Unpublish" : "Publish"}
          </Button>
        )}
      </div>
    </div>
  );
}
