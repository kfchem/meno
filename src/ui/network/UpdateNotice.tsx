import { AnimatePresence, motion } from "motion/react";
import { usePresentingWindow } from "../presenting";
import { RISE } from "../theme/motion";
import { useState } from "react";
import { readySaid, restartIntoUpdate, useUpdate } from "../../lib/update";

/**
 * A newer Meno downloaded: said once, in a corner, with a restart into it
 * at once - it goes in when Meno is quit anyway. While jobs wait or run
 * that installing would stop, that is said, and the restart waits too.
 */
export default function UpdateNotice() {
  const ready = useUpdate((s) => (s?.phase === "ready" ? s.version : null));
  const held = useUpdate((s) => s?.held ?? 0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  // (not over a talk given in the window: ../presenting)
  const talking = usePresentingWindow((s) => s.on);
  const shown = !!ready && dismissed !== ready && !talking;
  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key="update"
          {...RISE}
          role="status"
          className="fixed bottom-3 left-3 z-50 max-w-sm flex items-center gap-3 rounded-md border border-gh-line bg-white/95 shadow-sm px-3 py-2 text-xs text-gh-black"
        >
          <span className="flex-1">{readySaid({ version: ready, held })}</span>
          <button
            disabled={held > 0}
            onClick={() => void restartIntoUpdate()}
            className="shrink-0 h-7 px-2.5 rounded-md border border-gh-line transition-[color,background-color,opacity] duration-150 ease-meno hover:bg-gh-base disabled:opacity-50 disabled:hover:bg-transparent"
          >
            Restart now
          </button>
          <button
            onClick={() => setDismissed(ready)}
            className="shrink-0 underline text-gh-gray transition-colors duration-150 ease-meno hover:text-gh-black"
          >
            Later
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
