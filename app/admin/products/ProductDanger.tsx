"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { DangerZone } from "@/components/admin/DangerZone";
import { archiveProductAction, deleteProductPermanentlyAction, restoreProductAction } from "./actions";

/**
 * Delete for a product, in two steps (CLAUDE.md §9 prefers soft-delete): "Delete product" archives it —
 * off the storefront, restorable — and an archived product can then be restored or deleted for good.
 * Both destructive steps need the slug typed out.
 */
export function ProductDanger({
  id,
  slug,
  status,
  orderLineCount,
}: {
  id: number;
  slug: string;
  status: "draft" | "published" | "archived";
  orderLineCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (status !== "archived") {
    return (
      <DangerZone
        title="Delete product"
        description={`Takes ${slug} off the site straight away. It moves to Archived, where you can restore it or delete it permanently.`}
        actionLabel="Delete product"
        confirmText={slug}
        onConfirm={(typed) => archiveProductAction(id, typed)}
        onDone={() => router.refresh()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-lg border border-line bg-surface p-5">
        <h2 className="font-display text-lg font-semibold text-ink">This product is deleted (archived)</h2>
        <p className="text-sm text-ink-2">It isn&apos;t shown anywhere on the site. Restore it as a draft to edit and publish it again.</p>
        {message && (
          <p role="alert" className="text-sm text-crit">
            {message}
          </p>
        )}
        <Button
          type="button"
          variant="solid-ink"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await restoreProductAction(id);
              if (!result.ok) setMessage(result.error);
              router.refresh();
            })
          }
        >
          Restore product
        </Button>
      </section>
      <DangerZone
        title="Delete permanently"
        description={`Removes ${slug}, its variants, images and reviews for good.${
          orderLineCount > 0 ? ` ${orderLineCount} past order line${orderLineCount === 1 ? "" : "s"} keep their own copy of the name, price and image.` : ""
        }`}
        actionLabel="Delete permanently"
        confirmText={slug}
        onConfirm={(typed) => deleteProductPermanentlyAction(id, typed)}
        onDone={() => {
          router.push("/admin/products?status=archived");
          router.refresh();
        }}
      />
    </div>
  );
}
