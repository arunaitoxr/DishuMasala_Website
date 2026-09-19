import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getPublishedPosts } from "@/lib/db/queries/posts";
import { PAGE_CONTAINER } from "@/lib/design-tokens";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Blog — Dishu Food and Beverages",
  description: "Stories, brewing guides and notes from Dishu Food and Beverages.",
  alternates: { canonical: "/blog" },
};

export default async function BlogIndexPage() {
  const posts = await getPublishedPosts("blog");

  return (
    <div className={cn(PAGE_CONTAINER, "py-12 lg:py-16")}>
      <h1 className="type-page-title text-ink">Blog</h1>
      <p className="mt-2 max-w-xl text-ink-2">Stories and notes from Dishu Food and Beverages.</p>

      {posts.length === 0 ? (
        <p className="mt-10 text-ink-2">Nothing published yet — check back soon.</p>
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2">
          {posts.map((post) => (
            <li key={post.id}>
              <Link href={`/blog/${post.slug}`} className="group block">
                {post.coverUrl && (
                  <div className="relative mb-3 aspect-video overflow-hidden rounded-lg bg-surface-2 shadow-card">
                    <Image src={post.coverUrl} alt="" fill sizes="(max-width: 640px) 100vw, 480px" className="object-cover transition-transform duration-200 group-hover:scale-[1.02]" />
                  </div>
                )}
                <h2 className="font-display text-xl font-semibold text-ink group-hover:underline">{post.title}</h2>
                {post.excerpt && <p className="mt-1 text-sm text-ink-2">{post.excerpt}</p>}
                <p className="mt-2 text-xs text-ink-3">
                  {new Date(post.publishedAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
