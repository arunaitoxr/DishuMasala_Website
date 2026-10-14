import { describe, expect, it } from "vitest";
import { matchProduct, parseReviewCsv } from "@/lib/reviews/csv";

describe("parseReviewCsv", () => {
  it("reads quoted fields, optional columns and both date formats", () => {
    const csv = [
      "Product,Reviewer_Name,Rating,Review,Title,Date",
      'Coriander Powder,Asha,5,"Fresh, aromatic — ""like home""",Lovely,2026-09-01',
      "coriander-powder,Ravi,4,Good,,15/08/2026",
    ].join("\r\n");
    const { rows, errors } = parseReviewCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ line: 2, reviewerName: "Asha", rating: 5, review: 'Fresh, aromatic — "like home"', title: "Lovely" });
    expect(rows[0].date?.toISOString()).toBe("2026-09-01T06:30:00.000Z");
    expect(rows[1]).toMatchObject({ title: null });
    expect(rows[1].date?.toISOString()).toBe("2026-08-15T06:30:00.000Z");
  });

  it("reports bad rows by line and keeps the good ones", () => {
    const csv = "product,reviewer_name,rating,review,date\nA,Asha,7,Nice,\nB,,4,Ok,\nC,Ravi,5,Great,31/02/2026\nD,Mona,3,Fine,";
    const { rows, errors } = parseReviewCsv(csv);
    expect(rows.map((r) => r.product)).toEqual(["D"]);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4]);
    expect(errors[0].message).toContain("rating must be 1–5");
  });

  it("names missing required columns", () => {
    expect(parseReviewCsv("product,rating\nA,5").errors[0].message).toContain("reviewer_name, review");
  });
});

describe("matchProduct", () => {
  const products = [
    { id: 1, slug: "coriander-powder", name: "Coriander Powder" },
    { id: 2, slug: "classic-tea-250gm", name: "Classic Tea" },
    { id: 3, slug: "classic-tea-500gm", name: "Classic Tea" },
  ];
  it("matches by slug or exact name, never guesses", () => {
    expect(matchProduct("CORIANDER POWDER", products)?.id).toBe(1);
    expect(matchProduct("classic-tea-500gm", products)?.id).toBe(3);
    expect(matchProduct("Classic Tea 250gm", products)?.id).toBe(2);
    expect(matchProduct("Classic Tea", products)).toBeNull(); // two products share the name
    expect(matchProduct("Coriander", products)).toBeNull();
  });
});
