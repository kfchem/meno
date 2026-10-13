import PageHtml from "./PageHtml";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { chipLine, isMarked, resultsOn, valueText, type Result } from "../../../../lib/calc/results";
import { cardGroupsOf, readerNameOf } from "../../../../lib/calc/sources";
import { ResultGroups, type CardGroups } from "./PointedCard3D";

/** Kilocalories per mole in a hartree. */
const KCAL_PER_HARTREE = 627.509474;
/** The bars' and the slider's width, the bars' height, and the room either side, in pixels. */
const WIDTH = 196;
const BARS = 30;
const SIDE = 10;
/** Past this many frames the energies have more room; narrower than this, a bar gives way to a profile. */
const MANY = 60;
const WIDE = 300;
const LEAST_BAR = 3;
/** How long a single geometry's chip stays once its molecule is let go - time to reach it - in milliseconds. */
const LINGER_MS = 400;
/** The chip kept clear of the canvas's lower edge, in pixels. */
const EDGE = 8;
/** How far below its molecule it hangs, in page pixels (workflow/look CHIP makes room for it). */
const GAP = 10;

/** A conformer's share of its set, as it is written: "62%", "<1%". */
function share(p: number): string {
  return p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`;
}

/** An energy above the lowest, as it is written: "1.23 kcal/mol". */
function relative(e: number): string {
  return `${e < 10 ? e.toFixed(2) : e.toFixed(1)} kcal/mol`;
}

/** An energy as a calculation gives it, as it is written: "−382.055117 Eh". */
function absolute(e: number): string {
  return `${e.toFixed(6).replace(/^-/, "\u2212")} Eh`;
}

/**
 * A molecule's frames, just below it on the page: which one it shows, of
 * how many, and - hovered or selected - a slider through them. Where its
 * file gives each frame's energy, the energies stand above the slider, each
 * as high as it is above the lowest - a bar each, or for a long run of
 * frames one profile through them all - and the frame shown says how far
 * above the lowest it is. Pressed, the energies show that frame, and a drag
 * along them goes through the frames.
 *
 * Read from a calculation (`about`, what it was), it says so too, opened:
 * the calculation, the frame's energy as the calculation gave it, and the
 * results its readers ranked, as many as the line holds. That pointed at,
 * it says all the molecule's results, and the frame's, above it. A
 * single geometry's - nothing to go through - is only that, and only while
 * its molecule is pointed at or selected, or it is: it fades in and out,
 * keeping its place, so that what is under it stays where it is.
 *
 * Opened with its molecule low on the page - filling the window, as one
 * opened from its file does - it rises as far as it must to stay within
 * the canvas (`area`), over its molecule, and goes back down as it shuts.
 */
export default function Frames3D({
  count,
  frame,
  energies,
  open,
  onFrame,
  below,
  populations,
  numbers,
  about,
  results,
  unread,
  made,
  area,
  title,
}: {
  count: number;
  frame: number;
  /** Each frame's energy, in hartrees. */
  energies?: number[];
  /** Shown in full: its molecule hovered or selected. */
  open: boolean;
  onFrame: (frame: number) => void;
  /** Said just below it - a note on its molecule - and moved down as it opens. */
  below?: ReactNode;
  /** A conformer set's: how much of it each conformer is - at room temperature, or as a Populations step found. */
  populations?: number[];
  /** A conformer set's: each conformer's number among its compound's, where a step set some aside (docs/WORKFLOWS.md). */
  numbers?: number[];
  /** What the calculation it was read from was, in a line (lib/calc `calcLine`). */
  about?: string;
  /** What the calculation found (lib/calc/results): the molecule's and each frame's are said here. */
  results?: Result[];
  /** The readers chosen to read it as well that could not, and why: said with what it found. */
  unread?: { from: string; why: string }[];
  /** How it was made, where something made it - its conformers' method and force field: said with the rest, opened. */
  made?: { label: string; text: string }[];
  /** What it keeps within: the canvas. */
  area?: Element;
  /** What the one told is called - a stack's molecule's record's title - said after which it is (utils/stacks). */
  title?: string;
}) {
  const [hovered, setHovered] = useState(false);
  // (what it says pointed at: the details above it - not its bars or its
  // slider, which go through the frames with the molecule in view)
  const [reading, setReading] = useState(false);
  const read = { onPointerEnter: () => setReading(true), onPointerLeave: () => setReading(false) };
  const [pointed, setPointed] = useState<number | null>(null);
  const full = open || hovered;
  // (by loops: spread over a long run of frames, Math.min and Math.max overrun the stack)
  const lowest = energies ? energies.reduce((a, b) => Math.min(a, b), Infinity) : 0;
  const above = energies?.map((e) => (e - lowest) * KCAL_PER_HARTREE);
  const highest = above ? above.reduce((a, b) => Math.max(a, b), 1e-9) : 1;
  const told = pointed ?? frame;
  // (a long run of frames is given more room)
  const width = count > MANY ? WIDE : WIDTH;
  // shut, as wide as what it says; open, as wide as its slider - going from
  // one to the other. (What it says is measured once it is on the page,
  // which is after this renders - it is drawn in a root of its own - and
  // whenever it changes width.)
  const [saidWidth, setSaidWidth] = useState(0);
  const watch = useRef<ResizeObserver | null>(null);
  const said = useCallback((el: HTMLDivElement | null) => {
    watch.current?.disconnect();
    watch.current = null;
    if (!el) return;
    const measure = () => {
      if (el.offsetWidth) setSaidWidth(el.offsetWidth);
    };
    measure();
    watch.current = new ResizeObserver(measure);
    watch.current.observe(el);
  }, []);
  // (a single geometry has nothing to go through: it says what the
  // calculation was, and only while its molecule is pointed at)
  const single = count < 2;
  const [lingering, setLingering] = useState(open);
  useEffect(() => {
    if (open) {
      setLingering(true);
      return;
    }
    const t = window.setTimeout(() => setLingering(false), LINGER_MS);
    return () => window.clearTimeout(t);
  }, [open]);
  const shown = !single || open || hovered || lingering;
  // what the calculation found of the molecule, and of the frame told
  const details: CardGroups = cardGroupsOf([...resultsOn(results, "molecule"), ...resultsOn(results, "frames")], (r) => {
    const v = r.on === "molecule" ? r.value : (r.values[told] ?? null);
    return { text: valueText(v, r), marked: isMarked(v, r) };
  });
  if (unread?.length) details.push({ group: "Could not read it", rows: unread.map((u) => ({ label: readerNameOf(u.from), text: u.why })) });
  if (made?.length) details.push({ group: "How it was made", rows: made.map((r) => ({ label: r.label, text: r.text })) });
  const line = (energy?: number) => chipLine([about ?? "", energy != null ? absolute(energy) : ""], results);
  // how far it has risen to stay within the canvas, followed each frame
  // while it is open, and until it is back down
  const chipEl = useRef<HTMLDivElement>(null);
  const [lift, setLift] = useState(0);
  const lifted = useRef(0);
  useEffect(() => {
    if (!area || (!full && lifted.current === 0)) return;
    let id = 0;
    const fit = () => {
      const el = chipEl.current;
      if (el) {
        const over = el.getBoundingClientRect().bottom + EDGE - area.getBoundingClientRect().bottom;
        const next = Math.max(0, Math.round(lifted.current + over));
        if (next !== lifted.current) {
          lifted.current = next;
          setLift(next);
        }
      }
      if (full || lifted.current > 0) id = requestAnimationFrame(fit);
    };
    fit();
    return () => cancelAnimationFrame(id);
  }, [area, full]);
  return (
    <PageHtml zIndexRange={[30, 20]}>
      <div
        className="meno-page-chip meno-control-chip flex flex-col items-center select-none"
        style={{ transform: `translate(-50%, calc(${GAP}px * var(--page, 1) - ${lift}px)) scale(var(--page, 1))`, transformOrigin: "50% 0" }}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => {
          setHovered(false);
          setPointed(null);
        }}
      >
        {(!single || about) && (
          <div className="relative">
            {details.length > 0 && (
              <div
                className="pointer-events-none absolute left-1/2 bottom-full mb-1.5 w-max max-w-[20rem] -translate-x-1/2 rounded-xl border border-gh-line bg-white/90 backdrop-blur shadow-sm px-2.5 pt-0.5 pb-1.5 text-[11px] leading-[16px] tabular-nums transition-opacity duration-150 ease-meno"
                style={{ opacity: reading ? 1 : 0 }}
              >
                <ResultGroups groups={details} />
              </div>
            )}
            <div
              ref={chipEl}
              className="rounded-2xl border border-gh-line bg-white/85 backdrop-blur shadow-sm py-1 flex flex-col items-center overflow-hidden transition-[width,opacity] duration-200 ease-out"
              style={{
                opacity: shown ? (full ? 1 : 0.75) : 0,
                pointerEvents: shown ? undefined : "none",
                width: (full ? Math.max(width, saidWidth) : saidWidth) + 2 * SIDE,
              }}
            >
              <div
                className="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
                style={{ gridTemplateRows: full ? "1fr" : "0fr", opacity: full ? 1 : 0 }}
              >
                <div className="overflow-hidden flex flex-col items-center" style={{ width }}>
                  {above && !single && (
                    <Energies
                      above={above}
                      highest={highest}
                      frame={frame}
                      pointed={pointed}
                      width={width}
                      onPoint={setPointed}
                      onFrame={onFrame}
                    />
                  )}
                  {!single && (
                    <input
                      type="range"
                      aria-label="Frame"
                      min={0}
                      max={count - 1}
                      step={1}
                      value={frame}
                      onChange={(e) => onFrame(parseInt(e.target.value, 10))}
                      data-cursor="sideways"
                      className="my-1.5 h-2 rounded-full appearance-none bg-white/60 border border-gh-line"
                      style={{ width }}
                    />
                  )}
                  {about && !single && (
                    <div className="mb-1 text-center text-[11px] leading-[16px] text-gh-gray tabular-nums" {...read}>
                      {line(energies?.[told])}
                    </div>
                  )}
                </div>
              </div>
              <div ref={said} {...read} className="w-max text-[11px] leading-[18px] text-gh-gray tabular-nums whitespace-nowrap">
                {single ? (
                  line(energies?.[0])
                ) : (
                  <>
                    {numbers?.[told] != null && numbers.some((k, i) => k !== i + 1) && <span className="text-gh-black">#{numbers[told]} · </span>}
                    {told + 1} / {count}
                    {title && <span className="text-gh-black ml-2 inline-block max-w-[14rem] truncate align-bottom">{title}</span>}
                    {above && <span className="text-gh-black"> · {relative(above[told])}</span>}
                    {populations?.[told] != null && <span className="text-gh-black"> · {share(populations[told])}</span>}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        {below}
      </div>
    </PageHtml>
  );
}

/**
 * Each frame's energy above the lowest: a bar each, or - too many frames
 * for a bar each to be seen - one profile through them all, the frame
 * shown marked on it. Pointed at, a frame says its energy; pressed, it is
 * shown, and a drag along goes through the frames.
 */
function Energies({
  above,
  highest,
  frame,
  pointed,
  width,
  onPoint,
  onFrame,
}: {
  above: number[];
  highest: number;
  frame: number;
  pointed: number | null;
  width: number;
  onPoint: (i: number | null) => void;
  onFrame: (i: number) => void;
}) {
  const count = above.length;
  const step = width / count;
  const heightOf = (e: number) => 4 + (BARS - 4) * (e / highest);
  const frameAt = (svg: Element, clientX: number) => {
    const r = svg.getBoundingClientRect();
    return Math.min(count - 1, Math.max(0, Math.floor(((clientX - r.left) / r.width) * count)));
  };
  const bars = step >= LEAST_BAR;
  const x = (i: number) => (i + 0.5) * step;
  const profile = bars
    ? ""
    : `M0,${BARS} ` +
      above.map((e, i) => `L${x(i).toFixed(2)},${(BARS - heightOf(e)).toFixed(2)}`).join(" ") +
      ` L${width},${BARS} Z`;
  return (
    <svg
      width={width}
      height={BARS}
      data-cursor="sideways"
      className="mt-1.5 block touch-none"
      role="img"
      aria-label="Energy of each frame"
      onPointerDown={(e) => {
        // (followed wherever the pointer goes until the button comes up)
        const svg = e.currentTarget;
        const id = e.pointerId;
        onFrame(frameAt(svg, e.clientX));
        const move = (ev: PointerEvent) => {
          if (ev.pointerId === id) onFrame(frameAt(svg, ev.clientX));
        };
        const up = (ev: PointerEvent) => {
          if (ev.pointerId !== id) return;
          window.removeEventListener("pointermove", move, true);
          window.removeEventListener("pointerup", up, true);
          window.removeEventListener("pointercancel", up, true);
        };
        window.addEventListener("pointermove", move, true);
        window.addEventListener("pointerup", up, true);
        window.addEventListener("pointercancel", up, true);
      }}
      onPointerMove={(e) => onPoint(frameAt(e.currentTarget, e.clientX))}
      onPointerLeave={() => onPoint(null)}
    >
      {bars ? (
        above.map((e, i) => (
          <rect
            key={i}
            x={i * step + Math.min(1, step * 0.2)}
            y={BARS - heightOf(e)}
            width={Math.max(1, step - Math.min(2, step * 0.4))}
            height={heightOf(e)}
            rx={Math.min(1.5, step / 4)}
            className="transition-[fill] duration-150"
            fill={i === frame ? "rgb(49, 118, 137)" : i === pointed ? "rgb(140, 172, 184)" : "rgb(207, 222, 229)"}
          />
        ))
      ) : (
        <>
          <path d={profile} fill="rgb(207, 222, 229)" />
          {pointed != null && pointed !== frame && (
            <line x1={x(pointed)} x2={x(pointed)} y1={0} y2={BARS} stroke="rgb(140, 172, 184)" strokeWidth={1} />
          )}
          <line x1={x(frame)} x2={x(frame)} y1={0} y2={BARS} stroke="rgb(49, 118, 137)" strokeWidth={1.5} />
          <circle cx={x(frame)} cy={BARS - heightOf(above[frame])} r={3} fill="rgb(49, 118, 137)" />
        </>
      )}
    </svg>
  );
}
