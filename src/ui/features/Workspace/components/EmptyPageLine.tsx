import { AnimatePresence, motion } from "motion/react";
import { FADE } from "../../../theme/motion";

/** The words of the one quiet line on an empty page (docs/WORKSPACE.md, *First steps*). */
export const EMPTY_PAGE_LINE = "Double-click to add something, or drop a file here.";

/**
 * One quiet grey line in the middle of the page in view, where it holds nothing at all: eased in and out (`show`). Not an object of the
 * page - never saved, exported, printed, selected or filmed: HTML over it, taking no pointer, still as the page is zoomed or moved.
 * `right`: how much of the page's right side is covered (the column over it), so the line stands in the middle of what is seen.
 */
export default function EmptyPageLine({ show, right = 0 }: { show: boolean; right?: number }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="empty-page-line"
          {...FADE}
          aria-hidden
          data-empty-page-line
          className="pointer-events-none absolute inset-y-0 left-0 z-10 flex select-none items-center justify-center text-sm text-gh-gray"
          style={{ right }}
        >
          {EMPTY_PAGE_LINE}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
