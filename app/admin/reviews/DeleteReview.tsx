"use client";

import { useRouter } from "next/navigation";
import { DangerZone } from "@/components/admin/DangerZone";
import { deleteReviewAction } from "./actions";

export function DeleteReview({ id }: { id: number }) {
  const router = useRouter();
  return (
    <DangerZone
      title="Delete review"
      description="The review and its photos are deleted for good. To take it off the site but keep it, use Hide instead."
      actionLabel="Delete review"
      confirmText="delete"
      onConfirm={(typed) => deleteReviewAction(id, typed)}
      onDone={() => {
        router.push("/admin/reviews");
        router.refresh();
      }}
    />
  );
}
