"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { importReviewCsvAction, previewReviewCsvAction, type CsvPreview } from "../actions";

/** Upload → preview (nothing written) → import. Invalid and unmatched rows are listed and skipped. */
export function ImportReviews() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [publish, setPublish] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    setError(null);
    setDone(null);
    setPreview(null);
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("The file is larger than 2 MB — split it into smaller files.");
      return;
    }
    const content = await file.text();
    setText(content);
    setFileName(file.name);
    startTransition(async () => {
      const result = await previewReviewCsvAction(content);
      if (!result.ok) setError(result.error);
      else setPreview(result.data ?? null);
    });
  }

  function runImport() {
    if (!text) return;
    setError(null);
    startTransition(async () => {
      const result = await importReviewCsvAction(text, publish);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(result.message);
      setPreview(null);
      setText(null);
      router.refresh();
    });
  }

  return (
    <div className="max-w-3xl space-y-5">
      <section className="space-y-3 rounded-lg border border-line bg-surface p-5">
        <label htmlFor="csv" className="block text-sm font-medium text-ink">CSV file</label>
        <input id="csv" type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} className="block text-sm text-ink" />
        <p className="text-xs text-ink-3">
          Columns: <code>product</code> (name or slug), <code>reviewer_name</code>, <code>rating</code> (1–5), <code>review</code>; optional <code>title</code>,{" "}
          <code>date</code> (YYYY-MM-DD or DD/MM/YYYY), <code>email</code>. Max 2 MB.
        </p>
      </section>

      {pending && <p className="text-sm text-ink-2">Reading {fileName}…</p>}
      {error && <div role="alert" className="rounded-md border border-crit/30 bg-crit/5 px-4 py-3 text-sm text-crit">{error}</div>}
      {done && <div role="status" className="rounded-md border border-ok/30 bg-ok/5 px-4 py-3 text-sm text-ok">{done}</div>}

      {preview && (
        <section className="space-y-4 rounded-lg border border-line bg-surface p-5">
          <h2 className="font-display text-lg font-semibold text-ink">Preview — nothing imported yet</h2>
          <p className="text-sm text-ink">
            <strong>{preview.ready}</strong> review{preview.ready === 1 ? "" : "s"} ready to import
            {preview.invalid.length + preview.unmatched.length > 0 && <> · {preview.invalid.length + preview.unmatched.length} will be skipped</>}
          </p>
          {preview.sample.length > 0 && (
            <ul className="space-y-2 text-sm">
              {preview.sample.map((r, i) => (
                <li key={i} className="rounded-md bg-surface-2 px-3 py-2">
                  <span className="font-medium">{r.product}</span> · {"★".repeat(r.rating)} · {r.reviewerName}
                  {r.date ? ` · ${r.date}` : ""} — <span className="text-ink-2">{r.review.length > 120 ? `${r.review.slice(0, 120)}…` : r.review}</span>
                </li>
              ))}
            </ul>
          )}
          {preview.unmatched.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-warn">{preview.unmatched.length} row(s) name a product that doesn&apos;t exist</summary>
              <ul className="mt-2 list-disc pl-5 text-ink-2">
                {preview.unmatched.map((u) => (
                  <li key={u.line}>Line {u.line}: “{u.product}”</li>
                ))}
              </ul>
            </details>
          )}
          {preview.invalid.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-crit">{preview.invalid.length} row(s) have problems</summary>
              <ul className="mt-2 list-disc pl-5 text-ink-2">
                {preview.invalid.map((e) => (
                  <li key={e.line}>Line {e.line}: {e.message}</li>
                ))}
              </ul>
            </details>
          )}
          {preview.ready > 0 && (
            <>
              <label className="flex items-center gap-2 text-sm text-ink">
                <Checkbox checked={publish} onCheckedChange={(c) => setPublish(c === true)} />
                Publish them on the site straight away (otherwise they wait as pending)
              </label>
              <Button type="button" variant="solid-ink" disabled={pending} onClick={runImport}>
                Import {preview.ready} review{preview.ready === 1 ? "" : "s"}
              </Button>
            </>
          )}
        </section>
      )}
    </div>
  );
}
