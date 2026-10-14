/**
 * The typed contract for Tiptap JSON documents stored in `posts.body` / `pages.body` (jsonb).
 *
 * This is the ONE place that decides which Tiptap node/mark shapes this project accepts — a
 * narrow, explicit allowlist (paragraph, heading, bullet/ordered lists, blockquote, image, hard
 * break, plus text with bold/italic/link marks). `components/content/TiptapRenderer.tsx` renders
 * only what validates against this schema, as real React elements (never
 * `dangerouslySetInnerHTML`), so a hostile node — e.g. a script-in-text or an `onerror` attribute
 * smuggled into an href — either fails validation and is dropped, or ends up as inert text/props
 * React itself escapes. See lib/content/__tests__/tiptap-renderer.xss.test.tsx for the proof.
 */
import { z } from "zod";

const markSchema: z.ZodType<TiptapMark> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("bold") }),
    z.object({ type: z.literal("italic") }),
    z.object({
      type: z.literal("link"),
      attrs: z.object({
        // Only http(s) and relative/mailto links — never "javascript:" or other schemes.
        href: z.string().refine(isSafeHref, "unsafe href"),
        target: z.string().nullish(),
        rel: z.string().nullish(),
      }),
    }),
  ]),
);

export interface TiptapMark {
  type: "bold" | "italic" | "link";
  attrs?: { href: string; target?: string | null; rel?: string | null };
}

function isSafeHref(href: string): boolean {
  if (href.startsWith("/") || href.startsWith("#")) return true;
  try {
    const url = new URL(href, "https://example.com");
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

export interface TiptapTextNode {
  type: "text";
  text: string;
  marks?: TiptapMark[];
}

export interface TiptapElementNode {
  type:
    | "doc"
    | "paragraph"
    | "heading"
    | "bulletList"
    | "orderedList"
    | "listItem"
    | "blockquote"
    | "image"
    | "hardBreak";
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
}

export type TiptapNode = TiptapTextNode | TiptapElementNode;

const textNodeSchema: z.ZodType<TiptapTextNode> = z.object({
  type: z.literal("text"),
  text: z.string(),
  marks: z.array(markSchema).optional(),
});

const elementNodeSchema: z.ZodType<TiptapElementNode> = z.lazy(() =>
  z.object({
    type: z.enum(["doc", "paragraph", "heading", "bulletList", "orderedList", "listItem", "blockquote", "image", "hardBreak"]),
    attrs: z
      .object({
        level: z.number().int().min(1).max(4).optional(),
        src: z.string().url().optional(),
        // Tiptap's Image node always emits `alt`/`title`, as null when empty — `.optional()` alone
        // rejected that null and failed every save of a post or page with an inline image.
        alt: z.string().nullish(),
        title: z.string().nullish(),
      })
      .catchall(z.unknown())
      .optional(),
    content: z.array(nodeSchema).optional(),
  }),
);

const nodeSchema: z.ZodType<TiptapNode> = z.lazy(() => z.union([textNodeSchema, elementNodeSchema]));

export const tiptapDocSchema = z.object({
  type: z.literal("doc"),
  content: z.array(nodeSchema).default([]),
});

export type TiptapDoc = z.infer<typeof tiptapDocSchema>;

/** Parses and sanitizes an arbitrary JSON value into a safe TiptapDoc — an empty doc for anything
 * malformed rather than throwing, so a corrupt/legacy row still renders as "no content" instead of
 * crashing the page. */
export function parseTiptapDoc(value: unknown): TiptapDoc {
  const result = tiptapDocSchema.safeParse(value);
  if (result.success) return result.data;
  return { type: "doc", content: [] };
}

/** Real word count from the document's actual text nodes (never guessed) — used for reading time. */
export function wordCount(doc: TiptapDoc): number {
  let words = 0;
  function walk(nodes: TiptapNode[] | undefined): void {
    if (!nodes) return;
    for (const node of nodes) {
      if (node.type === "text") {
        words += node.text.trim().split(/\s+/).filter(Boolean).length;
      } else {
        walk(node.content);
      }
    }
  }
  walk(doc.content);
  return words;
}

/** Minutes to read at 200wpm, minimum 1. */
export function readingTimeMinutes(doc: TiptapDoc): number {
  return Math.max(1, Math.round(wordCount(doc) / 200));
}

/** Flattened plain text (for excerpts/JSON-LD description fallbacks) — never HTML. */
export function plainText(doc: TiptapDoc): string {
  const parts: string[] = [];
  function walk(nodes: TiptapNode[] | undefined): void {
    if (!nodes) return;
    for (const node of nodes) {
      if (node.type === "text") parts.push(node.text);
      else walk(node.content);
    }
  }
  walk(doc.content);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
