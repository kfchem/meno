import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FADE } from "../../../theme/motion";

/** What the empty page says, in its two short lines (docs/WORKSPACE.md, *First steps*). */
export const EMPTY_PAGE_LINES = ["Double-click to add", "or drop a file"] as const;
/** The whole of it as one sentence, for a screen reader. */
export const EMPTY_PAGE_LINE = "Double-click to add, or drop a file.";

/** The mark's rings at rest, and as they brighten. */
const REST = 0.3;
const BRIGHT = 0.9;
/** One round of brightening: twice, in quick succession - a double-click, drawn - taking this long (s); the outer ring follows the inner by `LAG`. */
const ROUND = 1.2;
const LAG = 0.12;
/** From the line's appearance: the first round after this (s), then twice more `EVERY` seconds apart (start to start); then the mark rests. */
const FIRST = 0.3;
const EVERY = 5;

const round = (delay: number) => ({
  opacity: [REST, BRIGHT, REST, BRIGHT, REST, REST],
  transition: { duration: ROUND, times: [0, 0.12, 0.24, 0.36, 0.48, 1], delay, repeat: 2, repeatDelay: EVERY - ROUND, ease: "easeInOut" as const },
});

/**
 * One quiet mark and two short lines in the middle of the page in view, where it holds nothing at all and nothing is in hand: eased in and
 * out (`show`). The mark is two thin rings in Meno's colour that brighten one after the other, twice, as the line appears and twice more
 * a few seconds apart, then rest - no round where the system asks for less motion. Opacity only. Not an object of the page - never saved,
 * exported, printed, selected or filmed: HTML over it, taking no pointer, still as the page is zoomed or moved.
 * `right`: how much of the page's right side is covered (the column over it), so the line stands in the middle of what is seen.
 */
export default function EmptyPageLine({ show, right = 0 }: { show: boolean; right?: number }) {
  const still = useReducedMotion();
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="empty-page-line"
          {...FADE}
          role="img"
          aria-label={EMPTY_PAGE_LINE}
          data-empty-page-line
          className="pointer-events-none absolute inset-y-0 left-0 z-10 flex select-none items-center justify-center"
          style={{ right }}
        >
          <div className="flex flex-col items-center gap-[5px]">
            <svg width={34} height={34} viewBox="0 0 34 34" fill="none" stroke="currentColor" strokeWidth={1.4} className="text-accel-base" aria-hidden>
              <motion.circle cx={17} cy={17} r={5} initial={{ opacity: REST }} animate={still ? undefined : round(FIRST)} />
              <motion.circle cx={17} cy={17} r={11} initial={{ opacity: REST }} animate={still ? undefined : round(FIRST + LAG)} />
            </svg>
            <span className="text-xs text-gh-gray">{EMPTY_PAGE_LINES[0]}</span>
            <span className="text-[11px] text-gh-gray">{EMPTY_PAGE_LINES[1]}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
