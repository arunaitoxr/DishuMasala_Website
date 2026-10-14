"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { TypedConfirmDialog } from "@/components/admin/DangerZone";
import type { AdminImageRow } from "@/lib/db/queries/admin-products";
import {
  presignProductImageUploadAction,
  finalizeProductImageUploadAction,
  replaceProductImageAction,
  updateProductImageAltAction,
  reorderProductImagesAction,
  setPrimaryProductImageAction,
  deleteProductImageAction,
} from "./actions";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

interface UploadState {
  fileName: string;
  status: "uploading" | "processing" | "error";
  error?: string;
}

type AltState = { status: "saving" } | { status: "saved" } | { status: "error"; error: string };

/**
 * Product images (PROMPTS.md Phase 8 item 1; client request 2026-10-13): drag-and-drop upload straight
 * to Supabase Storage via a presigned URL, replace a file in place, alt text (required before publish —
 * enforced server-side), set primary, reorder by drag or by the Move buttons (keyboard-friendly), and
 * delete behind a typed confirmation. Every change refreshes the storefront's cached product page.
 * `productSlug` must be the SAVED slug — uploads are keyed under it on the server.
 */
export function ProductImages({
  productId,
  productSlug,
  images,
  onChanged,
}: {
  productId: number;
  productSlug: string;
  images: AdminImageRow[];
  onChanged: () => void;
}) {
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [altState, setAltState] = useState<Record<number, AltState>>({});
  const [replacing, setReplacing] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<AdminImageRow | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<number | null>(null);

  /** Validates the file and PUTs it to a presigned temp key; returns the key or an error. */
  async function putToStorage(file: File): Promise<{ tmpKey: string } | { error: string }> {
    if (!ALLOWED_TYPES.has(file.type)) return { error: "Only JPEG, PNG or WEBP." };
    if (file.size > MAX_BYTES) return { error: "File is larger than 5MB." };
    const presign = await presignProductImageUploadAction({
      productSlug,
      contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
      contentLength: file.size,
    });
    if (!presign.ok || !presign.data) return { error: presign.ok ? "Upload failed." : presign.error };
    const putRes = await fetch(presign.data.url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
    if (!putRes.ok) return { error: "Upload to storage failed." };
    return { tmpKey: presign.data.tmpKey };
  }

  async function uploadOne(file: File) {
    const label: UploadState = { fileName: file.name, status: "uploading" };
    setUploads((u) => [...u, label]);
    setError(null);
    const fail = (message: string) => setUploads((u) => u.map((x) => (x === label ? { ...x, status: "error", error: message } : x)));

    const put = await putToStorage(file);
    if ("error" in put) return fail(put.error);
    setUploads((u) => u.map((x) => (x === label ? { ...x, status: "processing" } : x)));
    const finalize = await finalizeProductImageUploadAction({ productId, tmpKey: put.tmpKey });
    if (!finalize.ok) return fail(finalize.error);
    setUploads((u) => u.filter((x) => x !== label));
    onChanged();
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) await uploadOne(file);
  }

  async function handleReplace(imageId: number, file: File) {
    setError(null);
    setReplacing(imageId);
    const put = await putToStorage(file);
    if ("error" in put) {
      setReplacing(null);
      setError(put.error);
      return;
    }
    const res = await replaceProductImageAction({ productId, imageId, tmpKey: put.tmpKey });
    setReplacing(null);
    if (!res.ok) setError(res.error);
    onChanged();
  }

  async function handleAltBlur(img: AdminImageRow, alt: string) {
    if (alt.trim() === img.alt) return;
    setAltState((s) => ({ ...s, [img.id]: { status: "saving" } }));
    const res = await updateProductImageAltAction({ imageId: img.id, alt });
    setAltState((s) => ({ ...s, [img.id]: res.ok ? { status: "saved" } : { status: "error", error: res.error } }));
    if (res.ok) onChanged();
  }

  async function handleSetPrimary(imageId: number) {
    const res = await setPrimaryProductImageAction({ productId, imageId });
    if (!res.ok) setError(res.error);
    onChanged();
  }

  async function commitReorder(newOrder: AdminImageRow[]) {
    const res = await reorderProductImagesAction({ productId, orderedIds: newOrder.map((i) => i.id) });
    if (!res.ok) setError(res.error);
    onChanged();
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= images.length || from === to) return;
    const next = [...images];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    void commitReorder(next);
  }

  return (
    <section className="space-y-4 rounded-lg border border-line bg-surface p-5">
      <h2 className="font-display text-lg font-semibold text-ink">Images</h2>
      {error && (
        <p role="alert" className="text-sm text-crit">
          {error}
        </p>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (dragIndex === null) void handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className={`flex h-32 cursor-pointer items-center justify-center rounded-md border-2 border-dashed px-4 text-center text-sm text-ink-2 ${dragOver ? "border-brew-2 bg-surface-2" : "border-line"}`}
      >
        Drag and drop JPEG/PNG/WEBP images here, or click to choose files (max 5MB each)
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          aria-label="Add images"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {/* One hidden picker shared by every image's Replace button. */}
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label="Replacement image"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          const target = replaceTarget.current;
          e.target.value = "";
          if (file && target != null) void handleReplace(target, file);
        }}
      />

      {uploads.length > 0 && (
        <ul className="space-y-1 text-sm">
          {uploads.map((u, i) => (
            <li key={i} className={u.status === "error" ? "text-crit" : "text-ink-2"}>
              {u.fileName} — {u.status === "uploading" ? "uploading…" : u.status === "processing" ? "processing…" : u.error}
            </li>
          ))}
        </ul>
      )}

      {images.length === 0 ? (
        <p className="text-sm text-ink-3">No images yet.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {images.map((img, i) => {
            const alt = altState[img.id];
            return (
              <li
                key={img.id}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragEnd={() => setDragIndex(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null) move(dragIndex, i);
                  setDragIndex(null);
                }}
                className="cursor-move rounded-md border border-line p-3"
                aria-label={`Image ${i + 1}`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-ink-3">Position {i + 1}</span>
                  {img.isPrimary && <Badge tone="gold">Primary</Badge>}
                </div>
                <div className="relative mb-2 aspect-square overflow-hidden rounded-md bg-surface-2">
                  <Image src={img.url} alt={img.alt || "(missing alt text)"} fill sizes="300px" className="object-cover" />
                  {replacing === img.id && (
                    <div className="absolute inset-0 flex items-center justify-center bg-surface/80 text-sm text-ink">Replacing…</div>
                  )}
                </div>
                <label htmlFor={`alt-${img.id}`} className="mb-1 block text-xs font-medium text-ink-2">
                  Alt text {!img.alt && <span className="text-crit">(required before publish)</span>}
                </label>
                <Input
                  id={`alt-${img.id}`}
                  defaultValue={img.alt}
                  onBlur={(e) => void handleAltBlur(img, e.target.value)}
                  placeholder="Describe this image for screen readers"
                />
                <p className="mt-1 h-4 text-xs" aria-live="polite">
                  {alt?.status === "saving" && <span className="text-ink-3">Saving…</span>}
                  {alt?.status === "saved" && <span className="text-ok">Alt text saved</span>}
                  {alt?.status === "error" && <span className="text-crit">{alt.error}</span>}
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {!img.isPrimary && (
                    <Button type="button" variant="outline" size="sm" onClick={() => void handleSetPrimary(img.id)}>
                      Set primary
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={replacing != null}
                    onClick={() => {
                      replaceTarget.current = img.id;
                      replaceInputRef.current?.click();
                    }}
                  >
                    Replace
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Move image ${i + 1} earlier`}>
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={i === images.length - 1}
                    onClick={() => move(i, i + 1)}
                    aria-label={`Move image ${i + 1} later`}
                  >
                    ↓
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setDeleting(img)} className="text-crit">
                    Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <TypedConfirmDialog
        open={deleting != null}
        onOpenChange={(open) => !open && setDeleting(null)}
        actionLabel="Delete image"
        description={deleting?.isPrimary ? "This is the primary image; the next one will take its place." : "The image will be removed from the product."}
        confirmText="delete"
        onConfirm={() => deleteProductImageAction({ imageId: deleting!.id, productId })}
        onDone={() => {
          setDeleting(null);
          onChanged();
        }}
      />
    </section>
  );
}
