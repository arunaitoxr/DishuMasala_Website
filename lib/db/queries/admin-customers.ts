import "server-only";

import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../index";
import { orders, reviews, users } from "../schema";

export interface AdminCustomerRow {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: "customer" | "staff" | "admin";
  orderCount: number;
  lifetimeValuePaise: number;
  createdAt: Date;
}

export interface AdminCustomerFilters {
  search?: string;
  page: number;
}

const PAGE_SIZE = 25;

/** Read-mostly customer list (PROMPTS.md Phase 8 item 5): order count and lifetime value computed
 * from paid/delivered-adjacent order rows, not every row regardless of status — a cancelled/never-
 * paid order shouldn't inflate "lifetime value". */
/** An order belongs to a customer if it was placed on their account or with their email as a guest. */
const ownOrder = sql`(${orders.userId} = ${users.id} or lower(${orders.email}) = lower(${users.email}))`;

export async function listAdminCustomers(filters: AdminCustomerFilters): Promise<{ rows: AdminCustomerRow[]; total: number }> {
  const conditions = [eq(users.role, "customer")];
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(or(ilike(users.name, term), ilike(users.email, term), ilike(users.phone, term))!);
  }
  const where = and(...conditions);

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: users.role,
        createdAt: users.createdAt,
        orderCount: sql<number>`(select count(*) from ${orders} where ${ownOrder})`,
        lifetimeValuePaise: sql<number>`(select coalesce(sum(${orders.totalPaise}), 0) from ${orders} where ${ownOrder} and ${orders.paymentStatus} = 'paid')`,
      })
      .from(users)
      .where(where)
      .orderBy(desc(sql`(select coalesce(sum(${orders.totalPaise}), 0) from ${orders} where ${ownOrder} and ${orders.paymentStatus} = 'paid')`), desc(users.createdAt))
      .limit(PAGE_SIZE)
      .offset((filters.page - 1) * PAGE_SIZE),
    db.select({ count: sql<number>`count(*)` }).from(users).where(where),
  ]);

  return {
    rows: rows.map((r) => ({ ...r, orderCount: Number(r.orderCount), lifetimeValuePaise: Number(r.lifetimeValuePaise) })),
    total: Number(count),
  };
}

export { PAGE_SIZE as ADMIN_CUSTOMERS_PAGE_SIZE };

export interface AdminCustomerDetail {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: "customer" | "staff" | "admin";
  authUserId: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export async function getAdminCustomerById(id: number): Promise<AdminCustomerDetail | null> {
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role, authUserId: users.authUserId, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return row ?? null;
}

export interface AdminCustomerOrderRow {
  id: number;
  orderNumber: string;
  status: string;
  totalPaise: number;
  placedAt: Date;
}

/** The customer's orders — placed while signed in, or as a guest with the same email (before they
 * had an account, or while signed out), which used to be invisible here. */
export async function getOrdersForCustomer(userId: number, email: string): Promise<AdminCustomerOrderRow[]> {
  return db
    .select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status, totalPaise: orders.totalPaise, placedAt: orders.placedAt })
    .from(orders)
    .where(or(eq(orders.userId, userId), sql`lower(${orders.email}) = lower(${email})`))
    .orderBy(desc(orders.placedAt));
}

export interface AdminCustomerReviewRow {
  id: number;
  productName: string;
  rating: number;
  status: "pending" | "approved" | "rejected";
  createdAt: Date;
}

export async function getReviewsForCustomer(userId: number): Promise<AdminCustomerReviewRow[]> {
  const { products } = await import("../schema");
  const rows = await db
    .select({ id: reviews.id, productName: products.name, rating: reviews.rating, status: reviews.status, createdAt: reviews.createdAt })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .where(eq(reviews.userId, userId))
    .orderBy(desc(reviews.createdAt));
  return rows;
}
