import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedPageBySlug } from "@/lib/db/queries/pages";
import { TiptapRenderer } from "@/components/content/TiptapRenderer";
import { isReservedRouteSlug } from "@/lib/content/page-slugs";
import { PAGE_CONTAINER } from "@/lib/design-tokens";
import { cn } from "@/lib/cn";

/**
 * Any page created in the admin (Content → Pages), served at `/<slug>` — pages used to be stored but
 * unreachable, because only the four legal pages had routes. Every existing route (shop, cart, the
 * legal pages, …) is a static segment and always wins over this one; page slugs that would collide
 * with them are refused in the admin (lib/content/page-slugs.ts). Drafts and unknown slugs are 404.
 */
type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || isReservedRouteSlug(slug)) return null;
  return getPublishedPageBySlug(slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await load(slug);
  if (!page) return {};
  return { title: page.title, alternates: { canonical: `/${slug}` } };
}

export default async function ContentPage({ params }: Props) {
  const { slug } = await params;
  const page = await load(slug);
  if (!page) notFound();
  return (
    <div className={cn(PAGE_CONTAINER, "py-12 lg:py-16")}>
      <article className="max-w-3xl">
        <h1 className="type-page-title text-ink">{page.title}</h1>
        <div className="mt-8">
          <TiptapRenderer doc={page.body} />
        </div>
      </article>
    </div>
  );
}
