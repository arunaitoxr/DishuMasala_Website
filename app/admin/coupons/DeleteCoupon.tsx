"use client";

import { useRouter } from "next/navigation";
import { DangerZone } from "@/components/admin/DangerZone";
import { deleteCouponAction } from "./actions";

export function DeleteCoupon({ id, code, usedCount }: { id: number; code: string; usedCount: number }) {
  const router = useRouter();
  return (
    <DangerZone
      title="Delete coupon"
      description={
        usedCount > 0
          ? `${code} has been used on ${usedCount} paid order${usedCount === 1 ? "" : "s"}; those orders keep the code and discount they were placed with.`
          : `${code} will stop working immediately.`
      }
      actionLabel="Delete coupon"
      confirmText={code}
      onConfirm={(typed) => deleteCouponAction(id, typed)}
      onDone={() => {
        router.push("/admin/coupons");
        router.refresh();
      }}
    />
  );
}
