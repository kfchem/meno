import { LockClosedIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { openLocked } from "../../../lib/pdf/unlock";
import type { PdfItem } from "./store/types";
import { useEditorStore } from "./store";

/**
 * What the column shows of a PDF locked with a password it was not opened
 * with (docs/PDF.md, *Locked with a password*): what it is, and a field for
 * the password. Enter, or Open, tries it; a wrong one is said so, in words,
 * and may be tried again as often as there is need. What is typed lives here,
 * in this field, and goes to the reader and nowhere else - never into the
 * workspace, its undo, or its file; it is let go as the PDF opens.
 */
export default function LockedPdf({ pdf }: { pdf: PdfItem }) {
  const store = useEditorStore();
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!typed || busy) return;
    setBusy(true);
    const said = await openLocked(pdf.sha256, typed, (sha, pages) => store.getState().setPdfPages(sha, pages));
    setBusy(false);
    setProblem(said);
    // (kept no longer than it is tried: a wrong one is typed again)
    setTyped("");
  };
  return (
    <div className="absolute inset-0 flex items-start justify-center px-4 pt-10 pointer-events-none">
      <form
        className="pointer-events-auto w-full max-w-72 rounded-lg border border-gh-line bg-white px-4 py-3.5 text-xs text-gh-black shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex items-center gap-2 font-medium">
          <LockClosedIcon className="h-4 w-4 shrink-0 text-gh-gray" />
          <span className="truncate">Locked with a password</span>
        </div>
        <p className="mt-1 break-words text-gh-gray">{pdf.name}</p>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="password"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            aria-label={`The password of ${pdf.name}`}
            placeholder="Password"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="h-7 min-w-0 flex-1 rounded-md border border-gh-line bg-white px-2 text-xs text-gh-black outline-none focus:border-accel-base"
          />
          <button type="submit" disabled={busy || !typed} className="h-7 shrink-0 rounded-md border border-gh-line bg-white px-3 text-xs text-gh-black enabled:hover:bg-gh-gray/10 disabled:text-gh-gray">
            Open
          </button>
        </div>
        {problem && (
          <p role="alert" className="mt-2 text-accel-accent">
            {problem}
          </p>
        )}
      </form>
    </div>
  );
}
