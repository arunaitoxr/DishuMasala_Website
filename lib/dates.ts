/**
 * Dates as a shopper or staff member reads them — always in Asia/Kolkata (CLAUDE.md §4: "stored UTC,
 * rendered in Asia/Kolkata"), never in whatever timezone the process runs in. Without an explicit zone,
 * `toLocaleDateString` used the server's: UTC on Vercel, so anything stamped between midnight and 05:30
 * IST showed the previous day on the live site, while a dev machine in India showed the right one — and
 * a client component (the PDP reviews) printed one date on the server and another in the browser.
 *
 * Both helpers also take a string, since a result read back from `unstable_cache` arrives as JSON.
 */
export const STORE_TIME_ZONE = "Asia/Kolkata";

/** A date in IST — `toLocaleDateString("en-IN", options)`, pinned to the store's timezone. */
export function formatDate(value: Date | string, options: Intl.DateTimeFormatOptions = {}): string {
  return new Date(value).toLocaleDateString("en-IN", { ...options, timeZone: STORE_TIME_ZONE });
}

/** A date and time in IST — `toLocaleString("en-IN", options)`, pinned to the store's timezone. */
export function formatDateTime(value: Date | string, options: Intl.DateTimeFormatOptions = {}): string {
  return new Date(value).toLocaleString("en-IN", { ...options, timeZone: STORE_TIME_ZONE });
}

const IST_OFFSET_MINUTES = 5 * 60 + 30; // Asia/Kolkata is a fixed UTC+05:30 — no daylight saving.

/** The value for an `<input type="datetime-local">` showing this instant in IST ("2026-10-13T09:30").
 * Pure arithmetic, so the server and the browser render the same string whatever their timezones. */
export function toISTDateTimeLocal(value: Date | string | null): string {
  if (value == null) return "";
  return new Date(new Date(value).getTime() + IST_OFFSET_MINUTES * 60_000).toISOString().slice(0, 16);
}

/** Reads a `datetime-local` value as IST — the time staff typed — not as the server's own timezone
 * (on a UTC server `new Date("2026-10-13T09:30")` would land 5½ hours late). `null` for empty or
 * malformed input. */
export function fromISTDateTimeLocal(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(`${match[1]}${match[2] ?? ":00"}+05:30`);
  return Number.isNaN(date.getTime()) ? null : date;
}
