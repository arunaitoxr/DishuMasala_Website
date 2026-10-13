-- Coupon usage now counts paid orders only (lib/db/mutations/orders.ts#markOrderPaid increments
-- used_count when a payment is confirmed). Recount every coupon from its paid orders so the stored
-- number matches the new rule — the old one also counted pending and failed checkout attempts.
UPDATE "coupons" AS c
SET "used_count" = (
  SELECT count(*) FROM "orders" AS o
  WHERE o."coupon_code" = c."code" AND o."payment_status" = 'paid'
);
