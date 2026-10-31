import PageHtml from "./PageHtml";
import { PAGE_SIZED } from "../utils/pageScale";
import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { aboveText, chipLine, isMarked, resultsOn, unitsHeld, valueText, type Result } from "../../../../lib/calc/results";
import { cardGroupsOf, readerNameOf } from "../../../../lib/calc/sources";
import { ResultGroups, type CardGroups, type Fold } from "./PointedCard3D";
import { EASED } from "../../../theme/motion";
import { GROW_MS, SHOW_MS, useEasedTo, useOpening } from "../../../theme/opening";
import { barsAbove, NO_LOWEST, NOT_FINISHED } from "../utils/barsAbove";
import { chipShiftOf, chipWidthOf } from "../utils/chipWidth";
import { greatest } from "../../../../lib/chem/lists";
import { FAILURE_WORDS, WARNING_WORDS, type Failure, type Warning } from "../workflow/failures";
import { imaginaryWords } from "../../../../lib/calc/output";
import { PORTS_Z } from "../workflow/look";
import { FRAMES_CHIP_GAP } from "../utils/molecule3d";

/** The bars' and the slider's width, the bars' height, and the room either side, in pixels. */
const WIDTH = 196;
const BARS = 30;
const SIDE = 10;
/** The room either side of what its details say, in pixels. */
const DETAILS_SIDE = 10;
/** Past this many frames the energies have more room; narrower than this, a bar gives way to a profile. */
const MANY = 60;
const WIDE = 300;
const LEAST_BAR = 3;
/** How long a single geometry's chip stays once its molecule is let go - time to reach it - in milliseconds. */
const LINGER_MS = 400;
/** How far below its molecule it hangs, in page pixels (utils/molecule3d, which places it). */
const GAP = FRAMES_CHIP_GAP;
/** How long it stays over the rest once shut, while its lines go and it shrinks back: the length of its own easing, and a little more. */
const SHUTTING_MS = SHOW_MS + GROW_MS + 100;

/** A conformer's share of its set, as it is written: "62%", "<1%" - and ">99%" where others share the rest. */
function share(p: number): string {
  return p < 0.005 ? "<1%" : p > 0.995 && p < 1 ? ">99%" : `${Math.round(p * 100)}%`;
}

/** An energy above the lowest, as it is written: "1.23 kcal/mol" (lib/calc/results). */
const relative = aboveText;

/** An energy as a calculation gives it, as it is written wherever Meno writes one: "−382.055117 Eh". */
const absolute = (e: number) => valueText(e, { quantity: "energy" });

/**
 * A molecule's frames, just below it on the page: which one it shows, of
 * how many, and - clicked - a slider through them (the maintainer,
 * 2026-10-13: it opens on a click, not as its molecule is pointed at or
 * selected); it shuts as it is clicked again, or as anything else is
 * pressed, or on Escape. Where its
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
 * It stands where its molecule puts it, and only there: opened by a molecule
 * low on the page or at the window's edge, it grows past the edge rather
 * than chase it - the view moved, it moves with the molecule, as one with it
 * (the maintainer, 2026-10-28: following the edge, it jittered).
 */
export default function Frames3D({ raised, ...props }: ComponentProps<typeof FramesChip> & { raised?: boolean }) {
  // (opened, above every other thing on the page - its neighbours' chips, their notes - never under them; and so
  //  as it shrinks back once shut, and while its molecule takes it back up (`raised`): nothing pops over it on the way)
  const [opened, setOpened] = useState(false);
  const [shutting, setShutting] = useState(false);
  const was = useRef(false);
  const { onOpened } = props;
  const said = useCallback(
    (o: boolean) => {
      if (was.current && !o) setShutting(true);
      was.current = o;
      setOpened(o);
      onOpened?.(o);
    },
    [onOpened],
  );
  useEffect(() => {
    if (!shutting) return;
    const t = window.setTimeout(() => setShutting(false), SHUTTING_MS);
    return () => window.clearTimeout(t);
  }, [shutting]);
  return (
    <PageHtml zIndexRange={opened || shutting || raised ? OPENED_Z : [30, 20]}>
      <FramesChip {...props} onOpened={said} />
    </PageHtml>
  );
}

/**
 * Where an opened chip lies among what is on the page: over the rest of the
 * page's chips and notes (at most 40), and over the workflow's ports
 * (`PORTS_Z`) - as a step's card opened is, the ports under it not drawn -
 * so that nothing under it shows through it. A press on it is its own; one
 * anywhere else shuts it.
 */
const OPENED_Z: [number, number] = [PORTS_Z + 3, PORTS_Z + 1];

/** Words begun with a capital, as a label is. */
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The chip itself, as it lies on the page (Frames3D). */
export function FramesChip({
  count,
  frame,
  energies,
  open,
  onFrame,
  below,
  populations,
  noShares,
  numbers,
  about,
  results,
  unread,
  made,
  conformers,
  said: fromText,
  title,
  failed,
  marksUnread,
  warnings,
  imaginary,
  fromStart,
  onOpened,
}: {
  count: number;
  frame: number;
  /** Each frame's energy, in hartrees. */
  energies?: number[];
  /** Its molecule pointed at or selected: a single geometry's chip is seen then, and stays a moment after. */
  open: boolean;
  onFrame: (frame: number) => void;
  /** Said just below it - a note on its molecule - and moved down as it opens. */
  below?: ReactNode;
  /** A conformer set's: how much of it each conformer is - at room temperature, or as a Populations step found. */
  populations?: number[];
  /** Why it shows no shares, where it would: a frame that is no minimum, named (utils/molecule3d `sharesWithheld`) - said, opened. */
  noShares?: string;
  /** A conformer set's: each conformer's number among its compound's, where a step set some aside (docs/WORKFLOWS.md). */
  numbers?: number[];
  /** What the calculation it was read from was, in a line (lib/calc `calcLine`). */
  about?: string;
  /** What the calculation found (lib/calc/results): the molecule's and each frame's are said here. */
  results?: Result[];
  /** The readers chosen to read it as well that could not, and why: said with what it found. */
  unread?: { from: string; why: string }[];
  /** How it was made, where something made it - its conformers' method and force field: said with the rest, opened; and what its energies are, under its bars. */
  made?: { method?: string; how: { label: string; text: string }[]; energies?: string };
  /** What the text it was read from says of it - its charge and multiplicity, its energies: said with the rest, opened. */
  said?: { label: string; text: string }[];
  /** Its frames are a conformer set's (`Molecule3D.conformerSet`): shown as a set however many there are, one included. */
  conformers?: boolean;
  /**
   * What the one told is called - a stack's molecule's record's title - said
   * after which it is (utils/stacks); a single geometry called by a name of
   * its own (a structure read from coordinates in a text), always, with its
   * energy - its notes opened by a click.
   */
  title?: string;
  /** Why each frame failed in the step that made it, where one did (workflow/failures): the one told said on it. */
  failed?: readonly (Failure | null)[];
  /** Its file's marks of which frames failed did not read: none of its frames' bars stands above another's. */
  marksUnread?: boolean;
  /** What its calculation warned of: counted on it, each said in full with the rest, opened. A warning moves nothing. */
  warnings?: readonly Warning[];
  /** The imaginary frequencies each frame's calculation judged it has, in cm-1 (null, none): the one told's said on it - a mark that it is no minimum. */
  imaginary?: readonly (readonly number[] | null)[];
  /** Its frames are a path a step found (workflow/takeFrames `refinedFrame`): the one told's energy said from the path's start, its first frame - as its barriers are - never from its lowest, the path's other end it may be. */
  fromStart?: boolean;
  /** Told as it is opened by a click, and as it shuts: its molecule takes it clear of its set (Molecule3DView), and it goes above the rest. */
  onOpened?: (opened: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);
  // (what it says pointed at: the details above it - not its bars or its
  // slider, which go through the frames with the molecule in view)
  // (a single geometry has no bars to open: its details are opened by a click on it, and shut as an opened chip is)
  const [pinned, setPinned] = useState(false);
  const [pointed, setPointed] = useState<number | null>(null);
  // (opened by a click on it, and shut by another, a press anywhere else, or Escape)
  const [expanded, setExpanded] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const opened = expanded || pinned;
  useEffect(() => {
    if (!opened) return;
    const shut = () => {
      setExpanded(false);
      setPinned(false);
    };
    const onPress = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) shut();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") shut();
    };
    window.addEventListener("pointerdown", onPress, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPress, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [opened]);
  // (what the calculation found is in the chip once it is opened by a click: pointing at it alone says nothing more)
  const reading = opened;
  // (opened, it grows to what it opens to and then its new lines come in; shut, they go first - theme/opening)
  const read = useOpening(reading);
  // (how it was made, folded under its name in the details: opened the same way, the chip growing to its rows)
  const [madeOpen, setMadeOpen] = useState(false);
  const madeAt = useOpening(madeOpen);
  const [madeWidth, setMadeWidth] = useState(0);
  useEffect(() => {
    onOpened?.(opened);
  }, [opened, onOpened]);
  // (each above the lowest of those that finished alone: one that failed is no bar's zero, and has none of its own)
  const bars = energies ? barsAbove(energies, failed, marksUnread) : null;
  const above = bars?.above;
  const finishedAbove = above?.filter((v): v is number => v != null) ?? [];
  const highest = finishedAbove.length ? Math.max(greatest(finishedAbove), 1e-9) : 1;
  const told = pointed ?? frame;
  // (a long run of frames is given more room)
  const width = count > MANY ? WIDE : WIDTH;
  // shut, as wide as what it says; open, as wide as its slider - going from
  // one to the other. (What it says is measured once it is on the page,
  // which is after this renders - it is drawn in a root of its own - and
  // whenever it changes width.)
  const [saidWidth, setSaidWidth] = useState(0);
  // (and what the details say, measured the same way: the chip widens to it while they are read)
  const [detailsWidth, setDetailsWidth] = useState(0);
  const watchDetails = useRef<ResizeObserver | null>(null);
  const detailed = useCallback((el: HTMLDivElement | null) => {
    watchDetails.current?.disconnect();
    watchDetails.current = null;
    if (!el) return;
    const measure = () => {
      if (el.offsetWidth) setDetailsWidth(el.offsetWidth);
    };
    measure();
    watchDetails.current = new ResizeObserver(measure);
    watchDetails.current.observe(el);
  }, []);
  const watchMade = useRef<ResizeObserver | null>(null);
  const madeMeasured = useCallback((el: HTMLDivElement | null) => {
    watchMade.current?.disconnect();
    watchMade.current = null;
    if (!el) return;
    const measure = () => {
      if (el.offsetWidth) setMadeWidth(el.offsetWidth);
    };
    measure();
    watchMade.current = new ResizeObserver(measure);
    watchMade.current.observe(el);
  }, []);
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
  // calculation was, and only while its molecule is pointed at. A conformer
  // set in which one conformer was found is a set all the same - its bar,
  // its energy, its share - not a single geometry: the maintainer, 2026-10-21)
  const single = count < 2 && !conformers;
  // in full: opened - a single geometry's, with nothing to go through, as it is pointed at
  const full = single ? open || hovered : expanded;
  const [lingering, setLingering] = useState(open);
  useEffect(() => {
    if (open) {
      setLingering(true);
      return;
    }
    const t = window.setTimeout(() => setLingering(false), LINGER_MS);
    return () => window.clearTimeout(t);
  }, [open]);
  const shown = !single || !!title || open || hovered || lingering || pinned;
  // what the calculation found of the molecule, and of the frame told
  const details: CardGroups = cardGroupsOf([...resultsOn(results, "molecule"), ...resultsOn(results, "frames")], (r) => {
    const v = r.on === "molecule" ? r.value : (r.values[told] ?? null);
    return { text: valueText(v, r), marked: isMarked(v, r) };
  });
  if (unread?.length) details.push({ group: "Could not read it", rows: unread.map((u) => ({ label: readerNameOf(u.from), text: u.why })) });
  // (its method first, in the words of what made it: a starting geometry, as it was made - shut until asked for, as it would fill the card past what the molecule is)
  const madeRows = made ? [...(made.method ? [{ label: "Method", text: made.method }] : []), ...made.how] : [];
  if (madeRows.length) details.push({ group: "How it was made", rows: madeRows.map((r) => ({ label: r.label, text: r.text })), folded: true });
  if (fromText?.length) details.push({ group: "In the text", rows: fromText.map((r) => ({ label: r.label, text: r.text })) });
  if (noShares) details.push({ group: "Shares", rows: [{ label: "None", text: noShares }] });
  // (why the one told failed, and what its calculation warned of: said on it, and in full, opened - in the program's own words)
  const failure = failed?.[told] ?? undefined;
  const saddle = imaginary?.[told];
  const marks = [
    failure ? FAILURE_WORDS[failure.kind] : "",
    saddle?.length ? imaginaryWords(saddle) : "",
    warnings?.length ? `${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  if (failure) details.unshift({ group: "Failed", rows: [{ label: upper(FAILURE_WORDS[failure.kind]), text: failure.why }] });
  if (warnings?.length) details.push({ group: "Warnings", rows: warnings.map((w) => ({ label: upper(WARNING_WORDS[w.kind]), text: w.text })) });
  const line = (energy?: number) => unitsHeld(chipLine([about ?? "", energy != null ? absolute(energy) : ""], results));
  // How wide it is: as wide as what it says, or its bars, eased as that
  // changes; opened, as wide as its details as well, and how it was made
  // with them once that is opened - grown to as they open, wide and tall
  // together, and back as they shut, after their lines have gone. (Frame
  // by frame, from where each part is: a CSS transition of the whole
  // chased what was itself still widening, and was still growing as the
  // lines came in.)
  // (a set's bars are what it opens to, with its details; a single geometry's
  // chip, which has none, is as wide as its slider's room only pointed at)
  const shutWidth = useEasedTo((single && full ? Math.max(width, saidWidth) : saidWidth) + 2 * SIDE);
  const openWidth = useEasedTo(single ? 0 : Math.max(width, saidWidth) + 2 * SIDE);
  const detailsOwn = useEasedTo(details.length > 0 ? detailsWidth : 0);
  const widths = {
    shut: shutWidth,
    open: openWidth,
    details: detailsOwn,
    made: details.length > 0 ? madeWidth + 2 * DETAILS_SIDE : 0,
    grown: read.grown,
    madeGrown: madeAt.grown,
  };
  const chipWidth = chipWidthOf(widths);
  // (how it was made opening, it widens to the right only: its toggle, at its left, stays where it was pressed)
  const chipShift = chipShiftOf(widths);
  const fold: Fold = { open: madeOpen, at: madeAt, toggle: () => setMadeOpen((o) => !o), measured: madeMeasured };
  // (how many device pixels one of its own pixels is drawn as - the page's scale, and the screen's - that its bars are laid on whole ones:
  //  followed each frame while it is open)
  const chipEl = useRef<HTMLDivElement>(null);
  const [devicePx, setDevicePx] = useState<number | null>(null);
  const devicePxNow = useRef<number | null>(null);
  useEffect(() => {
    if (!full) return;
    let id = 0;
    const measure = () => {
      const el = chipEl.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const k = el.offsetWidth ? Math.round((r.width / el.offsetWidth) * window.devicePixelRatio * 1000) / 1000 : null;
        if (k && k !== devicePxNow.current) {
          devicePxNow.current = k;
          setDevicePx(k);
        }
      }
      id = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(id);
  }, [full]);
  const drawnPx = devicePx ?? (typeof window === "undefined" ? 1 : window.devicePixelRatio);
  return (
    <div
      ref={root}
      className={`meno-page-chip meno-control-chip flex flex-col items-center select-none ${(!single && !expanded) || (single && (about || madeRows.length || fromText?.length)) ? "cursor-pointer" : ""}`}
      // (the pointer goes through it but for what it shows: a chip hidden keeps its size, and would hide what lies under it - a set's port, a step's card)
      style={{ transform: `translate(-50%, calc(${GAP}px * var(--page, 1)))`, pointerEvents: "none" }}
      onClick={() => {
        if (!single && !expanded) setExpanded(true);
        else if (single && (about || madeRows.length || fromText?.length)) setPinned((v) => !v);
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => {
        setHovered(false);
        setPointed(null);
      }}
    >
      <div className="flex flex-col items-center" style={PAGE_SIZED}>
      {(!single || about || title) && (
        <div className="relative">
          <div
            ref={chipEl}
            // (shut, it lets the page show through a little; open, nothing shows through it - what lies under it would read as part of it)
            className={`rounded-2xl border border-gh-line shadow-sm py-1 flex flex-col items-center overflow-hidden transition-[opacity,background-color] ${full || reading ? "bg-white" : "bg-white/85 backdrop-blur"}`}
            style={{
              ...EASED,
              opacity: shown ? (full ? 1 : 0.75) : 0,
              pointerEvents: shown ? "auto" : "none",
              // (as wide as what it shows, and no wider: the details' own room either side is the chip's)
              width: chipWidth,
              // (on whole device pixels, that its bars stay sharp)
              transform: chipShift ? `translateX(${Math.round(chipShift * drawnPx) / drawnPx}px)` : undefined,
            }}
          >
            {/* (a set's bars and slider: opened with its details, and the same way - a single geometry has none) */}
            <div className="grid" style={{ gridTemplateRows: `${read.grown}fr`, opacity: read.shown }}>
              <div className="overflow-hidden flex flex-col items-center" style={{ width }}>
                {/* (what the bars are, named over them) */}
                {above && !single && (
                  <div className="mt-1 mb-0.5 self-start text-[10px] leading-[14px] text-gh-gray">Energy above the lowest, each {conformers ? "conformer" : "frame"}</div>
                )}
                {above && !single && (
                  <Energies
                    above={above}
                    highest={highest}
                    why={(i) => (marksUnread ? "its marks could not be read" : failed?.[i] ? FAILURE_WORDS[failed[i]!.kind] : null)}
                    frame={frame}
                    pointed={pointed}
                    width={width}
                    devicePx={drawnPx}
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
                  <div className="mb-1 text-center text-[11px] leading-[16px] text-gh-gray tabular-nums">
                    {line(energies?.[told])}
                  </div>
                )}
                {/* (what its energies are, in the words of what made them: the same whichever conformer is shown) */}
                {!about && !single && above && made?.energies && (
                  <div className="mb-1 text-center text-[11px] leading-[16px] text-gh-gray" style={{ width }}>
                    Energies from {made.energies}
                  </div>
                )}
              </div>
            </div>
            <div
              ref={said}
              // (a line too long - a model's provenance, said whole - goes on to more lines, no wider than the details are, centred)
              className={`w-max text-[11px] leading-[18px] text-gh-gray tabular-nums ${single ? "max-w-[20rem] text-center [overflow-wrap:anywhere]" : "whitespace-nowrap"}`}
              onClick={(e) => {
                if (!expanded) return;
                e.stopPropagation();
                setExpanded(false);
              }}
            >
              {single ? (
                <>
                  {title && <span className="text-gh-black inline-block max-w-[14rem] truncate align-bottom">{title}</span>}
                  {title && line(energies?.[0]) ? " · " : ""}
                  {line(energies?.[0])}
                  {marks && <span className="text-accel-accent">{title || line(energies?.[0]) ? " · " : ""}{marks}</span>}
                </>
              ) : (
                <>
                  {numbers?.[told] != null && numbers.some((k, i) => k !== i + 1) && <span className="text-gh-black">#{numbers[told]} · </span>}
                  {told + 1} / {count}
                  {title && <span className="text-gh-black ml-2 inline-block max-w-[14rem] truncate align-bottom">{title}</span>}
                  {above && <span className="text-gh-black"> · {above[told] != null ? (fromStart && above[0] != null ? `ΔE ${relative(above[told]! - above[0]!)} from its start` : relative(above[told]!)) : bars?.why ? bars.why : bars?.noBaseline ? NO_LOWEST : NOT_FINISHED}</span>}
                  {populations?.[told] != null && <span className="text-gh-black"> · {share(populations[told])}</span>}
                  {marks && <span className="text-accel-accent"> · {marks}</span>}
                </>
              )}
            </div>
            {/* (what the calculation found, in the chip itself: it grows downward, away from the molecule, and back -
                nothing covers the structure) */}
            {details.length > 0 && (
              <div className="grid w-full" style={{ gridTemplateRows: `${read.grown}fr`, opacity: read.shown }}>
                {/* (at the chip's left, what is past its right edge cut there as it widens: never centred, cut at both ends, ahead of the chip - LOOK, 2026-10-28;
                    at its left too where they fit, under the bars' name: centred, how it was made's toggle went from under the pointer as it opened) */}
                <div className="overflow-hidden flex justify-start">
                  {/* (never shrunk to the chip as it widens: measured so, its width would follow the chip's, a frame behind, and the chip would creep after it) */}
                  <div
                    ref={detailed}
                    className="w-max max-w-[20rem] shrink-0 pt-1 pb-1 text-left text-[11px] leading-[16px] tabular-nums"
                    style={{ paddingInline: DETAILS_SIDE }}
                  >
                    {/* (its one folded group, how it was made: opened as the chip says, no wider than the details' most, 20rem, less their sides) */}
                    <ResultGroups groups={details} fold={fold} most="18.75rem" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {below && <div style={{ pointerEvents: "auto" }}>{below}</div>}
      </div>
    </div>
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
  why,
  frame,
  pointed,
  width,
  devicePx,
  onPoint,
  onFrame,
}: {
  /** Each frame's energy above the lowest of those that finished; none, of one that did not (`barsAbove`). */
  above: (number | null)[];
  highest: number;
  /** Why a frame did not finish, in words: said on its bar. */
  why: (i: number) => string | null;
  frame: number;
  pointed: number | null;
  width: number;
  /** How many device pixels one of its own is drawn as: its bars, their gaps and heights laid on whole ones, each bar as wide as the next. */
  devicePx: number;
  onPoint: (i: number | null) => void;
  onFrame: (i: number) => void;
}) {
  const count = above.length;
  const step = width / count;
  const heightOf = (e: number) => 4 + (BARS - 4) * (e / highest);
  const frameAt = (svg: Element, clientX: number) => {
    const r = svg.getBoundingClientRect();
    const at = (clientX - r.left) / r.width;
    // (bars: by the step they are laid at, from where the first begins; a profile: across the whole)
    const i = bars ? Math.floor((at * width * k - (fromD - Math.floor(gapD / 2))) / stepD) : Math.floor(at * count);
    return Math.min(count - 1, Math.max(0, i));
  };
  const bars = step >= LEAST_BAR;
  const x = (i: number) => (i + 0.5) * step;
  // (bars on whole device pixels: one step, one gap and one width for all - a row even, never a pixel wider here and there -
  //  centred in the room; heights rounded the same way)
  const k = devicePx > 0 && Number.isFinite(devicePx) ? devicePx : 1;
  const stepD = Math.max(1, Math.floor((width * k) / count));
  const gapD = Math.min(stepD - 1, Math.max(1, Math.round(Math.min(2, step * 0.4) * k)));
  const barD = Math.max(1, stepD - gapD);
  const fromD = Math.floor((width * k - stepD * count) / 2) + Math.floor(gapD / 2);
  const barX = (i: number) => (fromD + i * stepD) / k;
  const barW = barD / k;
  const barH = (h: number) => Math.max(1, Math.round(h * k)) / k;
  // (the profile in pieces: one through each run of frames that finished, broken at each that did not - never drawn
  //  as if at the foot, which would read as the lowest)
  const runs: number[][] = [];
  above.forEach((e, i) => {
    if (e == null) return;
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === i - 1) last.push(i);
    else runs.push([i]);
  });
  const profiles = bars
    ? []
    : runs.map((run) => {
        const from = run[0] * step;
        const to = (run[run.length - 1] + 1) * step;
        return `M${from.toFixed(2)},${BARS} ` + run.map((i) => `L${x(i).toFixed(2)},${(BARS - heightOf(above[i]!)).toFixed(2)}`).join(" ") + ` L${to.toFixed(2)},${BARS} Z`;
      });
  return (
    <svg
      width={width}
      height={BARS}
      data-cursor="sideways"
      className="block touch-none"
      // (bars' edges on whole device pixels, however the page is zoomed - never soft; a profile stays smooth)
      shapeRendering={bars ? "crispEdges" : undefined}
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
        above.map((e, i) =>
          e == null ? (
            // (one that did not finish: no height, an outline at the foot - why, on it)
            <rect
              key={i}
              data-unfinished=""
              x={barX(i)}
              y={BARS - barH(4)}
              width={barW}
              height={barH(4)}
              rx={Math.min(1.5, step / 4)}
              fill="none"
              stroke={i === frame ? "rgb(49, 118, 137)" : "rgb(207, 222, 229)"}
              strokeDasharray="2 1"
            >
              <title>{why(i) ?? "not finished"}</title>
            </rect>
          ) : (
            <rect
              key={i}
              data-bar=""
              x={barX(i)}
              y={BARS - barH(heightOf(e))}
              width={barW}
              height={barH(heightOf(e))}
              className="transition-[fill] duration-150"
              fill={i === frame ? "rgb(49, 118, 137)" : i === pointed ? "rgb(140, 172, 184)" : "rgb(207, 222, 229)"}
            />
          ),
        )
      ) : (
        <>
          {profiles.map((d, k) => (
            <path key={k} d={d} fill="rgb(207, 222, 229)" />
          ))}
          {above.map((e, i) =>
            e == null ? (
              <line key={`u${i}`} data-unfinished="" x1={i * step} x2={(i + 1) * step} y1={BARS - 0.5} y2={BARS - 0.5} stroke="rgb(140, 172, 184)" strokeWidth={1} strokeDasharray="2 1">
                <title>{why(i) ?? "not finished"}</title>
              </line>
            ) : null,
          )}
          {pointed != null && pointed !== frame && (
            <line x1={x(pointed)} x2={x(pointed)} y1={0} y2={BARS} stroke="rgb(140, 172, 184)" strokeWidth={1} />
          )}
          <line x1={x(frame)} x2={x(frame)} y1={0} y2={BARS} stroke="rgb(49, 118, 137)" strokeWidth={1.5} />
          {above[frame] != null && <circle cx={x(frame)} cy={BARS - heightOf(above[frame]!)} r={3} fill="rgb(49, 118, 137)" />}
        </>
      )}
    </svg>
  );
}
