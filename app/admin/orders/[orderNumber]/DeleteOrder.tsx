"use client";

import { useRouter } from "next/navigation";
import { DangerZone } from "@/components/admin/DangerZone";
import { deleteUnpaidOrderAction } from "../actions";

/** Only rendered for orders that were never paid; the server re-checks. */
export function DeleteOrder({ id, orderNumber }: { id: number; orderNumber: string }) {
  const router = useRouter();
  return (
    <DangerZone
      title="Delete order"
      description={`${orderNumber} was never paid (an abandoned or failed checkout, or a test). It and its line items are removed for good; any stock it held is released.`}
      actionLabel="Delete order"
      confirmText={orderNumber}
      onConfirm={(typed) => deleteUnpaidOrderAction(id, typed)}
      onDone={() => {
        router.push("/admin/orders");
        router.refresh();
      }}
    />
  );
}
