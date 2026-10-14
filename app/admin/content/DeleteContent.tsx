"use client";

import { useRouter } from "next/navigation";
import { DangerZone } from "@/components/admin/DangerZone";
import { deletePageAction, deletePostAction } from "./actions";

/** Delete a post or a page for good, behind a typed confirmation of its slug. */
export function DeleteContent({ kind, id, slug }: { kind: "post" | "page"; id: number; slug: string }) {
  const router = useRouter();
  return (
    <DangerZone
      title={kind === "post" ? "Delete post" : "Delete page"}
      description={
        kind === "post" ? "The post and its cover image are deleted for good. To take it off the site but keep it, use Unpublish." : `The page and its address /${slug} stop working. To keep it, use Unpublish.`
      }
      actionLabel={kind === "post" ? "Delete post" : "Delete page"}
      confirmText={slug}
      onConfirm={(typed) => (kind === "post" ? deletePostAction(id, typed) : deletePageAction(id, typed))}
      onDone={() => {
        router.push("/admin/content");
        router.refresh();
      }}
    />
  );
}
