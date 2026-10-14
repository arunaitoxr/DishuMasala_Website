"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { useEffect } from "react";
import type { TiptapDoc } from "@/lib/content/tiptap-schema";

/**
 * The admin's Tiptap editing surface (PROMPTS.md Phase 8 item 6) — headings, lists, links, images,
 * quotes, matching exactly the node/mark allowlist in lib/content/tiptap-schema.ts (StarterKit's
 * default extension set already only produces paragraph/heading/bulletList/orderedList/listItem/
 * blockquote/hardBreak/bold/italic, so nothing it emits falls outside that allowlist). Emits
 * `editor.getJSON()` on every change via `onChange` — the parent form owns the actual JSON value
 * and is what gets sent to the server action on save.
 */
export function TiptapEditor({
  content,
  onChange,
  onRequestImage,
}: {
  content: TiptapDoc;
  onChange: (doc: TiptapDoc) => void;
  /** Opens the same drag-and-drop-to-storage image upload flow products use, returning a public URL to
   * insert — passed in by the parent so this component doesn't need its own storage/product coupling. */
  onRequestImage: () => Promise<{ url: string; alt: string } | null>;
}) {
  const editor = useEditor({
    extensions: [
      // StarterKit v3 brings more than the stored-content allowlist (lib/content/tiptap-schema.ts)
      // accepts — strike, underline, inline code, code blocks, horizontal rules, h5/h6, and its own
      // Link. Reachable by shortcut, "---" / "```" or paste, any of them made the post fail to save
      // with a bare "Invalid input". Switching them off keeps the editor and the schema in step, and
      // configuring StarterKit's Link replaces the second Link that was registered on top of it.
      StarterKit.configure({
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer nofollow" } },
      }),
      Image,
    ],
    content: content as unknown as Record<string, unknown>,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      // A plain-JSON copy, not getJSON() itself: ProseMirror builds node `attrs` (heading level, image
      // src/alt) with a null prototype, and the server-action serializer can't send such an object as
      // data — it arrived on the server as an opaque reference, so every post or page containing a
      // heading or an image failed to save with "Invalid input".
      onChange(JSON.parse(JSON.stringify(editor.getJSON())) as TiptapDoc);
    },
    editorProps: {
      attributes: {
        class: "prose-content min-h-[300px] rounded-md border border-line bg-surface p-4 text-ink focus:outline-none",
      },
    },
  });

  // Keep the editor in sync if the parent resets `content` out from under it (e.g. loading a
  // different post) — Tiptap otherwise only reads `content` on first mount.
  useEffect(() => {
    if (editor && JSON.stringify(editor.getJSON()) !== JSON.stringify(content)) {
      editor.commands.setContent(content as unknown as Record<string, unknown>, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-sync on identity change of the doc from the parent, not on every local edit
  }, [editor]);

  if (!editor) return null;

  async function insertImage() {
    const picked = await onRequestImage();
    if (picked) editor!.chain().focus().setImage({ src: picked.url, alt: picked.alt }).run();
  }

  function setLink() {
    const url = window.prompt("Link URL (https:// or /path)");
    if (url === null) return;
    if (url === "") {
      editor!.chain().focus().unsetLink().run();
      return;
    }
    editor!.chain().focus().setLink({ href: url }).run();
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1 rounded-md border border-line bg-surface-2 p-1.5">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}>Bold</ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}>Italic</ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })}>H2</ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })}>H3</ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}>Bullets</ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}>Numbered</ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")}>Quote</ToolbarButton>
        <ToolbarButton onClick={setLink} active={editor.isActive("link")}>Link</ToolbarButton>
        <ToolbarButton onClick={() => void insertImage()} active={false}>Image</ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarButton({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded px-2.5 py-1.5 text-xs font-medium ${active ? "bg-ink text-surface" : "text-ink-2 hover:bg-surface"}`}
    >
      {children}
    </button>
  );
}
