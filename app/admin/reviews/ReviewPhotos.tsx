"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { TypedConfirmDialog } from "@/components/admin/DangerZone";
import { deleteReviewPhotoAction } from "./actions";

/** A review's photos, each removable on its own (moderation: an unsuitable picture on an otherwise fine review). */
export function ReviewPhotos({ reviewId, photos }: { reviewId: number; photos: { id: number; url: string }[] }) {
  const router = useRouter();
  const [removing, setRemoving] = useState<number | null>(null);
  if (photos.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {photos.map((p, i) => (
        <div key={p.id} className="space-y-1">
          <a href={p.url} target="_blank" rel="noreferrer" className="relative block size-24 overflow-hidden rounded-md border border-line">
            <Image src={p.url} alt={`Review photo ${i + 1}`} fill sizes="96px" className="object-cover" />
          </a>
          <button type="button" onClick={() => setRemoving(p.id)} className="text-xs font-medium text-crit underline-offset-4 hover:underline">
            Remove photo
          </button>
        </div>
      ))}
      <TypedConfirmDialog
        open={removing != null}
        onOpenChange={(open) => !open && setRemoving(null)}
        actionLabel="Remove photo"
        description="The photo is removed from the review and deleted."
        confirmText="delete"
        onConfirm={(typed) => deleteReviewPhotoAction(reviewId, removing!, typed)}
        onDone={() => {
          setRemoving(null);
          router.refresh();
        }}
      />
    </div>
  );
}
