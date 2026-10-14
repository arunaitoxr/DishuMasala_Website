import { describe, expect, it } from "vitest";
import { tiptapDocSchema } from "@/lib/content/tiptap-schema";

describe("tiptapDocSchema", () => {
  it("accepts the image node Tiptap actually emits (alt/title null)", () => {
    const doc = {
      type: "doc",
      content: [{ type: "image", attrs: { src: "https://example.com/a.webp", alt: null, title: null } }],
    };
    expect(tiptapDocSchema.safeParse(doc).success).toBe(true);
  });

  it("still rejects node types outside the allowlist", () => {
    const doc = { type: "doc", content: [{ type: "codeBlock", content: [{ type: "text", text: "x" }] }] };
    expect(tiptapDocSchema.safeParse(doc).success).toBe(false);
  });
});
