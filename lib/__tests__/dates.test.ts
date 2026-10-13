import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "@/lib/dates";

describe("formatDate / formatDateTime", () => {
  // 20:00 UTC on 12 Sept is 01:30 IST on 13 Sept — the window where the server's timezone used to leak.
  const lateEvening = new Date("2026-09-12T20:00:00Z");
  const short: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };

  it("shows the IST date, not the server's, across the midnight boundary", () => {
    expect(lateEvening.toLocaleDateString("en-IN", { ...short, timeZone: "UTC" })).toBe("12 Sept 2026");
    expect(formatDate(lateEvening, short)).toBe("13 Sept 2026");
  });

  it("accepts the ISO string a cached query hands back", () => {
    expect(formatDate(lateEvening.toISOString(), short)).toBe("13 Sept 2026");
  });

  it("formats date and time in IST", () => {
    expect(formatDateTime(lateEvening, { dateStyle: "medium", timeStyle: "short" })).toMatch(/13 Sept 2026.*1:30\s?am/i);
  });
});
