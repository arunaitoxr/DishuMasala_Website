import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getPublishedPostBySlug, getRelatedProductsForPost } from "@/lib/db/queries/posts";
import { TiptapRenderer } from "@/components/content/TiptapRenderer";
import { readingTimeMinutes } from "@/lib/content/tiptap-schema";
import { PAGE_CONTAINER } from "@/lib/design-tokens";
import { cn } from "@/lib/cn";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug, "recipe");
  if (!post) return {};
  return {
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? post.excerpt ?? undefined,
    alternates: { canonical: `/recipes/${slug}` },
    openGraph: { images: post.coverUrl ? [post.coverUrl] : undefined },
  };
}

export default async function RecipePage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug, "recipe");
  if (!post) notFound();

  const related = await getRelatedProductsForPost(post.relatedProductIds, []);
  const minutes = readingTimeMinutes(post.body);

  // Recipe JSON-LD (PROMPTS.md Phase 8 item 7) — the flagship recipe is a brewing ritual, not a
  // food dish with quantified ingredient amounts, so `recipeIngredient` lists the product itself
  // and real, stated facts (lemon) rather than an invented quantity.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: post.title,
    description: post.excerpt ?? post.seoDescription ?? undefined,
    image: post.coverUrl ?? undefined,
    author: { "@type": "Organization", name: post.author ?? "Dishu Food and Beverages" },
    datePublished: post.publishedAt.toISOString(),
    recipeIngredient: ["Dishu Blue Tea (Butterfly Pea Flower blend)", "Lemon"],
    recipeCategory: "Beverage",
  };

  return (
    <div className={cn(PAGE_CONTAINER, "py-12 lg:py-16")}>
      <article className="max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Link href="/recipes" className="text-sm text-ink-2 underline underline-offset-4">← Recipes</Link>

      {post.coverUrl && (
        <div className="relative mt-4 aspect-video overflow-hidden rounded-lg bg-surface-2 shadow-card">
          <Image src={post.coverUrl} alt="" fill sizes="(max-width: 768px) 100vw, 768px" priority className="object-cover" />
        </div>
      )}

      <h1 className="mt-6 type-page-title text-ink">{post.title}</h1>
      <p className="mt-2 text-sm text-ink-3">
        {post.author && <>By {post.author} · </>}
        {post.publishedAt.toLocaleDateString("en-IN", { dateStyle: "medium" })} · ~{minutes} min read
      </p>

      <div className="mt-8">
        <TiptapRenderer doc={post.body} />
      </div>

      {related.length > 0 && (
        <section className="mt-12 border-t border-line pt-8">
          <h2 className="font-display text-lg font-semibold text-ink">Shop this ritual</h2>
          <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {related.map((p) => (
              <li key={p.id}>
                <Link href={`/product/${p.slug}`} className="group block">
                  {p.imageUrl && (
                    <div className="relative aspect-square overflow-hidden rounded-md bg-surface-2">
                      <Image src={p.imageUrl} alt={p.imageAlt ?? ""} fill sizes="200px" className="object-cover" />
                    </div>
                  )}
                  <p className="mt-1.5 text-sm font-medium text-ink group-hover:underline">{p.name}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      </article>
    </div>
  );
}
