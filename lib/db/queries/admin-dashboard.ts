import "server-only";

/**
 * Every number on the admin dashboard (PROMPTS.md Phase 7 item 3) is a real, traceable query —
 * "no vanity metrics". Each function here is deliberately narrow (one metric, one query) so the
 * page component can compose them and every tile can link straight to the equivalent filtered
 * `/admin/orders` (or future list) view.
 */
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "../index";
import { orders, products, reviews, variants } from "../schema";
import { paise, sumPaise, type Paise } from "@/lib/money";

function startOfTodayIST(): Date {
  // Asia/Kolkata is a fixed UTC+5:30 offset (no DST) — CLAUDE.md §4: "rendered in Asia/Kolkata".
  const now = new Date();
  const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const istMidnight = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()));
  return new Date(istMidnight.getTime() - 5.5 * 60 * 60 * 1000);
}

export interface OrdersRevenueWindow {
  orderCount: number;
  revenuePaise: Paise;
}

/** Orders placed and their revenue (sum of total_paise, paid or not — "orders and revenue", not
 * "paid revenue"; the dashboard shows this plainly and the payment-status breakdown lives on the
 * orders list itself) since `since`. Excludes cancelled orders from revenue — a cancelled order's
 * total was never actually earned. */
async function ordersAndRevenueSince(since: Date): Promise<OrdersRevenueWindow> {
  const [row] = await db
    .select({
      n: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${orders.totalPaise}) filter (where ${orders.status} <> 'cancelled'), 0)::int`,
    })
    .from(orders)
    .where(gte(orders.placedAt, since));
  return { orderCount: row?.n ?? 0, revenuePaise: paise(row?.revenue ?? 0) };
}

export interface DashboardTotals {
  today: OrdersRevenueWindow;
  last7Days: OrdersRevenueWindow;
  last30Days: OrdersRevenueWindow;
}

export async function getDashboardTotals(): Promise<DashboardTotals> {
  const todayStart = startOfTodayIST();
  const sevenDaysAgo = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000);

  const [today, last7Days, last30Days] = await Promise.all([
    ordersAndRevenueSince(todayStart),
    ordersAndRevenueSince(sevenDaysAgo),
    ordersAndRevenueSince(thirtyDaysAgo),
  ]);

  return { today, last7Days, last30Days };
}

/** Orders paid/confirmed but not yet packed/shipped — i.e. genuinely awaiting dispatch action.
 * Deliberately excludes `pending` (not yet paid) and anything already shipped/delivered/cancelled/
 * refunded. */
export async function getOrdersAwaitingDispatchCount(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(sql`${orders.status} in ('confirmed', 'packed')`);
  return row?.n ?? 0;
}

/** Variants with no stock at all, or a tracked low count (< 10 — the same "Only N left" threshold
 * CLAUDE.md §7.6 uses on the storefront, reused here rather than inventing a second number). Deleted
 * (archived) products don't count — nobody needs to restock those. */
export async function getLowOrOutOfStockCount(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .where(sql`${products.status} <> 'archived' and (${variants.inStock} = false or (${variants.stockQty} is not null and ${variants.stockQty} < 10))`);
  return row?.n ?? 0;
}

export async function getPendingReviewsCount(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(reviews).where(eq(reviews.status, "pending"));
  return row?.n ?? 0;
}

/**
 * Orders that need a Shiprocket push (retry) — confirmed/packed with no shiprocket_order_id yet,
 * which is the exact "outstanding, needs retry" signal lib/shiprocket.ts's doc comment describes
 * (no separate status column exists for this; a null shiprocket_order_id on an order that has
 * moved past `pending` IS the signal).
 */
export async function getNeedsRetryShiprocketCount(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(sql`${orders.status} in ('confirmed', 'packed')`, isNull(orders.shiprocketOrderId)));
  return row?.n ?? 0;
}

export interface SparklinePoint {
  date: string; // yyyy-mm-dd
  revenuePaise: Paise;
}

/** One row per day for the last 30 days, revenue in paise, zero-filled for days with no orders —
 * the recharts sparkline data (PROMPTS.md Phase 7 item 3). */
export async function getRevenueSparkline30d(): Promise<SparklinePoint[]> {
  const todayStart = startOfTodayIST();
  const thirtyDaysAgo = new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      date: sql<string>`to_char(${orders.placedAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`,
      revenue: sql<number>`coalesce(sum(${orders.totalPaise}), 0)::int`,
    })
    .from(orders)
    .where(and(gte(orders.placedAt, thirtyDaysAgo), sql`${orders.status} <> 'cancelled'`))
    .groupBy(sql`to_char(${orders.placedAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`);

  const byDate = new Map(rows.map((r) => [r.date, r.revenue]));
  const points: SparklinePoint[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(thirtyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    points.push({ date: key, revenuePaise: paise(byDate.get(key) ?? 0) });
  }
  return points;
}

/** Sum of every point's revenue — a cross-check the dashboard can use so the sparkline total
 * visibly agrees with the "last 30 days" tile rather than silently drifting apart. */
export function sumSparkline(points: SparklinePoint[]): Paise {
  return sumPaise(points.map((p) => p.revenuePaise));
}

// Re-export for the low-stock tile's link target to filter consistently with the storefront rule.
export const LOW_STOCK_THRESHOLD = 10;
