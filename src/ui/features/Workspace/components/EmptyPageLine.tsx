import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { EASE, EASE_LEAVE, FADE } from "../../../theme/motion";
import { EMPTY_PAGE_MARK, emptyPageMarkMotion, markUnderPointer, pointerInsideMark, pointerRippleMotion } from "../utils/emptyPage";

/** What the empty page says, in its two short lines (docs/WORKSPACE.md, *First steps*). */
export const EMPTY_PAGE_LINES = ["Double-click to add", "or drop a file"] as const;
/** The whole of it as one sentence, for a screen reader. */
export const EMPTY_PAGE_LINE = "Double-click to add, or drop a file.";

/** Where a ripple grows from: its own middle, as an SVG shape's box (not the drawing's corner). */
const FROM_MIDDLE = { transformBox: "fill-box", transformOrigin: "center" } as const;

/**
 * Whether the pointer rests inside the mark, and the ripples it has had born (`markUnderPointer`). The mark takes no pointer: the page
 * under it hears every press, drag, wheel and menu as anywhere else; this only listens on the window, stopping nothing, and measures the
 * mark's middle once and again only as the space it stands in is resized - never per move. A touch has no hover: only a mouse or a pen.
 */
function useMarkUnderPointer(lessMotion: boolean) {
  const mark = useRef<SVGSVGElement>(null);
  const [under, setUnder] = useState({ awake: false, born: 0 });
  const less = useRef(lessMotion);
  less.current = lessMotion;
  useEffect(() => {
    const svg = mark.current;
    if (!svg) return;
    let middle = { x: 0, y: 0 };
    const measure = () => {
      const r = svg.getBoundingClientRect();
      middle = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    measure();
    const space = new ResizeObserver(measure);
    space.observe(svg.closest("[data-empty-page-line]") ?? svg);
    const at = (inside: boolean) => setUnder((was) => markUnderPointer(was, inside, less.current));
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "touch") at(pointerInsideMark(e.clientX - middle.x, e.clientY - middle.y));
    };
    const out = (e: PointerEvent) => {
      if (!e.relatedTarget) at(false);
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerout", out, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      space.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerout", out);
      window.removeEventListener("resize", measure);
    };
  }, []);
  return { mark, under };
}

/**
 * The mark: a small dot with one faint thin ring round it, in Meno's colour. As the line appears, and twice more a few seconds apart, it
 * is a double-click drawn as water: the dot dips twice, and at each dip a ripple is born at it and spreads to the mark's edge, fading as
 * it slows, the second just after the first (`EMPTY_PAGE_MARK`, `emptyPageMarkMotion`); then it rests. Where the pointer rests inside
 * it, it wakes: the dot and the ring brighten and one ripple is born, and it stays bright and still until the pointer leaves. Where the
 * system asks for less motion, it only rests, and only brightens under the pointer. The dot and the ring are drawn at their brightest,
 * each in a group that holds them down to rest. Scale and opacity only.
 */
function Mark() {
  const still = !!useReducedMotion();
  const { mark, under } = useMarkUnderPointer(still);
  const m = EMPTY_PAGE_MARK;
  const c = m.size / 2;
  const moves = emptyPageMarkMotion();
  const ease = under.awake ? { duration: m.awake.wakeIn, ease: EASE } : { duration: m.awake.sleepIn, ease: EASE_LEAVE };
  const toRest = (rest: number, bright: number) => (under.awake ? 1 : rest / bright);
  return (
    <svg ref={mark} width={m.size} height={m.size} viewBox={`0 0 ${m.size} ${m.size}`} fill="none" stroke="currentColor" strokeWidth={1.4} className="text-accel-base" aria-hidden>
      <motion.g initial={false} animate={{ opacity: toRest(m.ring.opacity, m.awake.ring) }} transition={ease}>
        <circle data-mark="ring" cx={c} cy={c} r={m.ring.r} opacity={m.awake.ring} />
      </motion.g>
      {!still &&
        moves.ripples.map((ripple, i) => (
          <motion.circle key={i} data-mark="ripple" cx={c} cy={c} r={m.ripple.to} vectorEffect="non-scaling-stroke" style={FROM_MIDDLE} initial={moves.rest.ripple} animate={ripple} />
        ))}
      {under.born > 0 && (
        <motion.circle key={`pointer-${under.born}`} data-mark="pointer-ripple" cx={c} cy={c} r={m.ripple.to} vectorEffect="non-scaling-stroke" style={FROM_MIDDLE} initial={moves.rest.ripple} animate={pointerRippleMotion()} />
      )}
      <motion.g initial={false} animate={{ opacity: toRest(m.dot.opacity, m.awake.dot) }} transition={ease}>
        <motion.circle data-mark="dot" cx={c} cy={c} r={m.dot.r} fill="currentColor" stroke="none" opacity={m.awake.dot} style={FROM_MIDDLE} initial={moves.rest.dot} animate={still ? undefined : moves.dip} />
      </motion.g>
    </svg>
  );
}

/**
 * One quiet mark (`Mark`) and two short lines in the middle of the page in view, where it holds nothing at all and nothing is in hand:
 * eased in and out (`show`). Not an object of the page - never saved, exported, printed, selected or filmed: HTML over it, taking no
 * pointer, still as the page is zoomed or moved.
 * `right`: how much of the page's right side is covered (the column over it), so the line stands in the middle of what is seen.
 */
export default function EmptyPageLine({ show, right = 0 }: { show: boolean; right?: number }) {
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
            <Mark />
            <span className="text-xs text-gh-gray">{EMPTY_PAGE_LINES[0]}</span>
            <span className="text-[11px] text-gh-gray">{EMPTY_PAGE_LINES[1]}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
