import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { parseTiptapDoc, type TiptapMark, type TiptapNode } from "@/lib/content/tiptap-schema";

/**
 * The ONE renderer for Tiptap JSON (PROMPTS.md Phase 8 item 7): admin's live preview
 * (app/admin/content/[id]/PostForm.tsx) and the real storefront routes (app/blog/[slug],
 * app/recipes/[slug], policy pages) both import this exact component — never a second, divergent
 * renderer.
 *
 * Every node is turned into a real React element built from validated, typed data (text content
 * passed as `children`, never interpolated into an HTML string). There is no
 * `dangerouslySetInnerHTML` anywhere in this file. A hostile node — e.g. a text node containing
 * literal `<script>...</script>` — is rendered by React as an escaped text node (visible as inert
 * text, never parsed as markup); a node type outside the allowlist in lib/content/tiptap-schema.ts
 * is dropped entirely by `parseTiptapDoc` before this component ever sees it. See
 * lib/content/__tests__/tiptap-renderer.xss.test.tsx for the executable proof.
 */
export function TiptapRenderer({ doc }: { doc: unknown }) {
  const parsed = parseTiptapDoc(doc);
  return <div className="prose-content copy-justify">{parsed.content.map((node, i) => renderNode(node, i))}</div>;
}

function renderMarks(text: string, marks: TiptapMark[] | undefined, key: number): ReactNode {
  let node: ReactNode = text;
  for (const mark of marks ?? []) {
    if (mark.type === "bold") node = <strong key={key}>{node}</strong>;
    else if (mark.type === "italic") node = <em key={key}>{node}</em>;
    else if (mark.type === "link" && mark.attrs) {
      const href = mark.attrs.href;
      const external = /^https?:\/\//.test(href);
      node = external ? (
        <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow">
          {node}
        </a>
      ) : (
        <Link key={key} href={href}>
          {node}
        </Link>
      );
    }
  }
  return node;
}

function renderChildren(content: TiptapNode[] | undefined): ReactNode {
  if (!content) return null;
  return content.map((child, i) => {
    if (child.type === "text") return <span key={i}>{renderMarks(child.text, child.marks, i)}</span>;
    return renderNode(child, i);
  });
}

function renderNode(node: TiptapNode, key: number): ReactNode {
  if (node.type === "text") return <span key={key}>{renderMarks(node.text, node.marks, key)}</span>;

  switch (node.type) {
    case "paragraph":
      return (
        <p key={key} className="mb-4 text-base leading-relaxed text-ink-2">
          {renderChildren(node.content)}
        </p>
      );
    case "heading": {
      const level = typeof node.attrs?.level === "number" ? Math.min(4, Math.max(1, node.attrs.level)) : 2;
      const className = "mb-3 mt-8 font-display font-semibold text-ink";
      const text = renderChildren(node.content);
      if (level === 1) return <h2 key={key} className={className + " text-2xl"}>{text}</h2>;
      if (level === 2) return <h2 key={key} className={className + " text-2xl"}>{text}</h2>;
      if (level === 3) return <h3 key={key} className={className + " text-xl"}>{text}</h3>;
      return <h4 key={key} className={className + " text-lg"}>{text}</h4>;
    }
    case "bulletList":
      return (
        <ul key={key} className="mb-4 list-disc space-y-1 pl-6 text-ink-2">
          {renderChildren(node.content)}
        </ul>
      );
    case "orderedList":
      return (
        <ol key={key} className="mb-4 list-decimal space-y-1 pl-6 text-ink-2">
          {renderChildren(node.content)}
        </ol>
      );
    case "listItem":
      return <li key={key}>{renderChildren(node.content)}</li>;
    case "blockquote":
      return (
        <blockquote key={key} className="mb-4 border-l-2 border-[var(--color-gold)] pl-4 italic text-ink-2">
          {renderChildren(node.content)}
        </blockquote>
      );
    case "hardBreak":
      return <br key={key} />;
    case "image": {
      const src = typeof node.attrs?.src === "string" ? node.attrs.src : null;
      if (!src) return null;
      const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
      return (
        <span key={key} className="mb-4 block overflow-hidden rounded-lg border border-line bg-surface-2">
          <Image src={src} alt={alt} width={1200} height={800} sizes="(max-width: 768px) 100vw, 800px" className="h-auto w-full" />
        </span>
      );
    }
    default:
      return null;
  }
}
