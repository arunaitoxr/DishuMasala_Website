import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { orderStatusEnum, paymentMethodEnum, paymentStatusEnum } from "./enums";
import { users } from "./users";
import { variants } from "./catalog";

/**
 * Backs the human-readable order number (DM-YYYY-NNNNN). See lib/db/order-number.ts for the
 * formatting helper that turns a nextval() into that string.
 */
export const orderNumberSeq = pgSequence("order_number_seq", {
  startWith: 1,
  increment: 1,
  minValue: 1,
});

export const orders = pgTable("orders", {
  id: integer().generatedAlwaysAsIdentity().primaryKey(),
  orderNumber: text("order_number").notNull(),
  // Client-generated (e.g. a UUID minted once per checkout attempt and reused across retries),
  // required and unique — the real DB-level guarantee that a double-submitted checkout (network
  // retry, double-click) can never create two order rows (CLAUDE.md §7.5). A disabled-button
  // debounce alone is not enough: this is enforced by Postgres itself via the unique index below.
  idempotencyKey: text("idempotency_key").notNull(),
  // Nullable — guest checkout is allowed (CLAUDE.md §9 / PRD §5.4).
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  email: text().notNull(),
  phone: text().notNull(),
  status: orderStatusEnum().notNull().default("pending"),
  paymentMethod: paymentMethodEnum("payment_method").notNull(),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("pending"),
  subtotalPaise: integer("subtotal_paise").notNull(),
  discountPaise: integer("discount_paise").notNull().default(0),
  // The automatic cross-pillar bundle discount (CLAUDE.md §7.2's 2026-09-10 amendment), snapshotted
  // separately from discountPaise — that column is reserved for manually-entered coupon codes
  // (coupons/coupon_redemptions); this one has no code and never touches those tables.
  bundleDiscountPaise: integer("bundle_discount_paise").notNull().default(0),
  shippingPaise: integer("shipping_paise").notNull().default(0),
  totalPaise: integer("total_paise").notNull(),
  couponCode: text("coupon_code"),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  shippingAddress: jsonb("shipping_address").notNull(),
  billingAddress: jsonb("billing_address"),
  shiprocketOrderId: text("shiprocket_order_id"),
  awb: text(),
  courier: text(),
  trackingUrl: text("tracking_url"),
  customerNote: text("customer_note"),
  staffNote: text("staff_note"),
  // Refund bookkeeping (Phase 7 — "record a refund with amount and note"). Kept on the order row
  // itself rather than a separate `refunds` table: CLAUDE.md §6's schema contract has no such
  // table, this project supports at most one refund per order in scope, and the order is already
  // the one place its full financial history is read from. `refundedAt` is null until a refund is
  // recorded; `razorpayRefundId` stays null when the real Razorpay refund call couldn't be made
  // (no credentials in this environment, or an API failure) — the same honest-degrade pattern as
  // every other third-party integration in this project.
  refundAmountPaise: integer("refund_amount_paise"),
  refundNote: text("refund_note"),
  razorpayRefundId: text("razorpay_refund_id"),
  refundedAt: timestamp("refunded_at", { withTimezone: true }),
  placedAt: timestamp("placed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("orders_order_number_uniq").on(t.orderNumber),
  uniqueIndex("orders_idempotency_key_uniq").on(t.idempotencyKey),
  // Postgres unique indexes treat NULLs as distinct, so many orders may have no razorpay payment
  // id yet (COD, or pending prepaid orders) — but the moment one is set, it can belong to exactly
  // one order. This is the DB-enforced guarantee the payment webhook's idempotent handling relies
  // on (CLAUDE.md §7.5 / PROMPTS.md Phase 5 item 7): the same payment can never be attached twice.
  uniqueIndex("orders_razorpay_payment_id_uniq").on(t.razorpayPaymentId),
  index("orders_status_placed_at_idx").on(t.status, t.placedAt),
  index("orders_user_id_idx").on(t.userId),
  // Phase 7's admin order search ("by order number, phone or email" — PROMPTS.md item 4) needs
  // phone/email lookups to hit an index too, not just the order-number unique index above.
  index("orders_phone_idx").on(t.phone),
  index("orders_email_idx").on(t.email),
  // Guest orders are matched to a customer, and coupon limits are counted, by lower(email).
  index("orders_email_lower_idx").on(sql`lower(${t.email})`),
]);

export const orderItems = pgTable("order_items", {
  id: integer().generatedAlwaysAsIdentity().primaryKey(),
  // Orders and order_items are never cascade-deleted (CLAUDE.md §6). Restrict blocks deleting an
  // order out from under its line items at the database level, as a backstop to the app-level
  // rule that orders are never deletable at all.
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  // Nullable, and SET NULL on delete: order_items store a full price/name snapshot independent of
  // the live variant, so deleting a variant later must never delete or corrupt historical orders.
  variantId: integer("variant_id").references(() => variants.id, { onDelete: "set null" }),
  productName: text("product_name").notNull(),
  optionValue: text("option_value").notNull(),
  sku: text().notNull(),
  mrpPaise: integer("mrp_paise").notNull(),
  unitPricePaise: integer("unit_price_paise").notNull(),
  qty: integer().notNull(),
  lineTotalPaise: integer("line_total_paise").notNull(),
  imageStorageKey: text("image_storage_key"),
}, (t) => [
  index("order_items_order_id_idx").on(t.orderId),
]);
