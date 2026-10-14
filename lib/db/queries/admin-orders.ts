import "server-only";

/**
 * Admin order list (PROMPTS.md Phase 7 item 4): filterable, server-side, URL-driven — the same
 * discipline as lib/db/queries/shop-query.ts's split (a pure, testable filter-parsing/where-clause
 * module) but simpler, since the admin list has no facet-count sidebar to build. Search matches
 * order number (its own unique index), phone and email (both now indexed — see
 * lib/db/schema/orders.ts's `orders_phone_idx`/`orders_email_idx`, added this phase specifically
 * for this).
 */
import { and, asc, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../index";
import { orders } from "../schema";
import { paise, type Paise } from "@/lib/money";
import type { OrderStatus, PaymentMethod } from "@/types/order";

export const ADMIN_ORDERS_PAGE_SIZE = 50;
/** Hard cap on a CSV export / perf-test scan — never an unbounded table scan from a link click. */
export const ADMIN_ORDERS_EXPORT_CAP = 5000;

const ORDER_STATUSES = ["pending", "confirmed", "packed", "shipped", "delivered", "cancelled", "refunded"] as const;
const PAYMENT_METHODS = ["razorpay", "cod"] as const;
export const ADMIN_ORDER_SORTS = ["placed_at", "total"] as const;
export type AdminOrderSort = (typeof ADMIN_ORDER_SORTS)[number];

export interface AdminOrderFilters {
  status?: OrderStatus;
  paymentMethod?: PaymentMethod;
  dateFrom?: string; // yyyy-mm-dd, inclusive
  dateTo?: string; // yyyy-mm-dd, inclusive
  q?: string;
  sort: AdminOrderSort;
  dir: "asc" | "desc";
  page: number;
}

const filtersSchema = z
  .object({
    status: z.enum(ORDER_STATUSES).optional(),
    method: z.enum(PAYMENT_METHODS).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    q: z.string().trim().min(1).max(200).optional(),
    sort: z.enum(ADMIN_ORDER_SORTS).optional(),
    dir: z.enum(["asc", "desc"]).optional(),
    page: z.coerce.number().int().positive().optional(),
  })
  .partial();

/** Parses `?status=&method=&from=&to=&q=&sort=&dir=&page=` into a typed `AdminOrderFilters` —
 * mirrors parseShopSearchParams's "never throw on a malformed/hand-edited URL" discipline. */
export function parseAdminOrderFilters(raw: Record<string, string | string[] | undefined>): AdminOrderFilters {
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v !== "") flat[key] = v;
  }
  const parsed = filtersSchema.safeParse(flat);
  const p = parsed.success ? parsed.data : {};
  return {
    status: p.status,
    paymentMethod: p.method,
    dateFrom: p.from,
    dateTo: p.to,
    q: p.q,
    sort: p.sort ?? "placed_at",
    dir: p.dir ?? "desc",
    page: p.page ?? 1,
  };
}

/** Inverse of parseAdminOrderFilters — used by every link (sort headers, pagination, CSV export)
 * so each preserves every other currently-active filter. */
export function adminOrderFiltersToSearchParams(filters: AdminOrderFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (filters.status) out.status = filters.status;
  if (filters.paymentMethod) out.method = filters.paymentMethod;
  if (filters.dateFrom) out.from = filters.dateFrom;
  if (filters.dateTo) out.to = filters.dateTo;
  if (filters.q) out.q = filters.q;
  if (filters.sort !== "placed_at") out.sort = filters.sort;
  if (filters.dir !== "desc") out.dir = filters.dir;
  if (filters.page !== 1) out.page = String(filters.page);
  return out;
}

function buildWhere(filters: AdminOrderFilters): SQL | undefined {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(orders.status, filters.status));
  if (filters.paymentMethod) conditions.push(eq(orders.paymentMethod, filters.paymentMethod));
  // The From/To dates are days in IST (the store's day, CLAUDE.md §4), not UTC — read as UTC, "today"
  // ran from 05:30 to 05:29 the next morning.
  if (filters.dateFrom) conditions.push(gte(orders.placedAt, new Date(`${filters.dateFrom}T00:00:00.000+05:30`)));
  if (filters.dateTo) conditions.push(lte(orders.placedAt, new Date(`${filters.dateTo}T23:59:59.999+05:30`)));
  if (filters.q) {
    const like = `%${filters.q}%`;
    // order_number hits its unique index; phone/email hit the btree indexes added this phase.
    // ILIKE on an indexed column can't use a plain btree for a leading-wildcard match, but these
    // are all short, low-cardinality-enough columns on a bounded table that a sequential scan at
    // the sizes this store will ever reach is still fast — see the perf-test report for the real
    // number at 5,000 rows.
    const cond = or(ilike(orders.orderNumber, like), ilike(orders.phone, like), ilike(orders.email, like));
    if (cond) conditions.push(cond);
  }
  return conditions.length ? and(...conditions) : undefined;
}

function buildOrderBy(filters: AdminOrderFilters): SQL {
  const col = filters.sort === "total" ? orders.totalPaise : orders.placedAt;
  return filters.dir === "asc" ? asc(col) : desc(col);
}

export interface AdminOrderRow {
  id: number;
  orderNumber: string;
  email: string;
  phone: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: string;
  totalPaise: Paise;
  placedAt: Date;
  shiprocketOrderId: string | null;
  awb: string | null;
}

const ROW_SELECT = {
  id: orders.id,
  orderNumber: orders.orderNumber,
  email: orders.email,
  phone: orders.phone,
  status: orders.status,
  paymentMethod: orders.paymentMethod,
  paymentStatus: orders.paymentStatus,
  totalPaise: orders.totalPaise,
  placedAt: orders.placedAt,
  shiprocketOrderId: orders.shiprocketOrderId,
  awb: orders.awb,
};

interface RawOrderRow {
  id: number;
  orderNumber: string;
  email: string;
  phone: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: string;
  totalPaise: number;
  placedAt: Date;
  shiprocketOrderId: string | null;
  awb: string | null;
}

function toRow(row: RawOrderRow): AdminOrderRow {
  return { ...row, totalPaise: paise(row.totalPaise) };
}

/** The default admin orders list query — one filtered, sorted, LIMIT/OFFSET round trip plus one
 * COUNT(*) round trip for pagination, both against `orders` only (no join needed for the list
 * columns). This is the exact query the perf test times against 5,000 seeded orders. */
export async function getAdminOrdersPage(
  filters: AdminOrderFilters,
): Promise<{ rows: AdminOrderRow[]; totalCount: number }> {
  const where = buildWhere(filters);
  const offset = (filters.page - 1) * ADMIN_ORDERS_PAGE_SIZE;

  const [rows, countResult] = await Promise.all([
    db
      .select(ROW_SELECT)
      .from(orders)
      .where(where)
      .orderBy(buildOrderBy(filters))
      .limit(ADMIN_ORDERS_PAGE_SIZE)
      .offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(orders).where(where),
  ]);

  return { rows: rows.map(toRow), totalCount: countResult[0]?.n ?? 0 };
}

/** Same filters, no pagination, capped at ADMIN_ORDERS_EXPORT_CAP — backs the CSV export route
 * ("of the current filtered view", not the whole table unconditionally — PROMPTS.md Phase 7 item 2). */
export async function getAdminOrdersForExport(filters: AdminOrderFilters): Promise<AdminOrderRow[]> {
  const where = buildWhere(filters);
  const rows = await db
    .select(ROW_SELECT)
    .from(orders)
    .where(where)
    .orderBy(buildOrderBy(filters))
    .limit(ADMIN_ORDERS_EXPORT_CAP);
  return rows.map(toRow);
}
