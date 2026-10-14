"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { TiptapEditor } from "@/components/admin/content/TiptapEditor";
import { TiptapRenderer } from "@/components/content/TiptapRenderer";
import type { TiptapDoc } from "@/lib/content/tiptap-schema";
import type { AdminPageDetail } from "@/lib/db/queries/admin-content";
import {
  createPageAction,
  updatePageAction,
  publishPageAction,
  unpublishPageAction,
  checkPageSlugAvailableAction,
  presignContentImageUploadAction,
  finalizeContentImageUploadAction,
} from "../actions";

const EMPTY_DOC: TiptapDoc = { type: "doc", content: [] };

export function PageForm({ mode, page }: { mode: "create" | "edit"; page?: AdminPageDetail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const [title, setTitle] = useState(page?.title ?? "");
  const [slug, setSlug] = useState(page?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [body, setBody] = useState<TiptapDoc>((page?.body as TiptapDoc) ?? EMPTY_DOC);

  function autoSlug(v: string) {
    return v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  async function handleRequestImage(): Promise<{ url: string; alt: string } | null> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/jpeg,image/png,image/webp";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        // Every failure is shown — an inline-image upload used to fail silently here.
        const fail = (message: string) => {
          setError(message);
          resolve(null);
        };
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return fail("Only JPEG, PNG or WEBP images are allowed.");
        if (file.size > 5 * 1024 * 1024) return fail("File is larger than 5MB.");
        const effectiveSlug = slug || autoSlug(title) || "untitled";
        const presign = await presignContentImageUploadAction({ slug: effectiveSlug, contentType: file.type as "image/jpeg" | "image/png" | "image/webp", contentLength: file.size });
        if (!presign.ok || !presign.data) return fail(presign.ok ? "Upload failed." : presign.error);
        const putRes = await fetch(presign.data.url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        if (!putRes.ok) return fail("Upload to storage failed.");
        const finalize = await finalizeContentImageUploadAction({ slug: effectiveSlug, tmpKey: presign.data.tmpKey });
        if (!finalize.ok || !finalize.data) return fail(finalize.ok ? "Processing failed." : finalize.error);
        const alt = window.prompt("Alt text for this image") ?? "";
        resolve({ url: finalize.data.url, alt });
      };
      input.click();
    });
  }

  function handleSave() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const payload = { slug, title, body };
      const result = mode === "create" ? await createPageAction(payload) : await updatePageAction(page!.id, payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(result.message);
      if (mode === "create" && "data" in result && result.data) router.push(`/admin/content/pages/${result.data.id}`);
      else router.refresh();
    });
  }

  function handlePublishToggle() {
    if (!page) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = page.status === "published" ? await unpublishPageAction(page.id) : await publishPageAction(page.id);
      if (!result.ok) setError(result.error);
      else {
        setNotice(result.message);
        router.refresh();
      }
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
            {page && <Badge tone={page.status === "published" ? "ok" : "neutral"}>{page.status}</Badge>}
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
                const res = await checkPageSlugAvailableAction(slug, page?.id);
                if (!res.available) setError(`The slug "${slug}" is already used.`);
              }}
            />
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-line bg-surface p-5">
          <h2 className="font-display text-lg font-semibold text-ink">Body</h2>
          <TiptapEditor content={body} onChange={setBody} onRequestImage={handleRequestImage} />
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="solid-ink" disabled={pending} onClick={handleSave}>
            {mode === "create" ? "Create draft" : "Save changes"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setShowPreview((s) => !s)}>
            {showPreview ? "Hide preview" : "Show preview"}
          </Button>
          {page && (
            <Button type="button" variant={page.status === "published" ? "outline" : "gradient"} disabled={pending} onClick={handlePublishToggle}>
              {page.status === "published" ? "Unpublish" : "Publish"}
            </Button>
          )}
        </div>
      </div>

      {showPreview && (
        <div className="lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-lg border border-line bg-surface p-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-3">Live preview</p>
            <h1 className="font-display text-3xl font-semibold text-ink">{title || "Untitled"}</h1>
            <div className="mt-6">
              <TiptapRenderer doc={body} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
