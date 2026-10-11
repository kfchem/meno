import { motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { FADE, RISE } from "../../theme/motion";
import { HIDE_H_TEXT, HIDE_H_TITLE, HIDE_H_UNDERSTOOD } from "./hideHydrogensText";

/**
 * Asked before a style hides the hydrogens on carbon: a molecule drawn so
 * is wrong, and everyone who sees the picture is misled by it. The
 * maintainer's ruling (2026-10-10): only past a warning as strong as can
 * be, never by default, for pictures and never for research - so it is a
 * box in the way, not a note; keeping them is the answer a stray Enter or
 * Escape gives, and hiding them waits for the chemist to say they know
 * what it does. The wording is the maintainer's choice; change it only
 * with them.
 */
export default function HideHydrogensAsk({ onKeep, onHide }: { onKeep: () => void; onHide: () => void }) {
  const [understood, setUnderstood] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    keepRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onKeep();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKeep]);

  return (
    <motion.div
      {...FADE}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30"
      onPointerDown={(e) => {
        // (a press outside the box keeps them)
        if (e.target === e.currentTarget) onKeep();
      }}
    >
      <motion.div
        {...RISE}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-text`}
        className="w-[480px] max-w-[90%] rounded-lg border border-accel-accent/50 bg-white shadow-lg p-5 text-sm text-gh-black"
      >
        <h2 id={`${id}-title`} className="text-base font-semibold mb-3 text-accel-accent">
          {HIDE_H_TITLE}
        </h2>
        <div id={`${id}-text`} className="space-y-2 text-gh-black leading-relaxed">
          {HIDE_H_TEXT.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        <label className="mt-4 flex items-start gap-2 rounded-md border border-gh-line bg-gh-base px-3 py-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-accel-accent"
          />
          <span>{HIDE_H_UNDERSTOOD}</span>
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onHide}
            disabled={!understood}
            className="rounded-md border border-accel-accent/50 bg-white px-3 py-1.5 text-accel-accent transition-[color,background-color,opacity] duration-150 ease-meno hover:bg-accel-lightaccent/60 disabled:opacity-40 disabled:hover:bg-white"
          >
            Hide hydrogens anyway
          </button>
          <button
            ref={keepRef}
            onClick={onKeep}
            className="rounded-md border border-gh-line bg-gh-black px-3 py-1.5 text-white transition-colors duration-150 ease-meno hover:bg-gray-800"
          >
            Keep hydrogens
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
