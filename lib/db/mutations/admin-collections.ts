import "server-only";

import { eq, sql } from "drizzle-orm";
import { db } from "../index";
import { collections, products } from "../schema";

export interface CollectionInput {
  slug: string;
  title: string;
  tagline: string | null;
  priority: number;
  accentToken: string | null;
  position: number;
  seoTitle: string | null;
  seoDescription: string | null;
}

export async function createCollectionDb(input: CollectionInput): Promise<number> {
  const [row] = await db.insert(collections).values(input).returning({ id: collections.id });
  return row.id;
}

export async function updateCollectionDb(id: number, input: CollectionInput): Promise<void> {
  await db.update(collections).set(input).where(eq(collections.id, id));
}

/** Deletes a collection only when no product — published, draft or archived — still belongs to it
 * (the products → collections foreign key is RESTRICT, and moving products is a deliberate choice). */
export async function deleteCollectionDb(id: number): Promise<{ ok: true } | { ok: false; productCount: number }> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(products).where(eq(products.collectionId, id));
  const productCount = Number(row?.n ?? 0);
  if (productCount > 0) return { ok: false, productCount };
  await db.delete(collections).where(eq(collections.id, id));
  return { ok: true };
}
