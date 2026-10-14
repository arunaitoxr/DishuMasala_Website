/**
 * Review CSV parsing and product matching, shared by the admin "Import reviews" page and
 * scripts/import-reviews-csv.ts. Pure — no database access — so it is unit-tested directly.
 *
 * Columns (header row required, any order, case-insensitive):
 *   product (name or slug) · reviewer_name (or name / reviewer) · rating (1–5) · review (or body)
 *   optional: title · date (YYYY-MM-DD or DD/MM/YYYY) · email · city · state
 */

export interface ReviewCsvRow {
  /** 1-based line number in the file, for error messages. */
  line: number;
  product: string;
  reviewerName: string;
  rating: number;
  review: string;
  title: string | null;
  date: Date | null;
  email: string | null;
}

export interface ReviewCsvParse {
  rows: ReviewCsvRow[];
  errors: { line: number; message: string }[];
}

/** RFC 4180-style CSV: quoted fields, doubled quotes, commas and newlines inside quotes, BOM, CRLF.
 * A quote opens a quoted field only at the start of a field — `The 2" pack` is plain text, not the
 * start of a field that would swallow every following row. `unclosedQuoteLine` is set when the file
 * ends inside a quoted field (the 1-based line where that field began). */
export function parseCsvText(text: string): { table: string[][]; unclosedQuoteLine: number | null } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let quoteStartLine = 0;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (c === "\n") line += 1;
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"' && field.trim() === "") {
      inQuotes = true;
      quoteStartLine = line;
      field = "";
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return { table: rows.filter((r) => r.some((cell) => cell.trim() !== "")), unclosedQuoteLine: inQuotes ? quoteStartLine : null };
}

/** Noon IST on the given day (a date with no time shouldn't drift across midnight), `null` when the
 * cell is empty, `"invalid"` when it can't be read. */
function parseDate(value: string): Date | null | "invalid" {
  const v = value.trim();
  if (!v) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  let iso: string | null = null;
  if (m) iso = `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (m) iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (!iso) return "invalid";
  const date = new Date(`${iso}T12:00:00+05:30`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? "invalid" : date;
}

export function parseReviewCsv(text: string): ReviewCsvParse {
  const { table, unclosedQuoteLine } = parseCsvText(text);
  const errors: ReviewCsvParse["errors"] = [];
  if (unclosedQuoteLine != null) {
    return { rows: [], errors: [{ line: unclosedQuoteLine, message: "A quoted field starting on this line is never closed — check for a missing \" in the file." }] };
  }
  if (table.length === 0) return { rows: [], errors: [{ line: 1, message: "The file is empty." }] };

  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => names.map((n) => header.indexOf(n)).find((i) => i !== -1) ?? -1;
  const idx = {
    product: col("product", "product_name", "product_slug"),
    reviewerName: col("reviewer_name", "name", "reviewer", "author"),
    rating: col("rating", "stars"),
    review: col("review", "body", "text"),
    title: col("title"),
    date: col("date", "review_date"),
    email: col("email"),
  };
  const missing = (["product", "reviewerName", "rating", "review"] as const).filter((k) => idx[k] === -1);
  if (missing.length > 0) {
    const label = { product: "product", reviewerName: "reviewer_name", rating: "rating", review: "review" };
    return { rows: [], errors: [{ line: 1, message: `Missing column(s): ${missing.map((k) => label[k]).join(", ")}.` }] };
  }

  const rows: ReviewCsvRow[] = [];
  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const get = (j: number) => (j === -1 ? "" : (cells[j] ?? "").trim());
    const rating = Number(get(idx.rating));
    const date = parseDate(get(idx.date));
    const problems = [
      !get(idx.product) && "no product",
      !get(idx.reviewerName) && "no reviewer name",
      !get(idx.review) && "no review text",
      !(Number.isInteger(rating) && rating >= 1 && rating <= 5) && "rating must be 1–5",
      date === "invalid" && "date must be YYYY-MM-DD or DD/MM/YYYY",
      // Dates are stored as noon IST, so "today" is fine at any hour: only a later day is refused.
      date instanceof Date && date.getTime() > Date.now() + 12 * 3600_000 && "date is in the future",
    ].filter(Boolean);
    if (problems.length > 0) {
      errors.push({ line, message: problems.join(", ") });
      return;
    }
    rows.push({
      line,
      product: get(idx.product),
      reviewerName: get(idx.reviewerName),
      rating,
      review: get(idx.review),
      title: get(idx.title) || null,
      date: date instanceof Date ? date : null,
      email: get(idx.email) || null,
    });
  });
  return { rows, errors };
}

/** Names the old CSV used that differ from the catalogue (kept from scripts/import-reviews-csv.ts). */
const NAME_ALIASES: Record<string, string> = {
  "blue tea + red tea duo": "blue tea + red tea (teabags)",
  "blue tea + red tea transformation combo (4 packs)": "blue tea + red tea (loose)",
  "red tea + blue tea gift combo": "red tea twin pack",
};
const SLUG_ALIASES: Record<string, string> = {
  "classic tea 250gm": "classic-tea-250gm",
  "classic tea 500gm": "classic-tea-500gm",
  "premium assam tea 250gm": "premium-aasam-tea-250gm",
  "premium assam tea 500gm": "premium-aasam-tea-500gm",
  "premium aasam tea 250gm": "premium-aasam-tea-250gm",
  "premium aasam tea 500gm": "premium-aasam-tea-500gm",
};

/** Finds the product a CSV row names — by slug, by exact name (case-insensitive), or by a known
 * alias. Never guesses at a "nearest" product: no match means the row is skipped and reported. When
 * two products share a name (Classic Tea 250 gm / 500 gm), only the slug or a weighted alias decides. */
export function matchProduct<P extends { id: number; slug: string; name: string }>(value: string, products: P[]): P | null {
  const key = value.trim().toLowerCase();
  const bySlug = products.find((p) => p.slug === key || p.slug === SLUG_ALIASES[key]);
  if (bySlug) return bySlug;
  const name = NAME_ALIASES[key] ?? key;
  const byName = products.filter((p) => p.name.trim().toLowerCase() === name);
  return byName.length === 1 ? byName[0] : null;
}
