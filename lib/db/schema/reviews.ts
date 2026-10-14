import { boolean, check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { reviewSourceEnum, reviewStatusEnum } from "./enums";
import { products } from "./catalog";
import { orders } from "./orders";
import { users } from "./users";

export const reviews = pgTable("reviews", {
  id: integer().generatedAlwaysAsIdentity().primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  // Nullable — a guest may leave a review by matching order email; no forced account.
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  // Nullable — verified_buyer is set only when a matching delivered order is found.
  orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
  authorName: text("author_name").notNull(),
  email: text().notNull(),
  rating: integer().notNull(),
  title: text(),
  body: text().notNull(),
  status: reviewStatusEnum().notNull().default("pending"),
  verifiedBuyer: boolean("verified_buyer").notNull().default(false),
  source: reviewSourceEnum().notNull().default("customer"),
  // SHA-256 hex digest of the submitter's IP, never the raw IP (CLAUDE.md has no "don't log raw
  // IPs" rule written down, but hashing costs nothing and avoids storing PII we don't need) — used
  // only for the DB-backed rate limit in lib/db/mutations/reviews.ts. Nullable because it's not
  // knowable outside a real HTTP request (e.g. never set by scripts/seed.ts, which never runs).
  ipHash: text("ip_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  moderatedAt: timestamp("moderated_at", { withTimezone: true }),
  moderatedBy: integer("moderated_by").references(() => users.id, { onDelete: "set null" }),
}, (t) => [
  index("reviews_product_id_status_idx").on(t.productId, t.status),
  // Backs the rate-limit lookups in lib/db/mutations/reviews.ts (count-by-email / count-by-ip-hash
  // within a rolling window) — both filter on created_at so it belongs in both composite indexes.
  index("reviews_email_created_at_idx").on(t.email, t.createdAt),
  index("reviews_ip_hash_created_at_idx").on(t.ipHash, t.createdAt),
  check("reviews_rating_range", sql`${t.rating} between 1 and 5`),
]);

export const reviewPhotos = pgTable("review_photos", {
  id: integer().generatedAlwaysAsIdentity().primaryKey(),
  reviewId: integer("review_id").notNull().references(() => reviews.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull(),
  position: integer().notNull().default(0),
}, (t) => [
  index("review_photos_review_id_idx").on(t.reviewId),
]);
