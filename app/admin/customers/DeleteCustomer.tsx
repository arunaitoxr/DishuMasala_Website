"use client";

import { useRouter } from "next/navigation";
import { DangerZone } from "@/components/admin/DangerZone";
import { deleteCustomerAction } from "./actions";

export function DeleteCustomer({ id, email, orderCount }: { id: number; email: string; orderCount: number }) {
  const router = useRouter();
  return (
    <DangerZone
      title="Delete customer"
      description={`Deletes the account, its login, saved addresses, wishlist and cart.${orderCount > 0 ? ` Their ${orderCount} order${orderCount === 1 ? "" : "s"} stay on record.` : ""}`}
      actionLabel="Delete customer"
      confirmText={email}
      onConfirm={(typed) => deleteCustomerAction(id, typed)}
      onDone={() => {
        router.push("/admin/customers");
        router.refresh();
      }}
    />
  );
}
