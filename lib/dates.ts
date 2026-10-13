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
