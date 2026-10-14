"use client";

import { useRouter } from "next/navigation";
import { DangerZone } from "@/components/admin/DangerZone";
import { deleteCollectionAction } from "./actions";

export function DeleteCollection({ id, slug, title }: { id: number; slug: string; title: string }) {
  const router = useRouter();
  return (
    <DangerZone
      title="Delete collection"
      description={`Deletes ${title}. Only possible once no product belongs to it — move products to another collection first.`}
      actionLabel="Delete collection"
      confirmText={slug}
      onConfirm={(typed) => deleteCollectionAction(id, typed)}
      onDone={() => {
        router.push("/admin/collections");
        router.refresh();
      }}
    />
  );
}
