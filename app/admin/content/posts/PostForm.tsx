"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { TiptapEditor } from "@/components/admin/content/TiptapEditor";
import { TiptapRenderer } from "@/components/content/TiptapRenderer";
import { readingTimeMinutes, type TiptapDoc } from "@/lib/content/tiptap-schema";
import type { AdminPostDetail } from "@/lib/db/queries/admin-content";
import {
  createPostAction,
  updatePostAction,
  publishPostAction,
  unpublishPostAction,
  checkPostSlugAvailableAction,
  presignContentImageUploadAction,
  finalizeContentImageUploadAction,
} from "../actions";

const EMPTY_DOC: TiptapDoc = { type: "doc", content: [] };

export function PostForm({
  mode,
  post,
  products,
}: {
  mode: "create" | "edit";
  post?: AdminPostDetail;
  products: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [kind, setKind] = useState<"blog" | "recipe">(post?.kind ?? "blog");
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [author, setAuthor] = useState(post?.author ?? "Dishu Food and Beverages");
  const [body, setBody] = useState<TiptapDoc>((post?.body as TiptapDoc) ?? EMPTY_DOC);
  const [coverStorageKey, setCoverR2Key] = useState<string | null>(post?.coverStorageKey ?? null);
  const [coverUrl, setCoverUrl] = useState<string | null>(post?.coverUrl ?? null);
  const [coverAlt, setCoverAlt] = useState(post?.coverAlt ?? "");
  const [seoTitle, setSeoTitle] = useState(post?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(post?.seoDescription ?? "");
  const [relatedProductIds, setRelatedProductIds] = useState<number[]>(post?.relatedProductIds ?? []);
  const [scheduleAt, setScheduleAt] = useState("");
  const coverInputRef = useRef<HTMLInputElement>(null);

  function autoSlug(v: string) {
    return v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  async function uploadFile(file: File): Promise<{ url: string; storageKey: string } | null> {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Only JPEG, PNG or WEBP images are allowed.");
      return null;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("File is larger than 5MB.");
      return null;
    }
    const effectiveSlug = slug || autoSlug(title) || "untitled";
    const presign = await presignContentImageUploadAction({ slug: effectiveSlug, contentType: file.type as "image/jpeg" | "image/png" | "image/webp", contentLength: file.size });
    if (!presign.ok || !presign.data) {
      setError(presign.ok ? "Upload failed." : presign.error);
      return null;
    }
    const putRes = await fetch(presign.data.url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
    if (!putRes.ok) {
      setError("Upload to storage failed.");
      return null;
    }
    const finalize = await finalizeContentImageUploadAction({ slug: effectiveSlug, tmpKey: presign.data.tmpKey });
    if (!finalize.ok || !finalize.data) {
      setError(finalize.ok ? "Processing failed." : finalize.error);
      return null;
    }
    return finalize.data;
  }

  async function handleCoverChange(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const result = await uploadFile(file);
    if (result) {
      setCoverR2Key(result.storageKey);
      setCoverUrl(result.url);
    }
  }

  async function handleRequestBodyImage(): Promise<{ url: string; alt: string } | null> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/jpeg,image/png,image/webp";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        const result = await uploadFile(file);
        if (!result) return resolve(null);
        const alt = window.prompt("Alt text for this image (required for accessibility)") ?? "";
        resolve({ url: result.url, alt });
      };
      input.click();
    });
  }

  function toggleRelated(id: number) {
    setRelatedProductIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function buildPayload() {
    return { slug, kind, title, excerpt: excerpt || null, body, coverStorageKey, coverAlt: coverStorageKey ? coverAlt || null : null, author: author || null, seoTitle: seoTitle || null, seoDescription: seoDescription || null, relatedProductIds };
  }

  function handleSave() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const payload = buildPayload();
      const result = mode === "create" ? await createPostAction(payload) : await updatePostAction(post!.id, payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(result.message);
      if (mode === "create" && "data" in result && result.data) router.push(`/admin/content/posts/${result.data.id}`);
      else router.refresh();
    });
  }

  function handlePublishToggle() {
    if (!post) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = post.status === "published" ? await unpublishPostAction(post.id) : await publishPostAction({ id: post.id, publishedAt: scheduleAt || null });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(result.message);
      router.refresh();
    });
  }

  return (
    <div className="grid max-w-6xl grid-cols-1 gap-8 lg:grid-cols-2">
      <div className="space-y-6">
        {error && <div role="alert" className="rounded-md border border-crit/30 bg-crit/5 px-4 py-3 text-sm text-crit">{error}</div>}
        {notice && <div role="status" className="rounded-md border border-ok/30 bg-ok/5 px-4 py-3 text-sm text-ok">{notice}</div>}

        <section className="space-y-4 rounded-lg border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">Details</h2>
            {post && <Badge tone={post.status === "published" ? "ok" : "neutral"}>{post.status}</Badge>}
          </div>
          <div>
            <label htmlFor="title" className="mb-1 block text-sm font-medium text-ink">Title</label>
            <Input id="title" value={title} onChange={(e) => { setTitle(e.target.value); if (!slugTouched) setSlug(autoSlug(e.target.value)); }} />
          </div>
          <div>
            <label htmlFor="slug" className="mb-1 block text-sm font-medium text-ink">Slug</label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => { setSlugTouched(true); setSlug(autoSlug(e.target.value)); }}
              onBlur={async () => {
                if (!slug) return;
                const res = await checkPostSlugAvailableAction(slug, post?.id);
                if (!res.available) setError(`The slug "${slug}" is already used.`);
              }}
            />
          </div>
          <div>
            <label htmlFor="kind" className="mb-1 block text-sm font-medium text-ink">Kind</label>
            <select id="kind" value={kind} onChange={(e) => setKind(e.target.value as "blog" | "recipe")} className="h-11 w-full rounded-md border border-line bg-surface px-3.5 text-[0.95rem] text-ink">
              <option value="blog">Blog</option>
              <option value="recipe">Recipe</option>
            </select>
          </div>
          <div>
            <label htmlFor="author" className="mb-1 block text-sm font-medium text-ink">Author</label>
            <Input id="author" value={author} onChange={(e) => setAuthor(e.target.value)} />
          </div>
          <div>
            <label htmlFor="excerpt" className="mb-1 block text-sm font-medium text-ink">Excerpt</label>
            <Textarea id="excerpt" rows={2} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
          </div>
          <div>
            <p className="mb-1 text-sm font-medium text-ink">Cover image</p>
            {coverUrl && (
              <div className="relative mb-2 aspect-video overflow-hidden rounded-md bg-surface-2">
                <Image src={coverUrl} alt={coverAlt} fill sizes="500px" className="object-cover" />
              </div>
            )}
            <input ref={coverInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Cover image file" onChange={(e) => { void handleCoverChange(e.target.files); e.target.value = ""; }} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => coverInputRef.current?.click()}>
                {coverUrl ? "Replace cover" : "Upload cover"}
              </Button>
              {coverUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-crit"
                  onClick={() => {
                    setCoverR2Key(null);
                    setCoverUrl(null);
                    setCoverAlt("");
                  }}
                >
                  Remove cover
                </Button>
              )}
            </div>
            {coverUrl && (
              <div className="mt-3">
                <label htmlFor="coverAlt" className="mb-1 block text-sm font-medium text-ink">Cover image alt text</label>
                <Input id="coverAlt" value={coverAlt} onChange={(e) => setCoverAlt(e.target.value)} maxLength={200} placeholder="Describe the picture for screen readers" />
                <p className="mt-1 text-xs text-ink-3">Saved with the post — press Save changes.</p>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-line bg-surface p-5">
          <h2 className="font-display text-lg font-semibold text-ink">Body</h2>
          <p className="text-xs text-ink-3">~{readingTimeMinutes(body)} min read (computed from real word count)</p>
          <TiptapEditor content={body} onChange={setBody} onRequestImage={handleRequestBodyImage} />
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

        <section className="space-y-3 rounded-lg border border-line bg-surface p-5">
          <h2 className="font-display text-lg font-semibold text-ink">Related products</h2>
          <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {products.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-sm text-ink">
                <Checkbox checked={relatedProductIds.includes(p.id)} onCheckedChange={() => toggleRelated(p.id)} />
                {p.name}
              </label>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="solid-ink" disabled={pending} onClick={handleSave}>
            {mode === "create" ? "Create draft" : "Save changes"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setShowPreview((s) => !s)}>
            {showPreview ? "Hide preview" : "Show preview"}
          </Button>
          {post && (
            <div className="flex items-center gap-2">
              {post.status !== "published" && (
                <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} className="h-9 w-auto" aria-label="Schedule publish for, IST (optional)" title="Schedule for a date and time in IST — leave empty to publish now" />
              )}
              <Button type="button" variant={post.status === "published" ? "outline" : "gradient"} disabled={pending} onClick={handlePublishToggle}>
                {post.status === "published" ? "Unpublish" : scheduleAt ? "Schedule" : "Publish now"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {showPreview && (
        <div className="lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-lg border border-line bg-surface p-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-3">
              Live preview — the exact renderer the storefront uses
            </p>
            {coverUrl && (
              <div className="relative mb-4 aspect-video overflow-hidden rounded-md bg-surface-2">
                <Image src={coverUrl} alt="" fill sizes="500px" className="object-cover" />
              </div>
            )}
            <h1 className="font-display text-3xl font-semibold text-ink">{title || "Untitled"}</h1>
            <p className="mt-1 text-sm text-ink-3">By {author} · ~{readingTimeMinutes(body)} min read</p>
            <div className="mt-6">
              <TiptapRenderer doc={body} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
