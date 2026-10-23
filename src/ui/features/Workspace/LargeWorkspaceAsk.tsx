import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { useInFront } from "../../layouts/inFront";
import { megabytes } from "./workflow/keptJobs";

/**
 * Asked before a save that takes a workspace past the size Settings says
 * (docs/FILE-IO.md, *A step's jobs*): about how large it comes to, its
 * largest steps by what their jobs' files add, and whether to keep no raw
 * outputs of those - or save it all, as it is. Nothing is left out unless
 * asked. Past what a workspace's file may come to (`most`), it says it
 * cannot be saved as it is, and offers only to keep no raw outputs of
 * those steps. A card over the canvas, not a dialog, so that the steps it
 * names stay in view.
 */
export default function LargeWorkspaceAsk({
  bytes,
  threshold,
  steps,
  most,
  onKeepNoRaw,
  onSaveAll,
  onCancel,
}: {
  bytes: number;
  threshold: number;
  /** The largest steps, by name, with what their jobs' files add. */
  steps: { name: string; bytes: number }[];
  /** The most a workspace's file may come to, where this one would be past it. */
  most?: number;
  onKeepNoRaw: () => void;
  onSaveAll: () => void;
  onCancel: () => void;
}) {
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);
  // (Escape cancels while its tab is in front)
  const inFront = useInFront();
  useEffect(() => {
    if (!inFront) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, inFront]);
  return (
    <motion.div
      role="dialog"
      aria-labelledby="large-workspace-title"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
      className="absolute top-3 left-1/2 -translate-x-1/2 z-50 w-[420px] max-w-[90%] rounded-lg border border-gh-line bg-white/95 shadow-lg p-3 text-sm text-gh-black"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="large-workspace-title" className="font-semibold mb-1">
        {most ? "Too large to open again" : "A large workspace"}
      </h2>
      <p className="text-gh-gray mb-2">
        {most
          ? `Saved, it would come to about ${megabytes(bytes)}: a workspace file Meno can open again holds at most ${megabytes(most)}. Nothing is saved as it is. The largest steps:`
          : `Saved, it comes to about ${megabytes(bytes)}, past ${megabytes(threshold)}. It keeps every file its steps' jobs wrote. The largest:`}
      </p>
      <ul className="mb-2 text-gh-black">
        {steps.map((s, i) => (
          <li key={i} className="flex justify-between gap-3">
            <span className="truncate">{s.name}</span>
            <span className="tabular-nums text-gh-gray">{megabytes(s.bytes)}</span>
          </li>
        ))}
      </ul>
      <p className="text-gh-gray mb-3">
        Raw outputs are kept as the programs wrote them, and can name this computer's user, host and folders. Without them, these steps keep what their
        jobs were given, what Meno read back, and their logs.
      </p>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-md border border-gh-line px-3 py-1.5 hover:bg-gray-100">
          Cancel
        </button>
        <button
          ref={most ? firstRef : undefined}
          onClick={onKeepNoRaw}
          className={most ? "rounded-md border border-accel-base bg-accel-lightbase px-3 py-1.5 hover:brightness-95" : "rounded-md border border-gh-line px-3 py-1.5 hover:bg-gray-100"}
        >
          Don't keep their raw outputs
        </button>
        {!most && (
          <button ref={firstRef} onClick={onSaveAll} className="rounded-md border border-accel-base bg-accel-lightbase px-3 py-1.5 hover:brightness-95">
            Save it all
          </button>
        )}
      </div>
    </motion.div>
  );
}
