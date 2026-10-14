import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { contentStatusEnum, postKindEnum } from "./enums";

export const posts = pgTable("posts", {
  id: integer().generatedAlwaysAsIdentity().primaryKey(),
  slug: text().notNull(),
  kind: postKindEnum().notNull(),
  title: text().notNull(),
  excerpt: text(),
  // Tiptap JSON document.
  body: jsonb().notNull(),
  coverStorageKey: text("cover_storage_key"),
  /** Alt text for the cover image — read aloud and shown if the image fails; empty means the title is used. */
  coverAlt: text("cover_alt"),
  status: contentStatusEnum().notNull().default("draft"),
  author: text(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  relatedProductIds: integer("related_product_ids").array().notNull().default([]),
}, (t) => [
  uniqueIndex("posts_slug_uniq").on(t.slug),
  index("posts_kind_status_published_at_idx").on(t.kind, t.status, t.publishedAt),
]);

export const pages = pgTable("pages", {
  id: integer().generatedAlwaysAsIdentity().primaryKey(),
  slug: text().notNull(),
  title: text().notNull(),
  // Tiptap JSON document.
  body: jsonb().notNull(),
  status: contentStatusEnum().notNull().default("draft"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("pages_slug_uniq").on(t.slug),
]);
