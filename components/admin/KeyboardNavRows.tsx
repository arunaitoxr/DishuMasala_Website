"use client";

import { useRouter } from "next/navigation";
import type { ReactNode, KeyboardEvent, MouseEvent } from "react";

/**
 * The keyboard-navigation layer for DataTable (PROMPTS.md Phase 7 item 2: "keyboard navigation
 * (arrow keys/Enter on rows, not just Tab-through)"). Receives the server-rendered `<tbody>` as
 * `children` — a plain ReactNode, safe to pass across the server/client boundary — and adds
 * ArrowUp/ArrowDown to move focus between `[data-row-href]` rows and Enter/Space to navigate,
 * entirely via DOM event delegation so it needs no knowledge of the row data itself.
 */
/** Anything inside a row that does its own thing on click or Enter — a link, a button, a form field,
 * the row's Edit/Delete actions — is left alone rather than treated as "open this row". */
const INTERACTIVE = "a, button, input, select, textarea, label, [role='button'], [role='checkbox'], [data-row-actions]";

export function KeyboardNavRows({ children }: { children: ReactNode }) {
  const router = useRouter();

  // Clicking anywhere on a row opens it — rows always looked clickable (pointer cursor, hover), but
  // only the keyboard could open them, so mouse users had no way into a coupon, review or customer.
  function handleClick(e: MouseEvent<HTMLTableSectionElement>) {
    const target = e.target as HTMLElement;
    if (target.closest(INTERACTIVE)) return;
    const href = target.closest<HTMLElement>("[data-row-href]")?.dataset.rowHref;
    if (!href) return;
    if (window.getSelection()?.toString()) return; // selecting text in a cell, not opening the row
    if (e.metaKey || e.ctrlKey) {
      window.open(href, "_blank", "noopener");
      return;
    }
    router.push(href);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTableSectionElement>) {
    const target = e.target as HTMLElement;
    const row = target.closest<HTMLElement>("[data-row-href]");
    if (!row) return;
    // Enter/Space on a button or link inside the row belongs to that control.
    if (target !== row && target.closest(INTERACTIVE)) return;

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const rows = Array.from(row.parentElement?.querySelectorAll<HTMLElement>("[data-row-href]") ?? []);
      const index = rows.indexOf(row);
      const nextIndex = e.key === "ArrowDown" ? Math.min(index + 1, rows.length - 1) : Math.max(index - 1, 0);
      rows[nextIndex]?.focus();
      return;
    }

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const href = row.dataset.rowHref;
      if (href) router.push(href);
    }
  }

  return (
    <tbody onKeyDown={handleKeyDown} onClick={handleClick}>
      {children}
    </tbody>
  );
}
