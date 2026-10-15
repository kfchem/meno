import { motion } from "motion/react";
import { FADE, RISE } from "../theme/motion";
import { QUESTION_ARRIVING_MS, useLeaving } from "../theme/leaving";
import { useEffect, useRef } from "react";
import { useAskedKeys } from "./asking";

/**
 * Asks before something with unsaved changes is closed. Drawn in the page
 * rather than as a system dialog, so it looks the same on every platform and
 * shows up in a window capture.
 *
 * The choice is to keep it open, to let the changes go, or - where what has
 * them can be saved - to save them first.
 */
export default function ConfirmDiscard({
  title,
  message,
  discardLabel,
  onCancel,
  onDiscard,
  onSave,
}: {
  title: string;
  message: string;
  discardLabel: string;
  onCancel: () => void;
  onDiscard: () => void;
  /** Saves first, where what has the changes can be saved. */
  onSave?: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // (going, it does nothing more as it fades; come, it takes no click for a moment - one meant for what was there before is no answer: theme/leaving)
  const { held } = useLeaving(QUESTION_ARRIVING_MS);
  useEffect(() => {
    // Keeping is the safe answer, so it is the one a stray Enter gives.
    cancelRef.current?.focus();
  }, []);
  // (the keys its own while it asks: Escape keeps it open, and nothing behind it acts on one)
  useAskedKeys(boxRef, onCancel);

  return (
    <motion.div
      {...FADE}
      {...held}
      className="absolute inset-0 z-[100] flex items-center justify-center bg-black/20"
      onPointerDown={(e) => {
        // A press outside the box is a way of saying no.
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <motion.div
        ref={boxRef}
        {...RISE}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-discard-title"
        className="w-[360px] max-w-[90%] rounded-lg border border-gh-line bg-white shadow-lg p-4 text-sm text-gh-black"
      >
        <h2 id="confirm-discard-title" className="font-semibold mb-2 break-words">
          {title}
        </h2>
        <p className="text-gh-gray mb-4">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="rounded-md border border-gh-line px-3 py-1.5 transition-colors duration-150 ease-meno hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={onDiscard}
            className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-red-700 transition-colors duration-150 ease-meno hover:bg-red-100"
          >
            {discardLabel}
          </button>
          {onSave && (
            <button
              onClick={onSave}
              className="rounded-md border border-gh-line bg-gh-black px-3 py-1.5 text-white transition-colors duration-150 ease-meno hover:bg-gray-800"
            >
              Save
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
