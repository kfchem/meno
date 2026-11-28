import RoleOffer from "./RoleOffer";
import type { RoleId } from "../../../lib/plugins/roles";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RISE } from "../../theme/motion";
import { useLeaving } from "../../theme/leaving";
import { CalculationsGlyph } from "./workflow/icons";
import { MENU_MARGIN, MENU_OFF } from "./menuAt";
import { useMenuAt, type MenuAnchor } from "./useMenuAt";
import { listWidth } from "./quickAddLabel";
import QuickAddCalculations from "./QuickAddCalculations";
import { guideNotice } from "../../../lib/guide/guide";
import { startAhead, useChem } from "../../../lib/roles/worker";
import { useFirstSetUp } from "../../../lib/plugins/firstSetUp";
import type { StepKind } from "./workflow/kinds";
import type { QuickGroup } from "./workflow/offered";
import { SHAPE_KINDS, SHAPE_NAMES, type ShapeKind } from "../../../lib/chem/shapes";
import { togglesOn } from "./utils/press";
import { quickAddLeaves, typedIntoQuickAdd } from "./quickAddLeave";
import type { CoordinateStructure } from "../../../lib/io/coordinates";
import { pastedAs } from "./quickAddPaste";
import { afterAdded, chemistryLine, enterDoes, fieldRows, FOUND_NOT_DRAWN, lookUpFailedSaid, notDrawnSaid, readingSaid, readSmiles } from "./quickAddSmiles";
import { failureSaid } from "../../../lib/plugins/failureSaid";
import { useDownloads } from "../../../lib/pyEnv";
import { calcMadeWith, toggledPanel, type QuickPanel } from "./quickAddPanel";
import { resolve, sameFormula, type Reading } from "./chem/resolve";
import { FormulaText } from "../../abbreviations/FormulaText";
import { rolePlugin } from "../../../lib/roles/worker";
import { useNetwork } from "../../../lib/net/network";
import { foundNotes, type NameFound, type NamedStructure } from "./chem/nameLookup";
import { lookUpName, notAddedSaid, offlineSaid } from "./chem/nameLookupRun";
import { useReaders } from "../../../lib/calc/workers";

/** What Quick Add puts down where it was opened. */
export type QuickAddChoice = "bond" | "text" | "arrow" | "plus" | "push" | "cycle" | "slide" | "pen" | "conversation" | "chair" | "haworth" | "newman";

/** Each icon's size, in px; and the gap between two in a row (gap-0.5). */
const SIZE = 36;
const GAP = 2;

/** Each shape's icon, drawn as Quick Add's are, on a 20-unit square (lib/chem/shapes). An arrow is not one: the row's own *Arrow* draws it. */
const SHAPE_ICONS: Record<ShapeKind, ReactNode> = {
  rect: <rect x="3" y="5" width="14" height="10" />,
  ellipse: <ellipse cx="10" cy="10" rx="7.5" ry="5.2" />,
  line: <path d="M3.5 15.5 L16.5 4.5" />,
};

/**
 * The row's icons, in order: what draws a structure - a bond, a chain, a
 * SMILES - then a scheme's words and its arrow; then two that open a row of
 * their own below it (the maintainer, 2026-10-29, layout A): *Scheme* - a
 * "+", an electron-pushing arrow, begun at the first atom or bond pressed,
 * a catalytic cycle and a slide of what is seen (docs/PRESENTING.md) - and
 * *Marks on the page* - the shapes and the pen, which draw on the page and
 * say nothing chemical.
 */
const ROW: { id: QuickAddChoice | "chain" | "smiles" | "scheme" | "marks" | "projections"; name: string; icon: ReactNode; tip?: string }[] = [
  {
    id: "bond",
    name: "Bond",
    icon: <path d="M3.5 14 L16.5 6.5" />,
  },
  {
    id: "chain",
    name: "Chain",
    icon: <path d="M2 13.5 L6 7.5 L10 13.5 L14 7.5 L18 13.5" />,
  },
  {
    id: "smiles",
    name: "SMILES",
    // (a ring, and the caret it is typed at)
    icon: (
      <>
        <path d="M7.5 4.5 L12.26 7.25 V12.75 L7.5 15.5 L2.74 12.75 V7.25 Z" />
        <path d="M16.5 5.5 V14.5 M15.2 5.5 H17.8 M15.2 14.5 H17.8" />
      </>
    ),
  },
  {
    id: "text",
    name: "Text",
    icon: <path d="M5 4.5 H15 M10 4.5 V16" />,
  },
  {
    id: "arrow",
    name: "Arrow",
    icon: (
      <>
        <path d="M2.5 10 H14" />
        <path d="M13 6.2 L18 10 L13 13.8 Z" fill="currentColor" />
      </>
    ),
  },
  {
    id: "scheme",
    name: "Scheme",
    // (a "+" and a curved arrow: what a scheme has besides its structures and words)
    icon: (
      <>
        <path d="M5 3 V9 M2 6 H8" />
        <path d="M7.5 16.5 C8 11.5, 13 10, 15.6 13.2" />
        <path d="M12.9 12.1 L16.4 15.3 L17.2 10.9 Z" fill="currentColor" />
      </>
    ),
  },
  {
    id: "marks",
    name: "Marks on the page",
    // (a square and a circle, one over the other)
    icon: (
      <>
        <rect x="2.5" y="7.5" width="9" height="9" rx="1" />
        <circle cx="13" cy="7.5" r="4.5" />
      </>
    ),
  },
  {
    id: "projections",
    name: "Projections",
    // (a chair seen from its other side, at the size of the row's other icons: the chair's own icon, below, is its mirror)
    icon: <path d="M17.5 6.5 L13.8 13.5 L8.2 11.9 L2.5 13.5 L6.2 6.5 L11.8 8.1 Z" />,
  },
  {
    id: "conversation",
    name: "Conversation",
    // (a word balloon: what is said, in a frame of its own)
    icon: <path d="M3.5 5 H16.5 V13 H9.5 L6 16 V13 H3.5 Z" />,
  },
];

/** What *Scheme* opens below the row, in order. */
const SCHEME: typeof ROW = [
  {
    id: "plus",
    name: "Plus",
    icon: <path d="M10 4 V16 M4 10 H16" />,
  },
  {
    id: "push",
    name: "Electron-pushing arrow",
    // (a curved arrow, as the menus show one)
    icon: (
      <>
        <path d="M3.5 15 C3.5 6.5, 13 3.5, 15.6 11.4" />
        <path d="M12.6 10.2 L16.3 13.6 L17.6 8.8 Z" fill="currentColor" />
      </>
    ),
  },
  {
    id: "cycle",
    name: "Catalytic cycle",
    // (a circle of curved arrows, as a cycle is drawn)
    icon: (
      <>
        <path d="M10 3.5 A6.5 6.5 0 0 1 16.2 12" />
        <path d="M14.4 11.2 L16.6 14.1 L17.9 10.7 Z" fill="currentColor" />
        <path d="M14 15.6 A6.5 6.5 0 0 1 4.2 13.2" />
        <path d="M3.8 9.4 A6.5 6.5 0 0 1 7 4.2" />
      </>
    ),
  },
  {
    id: "slide",
    name: "Slide",
    // (a frame, its number at its corner, as the page shows a slide)
    icon: (
      <>
        <rect x="3.5" y="5.5" width="14" height="10" rx="1" />
        <circle cx="3.5" cy="5.5" r="2.4" fill="currentColor" />
      </>
    ),
  },
];

/** What *Projections* opens below the row (docs/EDITOR-2D.md, *Projections*): the tools that put down a solid seen as a drawing is made of it. */
const PROJECTIONS: typeof ROW = [
  {
    id: "chair",
    name: "Chair",
    // (what it does a second time, said as the pointer rests on it: the view from the other side)
    tip: "Chair. Chosen again on the chair just put down: the view from the other side",
    // (a chair as it is first put down: its up end at the left, the right end lower, every bond plain)
    icon: <path d="M2.5 6.5 L6.2 13.5 L11.8 11.9 L17.5 13.5 L13.8 6.5 L8.2 8.1 Z" />,
  },
  {
    id: "haworth",
    name: "Haworth ring",
    // (what it does a second time, said as the pointer rests on it: a ring of five, a furanose's)
    tip: "Haworth ring. Chosen again on the ring just put down: a ring of five",
    // (a Haworth ring of six seen from slightly above, every edge at the icons' one weight)
    icon: <path d="M2.8 9.6 L6.6 6 L13.4 6 L17.2 9.6 L13.2 13.6 L6.8 13.6 Z" />,
  },
  {
    id: "newman",
    name: "Newman projection",
    // (a circle, three bonds meeting at its centre and three starting at its rim)
    icon: (
      <>
        <circle cx="11" cy="11" r="4.2" />
        <path d="M11 11 L11 3.5 M11 11 L4.5 14.8 M11 11 L17.5 14.8" />
        <path d="M14.6 9 L18 7 M7.4 9 L4 7 M11 15.2 L11 19" />
      </>
    ),
  },
];

/** The pen, among the marks on the page after the shapes: its card opened, to write by hand. */
const PEN = {
  id: "pen" as const,
  name: "Pen",
  // (a pen, writing)
  icon: <path d="M4 16 L5 12 L13.5 3.5 L16.5 6.5 L8 15 Z M11.5 5.5 L14.5 8.5" />,
};

/** Each that opens a row below the row (or a field): its id. */
const OPENS = ["smiles", "scheme", "marks", "projections"] as const;
const opens = (id: string): id is (typeof OPENS)[number] => (OPENS as readonly string[]).includes(id);

/**
 * What a double-click on empty space opens there: a bond, a chain, a
 * SMILES, words, a reaction arrow or a "+", each an icon - named as the
 * pointer rests on it - put down where the double-click was (a chain
 * begins there, led by a drag from its icon or traced with the button up;
 * a SMILES is typed in a field that opens below the row); and, after a
 * thin rule, one button for calculations, which opens below them to who does them - each
 * plugin added that fills a kind of step, then Meno - each a row of the
 * kinds it fills (docs/WORKFLOWS.md, *A step: from Quick Add*) - and after
 * them the procedures saved, an icon each, named as the pointer rests on
 * it. A wire let go on empty space opens it at its calculations alone,
 * those that take what the wire carries.
 * It stands up and to the right of that point, inside the canvas, and
 * closes on a choice, on Escape, on a press anywhere else and on a turn of
 * the wheel.
 */
export default function QuickAdd({
  x,
  y,
  within,
  steps,
  wired = false,
  procedures = [],
  onChoose,
  onChain,
  onArrow,
  onShape,
  onSmiles,
  onNamed,
  onFound,
  onCoordinates,
  onOutput,
  onStep,
  onProcedure,
  onClose,
  anchor,
}: {
  /** The canvas, for it to stand at its point on the page and the view to ease along for it (useMenuAt). */
  anchor?: MenuAnchor;
  x: number;
  y: number;
  within: { width: number; height: number };
  /** Who does steps, each with the kinds it fills - for a wire, those that take what it carries. */
  steps: readonly QuickGroup[];
  /** Opened by a wire let go: its calculations alone. */
  wired?: boolean;
  /** The procedures saved: each by its id and name, and what it needs that is not added - offered, but not to be put down, where it needs anything. */
  procedures?: readonly { id: string; name: string; needs: readonly string[] }[];
  onChoose: (what: QuickAddChoice) => void;
  /** A chain begun where Quick Add was opened, by a press on its icon. */
  onChain: (press: React.PointerEvent) => void;
  /** An arrow begun where Quick Add was opened, by a press on its icon: drawn to where a drag goes, or - a click - put as one is made. */
  onArrow?: (press: React.PointerEvent) => void;
  /** A shape begun where Quick Add was opened, by a press on its icon (docs/PRESENTING.md, *Shapes*). */
  onShape?: (kind: ShapeKind, press: React.PointerEvent) => void;
  /** A SMILES drawn where Quick Add was opened: done, or failing with what to say. */
  onSmiles: (smiles: string) => Promise<void>;
  /** A molecule the dictionary has, typed in the SMILES field and drawn as the dictionary's (chem/resolve): by its label. */
  onNamed?: (label: string) => void;
  /** A compound found by its name through the plugin filling the names role (`service`, its name), chosen to be drawn: done, or failing with what to say (chem/nameLookup). */
  onFound?: (found: NamedStructure, service: string) => Promise<void>;
  /** Coordinates pasted in the SMILES field - a paper's, copied from a PDF: the structures they hold, shown before they are placed (lib/io/coordinates). */
  onCoordinates?: (structures: CoordinateStructure[]) => void;
  /** A calculation's output pasted whole in the SMILES field (lib/calc/probe `outputKindIn`): read as one opened is, put down where Quick Add was opened. */
  onOutput?: (text: string) => void;
  onStep: (kind: StepKind, by: string) => void;
  onProcedure?: (id: string) => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState<QuickPanel>(wired ? "calculations" : "none");
  // (the SMILES icon named for names too, once a plugin looks them up)
  const rowName = (c: { id: string; name: string }) => (c.id === "smiles" && onFound && rolePlugin("names") ? "SMILES or name" : c.name);
  const calcOpen = open === "calculations";
  // (the Calculations rows made the first time they are opened - not as Quick Add opens, where they are shut and would
  //  only add to its first frame - and kept from then on, so that they ease shut whole)
  const [madeBefore, setCalcMade] = useState(calcOpen);
  const calcMade = calcMadeWith(open, madeBefore);
  if (calcMade !== madeBefore) setCalcMade(calcMade);
  const ref = useRef<HTMLDivElement>(null);
  // (going, chosen from or closed: it does nothing more as it fades - theme/leaving)
  const { leaving, held } = useLeaving();
  // (opened: a guide's step waiting for it goes on)
  useEffect(() => guideNotice("quick-add"), []);
  // (and what reads a SMILES started, should it be at hand, so that the first one typed waits for no start - not for a wire's calculations, which have no field)
  useEffect(() => {
    if (!wired) void startAhead("smiles");
  }, [wired]);
  useEffect(() => {
    if (leaving) return;
    // (a press elsewhere only closes it; a turn of the wheel closes it and zooms; Escape closes it - none while a question is asked: ./quickAddLeave)
    const { outside, key: onKey } = quickAddLeaves((t) => !!ref.current?.contains(t as Node), onClose);
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("wheel", outside, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("wheel", outside, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose, leaving]);
  // (a key typed with no icon chosen: the SMILES field opens with it - typing is what a first-time chemist tries - an input
  //  method's composing there: ./quickAddLeave `typedIntoQuickAdd`)
  const [seed, setSeed] = useState<{ text: string; n: number } | null>(null);
  useEffect(() => {
    if (leaving || wired) return;
    const onType = (e: KeyboardEvent) => {
      const what = typedIntoQuickAdd(e, open !== "none");
      if (!what) return;
      e.stopPropagation();
      if ("seed" in what) {
        e.preventDefault();
        setSeed((s) => ({ text: what.seed, n: (s?.n ?? 0) + 1 }));
      }
      // (the field takes the focus as it opens: SmilesField's own effect - it is inert until then)
      setOpen("smiles");
    };
    window.addEventListener("keydown", onType, true);
    return () => window.removeEventListener("keydown", onType, true);
  }, [leaving, wired, open]);
  // (a row for each who does steps, its steps under it - and one for the procedures, after them: as wide as their names need, whatever the row above holds)
  const offered = wired ? [] : procedures;
  // (measured only once its rows are made: a font's measure as Quick Add opens would only add to its first frame)
  const calcWidth = useMemo(
    () => (wired || calcMade ? listWidth([...steps.flatMap((g) => [g.name, ...g.steps.map((k) => k.name)]), ...(wired ? [] : procedures).map((p) => p.name)]) : 0),
    [steps, procedures, wired, calcMade],
  );
  // (its icons, the Calculations one among them, the gaps between them, the divider before Calculations, the card's padding: the rules and the field below span it whole)
  const rowWidth = (ROW.length + 1) * (SIZE + GAP) + 8 + 9;
  // (a wire's: as wide as its rows, or the words saying there are none)
  const width = wired ? (steps.length ? calcWidth + 8 : 200) : calcOpen ? Math.max(rowWidth, calcWidth + 8) : rowWidth;
  // opened at its point on the page, up and to the right, whatever its size; the view eases along where it would lie past the canvas (useMenuAt)
  useMenuAt(ref, { x, y }, anchor);
  return (
    <motion.div
      ref={ref}
      {...RISE}
      {...held}
      role="toolbar"
      aria-label="Add"
      data-guide="quick-add"
      className="absolute z-50 rounded-lg border border-gh-line bg-white p-1 shadow-lg"
      style={{ left: x + MENU_OFF, top: y - MENU_OFF, transformOrigin: "top left", maxHeight: within.height - 2 * MENU_MARGIN, overflowY: "auto" }}
    >
      {!wired && (
        <div className="flex items-center gap-0.5">
          {ROW.map((c) => (
            <button
              key={c.id}
              aria-label={rowName(c)}
              data-tip={rowName(c)}
              aria-expanded={opens(c.id) ? open === c.id : undefined}
              onPointerDown={c.id === "chain" ? (e) => e.button === 0 && onChain(e) : c.id === "arrow" && onArrow ? (e) => e.button === 0 && onArrow(e) : undefined}
              onClick={
                c.id === "chain" || (c.id === "arrow" && onArrow)
                  ? undefined
                  : opens(c.id)
                    ? (e) => togglesOn(e.detail) && setOpen((o) => toggledPanel(o, c.id as QuickPanel))
                    : () => onChoose(c.id as QuickAddChoice)
              }
              className={`meno-press relative rounded-md flex items-center justify-center text-gh-black transition-colors duration-150 ease-meno ${opens(c.id) && open === c.id ? "bg-gh-base" : "hover:bg-gh-base"}`}
              style={{ width: SIZE, height: SIZE }}
            >
              <svg viewBox="0 0 20 20" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {c.icon}
              </svg>
              {/* (a group's corner mark: it opens a row of its own) */}
              {(c.id === "scheme" || c.id === "marks" || c.id === "projections") && (
                <svg viewBox="0 0 6 4" width={6} height={4} aria-hidden className="absolute right-1 bottom-1 text-gh-gray">
                  <path d="M0 0 H6 L3 4 Z" fill="currentColor" />
                </svg>
              )}
            </button>
          ))}
          <div className="mx-1 h-6 border-l border-gh-line" role="separator" />
          <button
            aria-label="Calculations"
            aria-expanded={calcOpen}
            data-tip="Calculations"
            onClick={(e) => togglesOn(e.detail) && setOpen((o) => (o === "calculations" ? "none" : "calculations"))}
            className={`meno-press rounded-md flex items-center justify-center text-gh-black transition-colors duration-150 ease-meno ${calcOpen ? "bg-gh-base" : "hover:bg-gh-base"}`}
            style={{ width: SIZE, height: SIZE }}
          >
            {/* (as heavy as the glyphs beside it, drawn on a 20-unit square) */}
            <CalculationsGlyph stroke={2.1} />
          </button>
        </div>
      )}
      {/* (the SMILES field, likewise) */}
      {!wired && (
        <div className="grid transition-[grid-template-rows,opacity] duration-200 ease-meno" style={{ gridTemplateRows: open === "smiles" ? "1fr" : "0fr", opacity: open === "smiles" ? 1 : 0 }}>
          {/* (clipped for the ease - but over the card's padding, so the field's focus ring shows whole) */}
          <div className="-mx-1 px-1 overflow-hidden" inert={open !== "smiles"}>
            <SmilesField width={width - 8} open={open === "smiles"} seed={seed} onSmiles={onSmiles} onNamed={onNamed} onFound={onFound} onCoordinates={onCoordinates} onOutput={onOutput} />
          </div>
        </div>
      )}
      {/* (a scheme's row, likewise: each put down where Quick Add was opened, as the row's own are) */}
      {!wired && (
        <div className="grid transition-[grid-template-rows,opacity] duration-200 ease-meno" style={{ gridTemplateRows: open === "scheme" ? "1fr" : "0fr", opacity: open === "scheme" ? 1 : 0 }}>
          <div className="overflow-hidden" inert={open !== "scheme"}>
            <div role="group" aria-label="Scheme" className="mt-1 pt-1 border-t border-gh-line flex items-center gap-0.5" style={{ width: width - 8 }}>
              {SCHEME.map((c) => (
                <RowIcon key={c.id} name={c.name} icon={c.icon} onClick={() => onChoose(c.id as QuickAddChoice)} />
              ))}
            </div>
          </div>
        </div>
      )}
      {/* (the projections, likewise: each tool puts its solid down where Quick Add was opened) */}
      {!wired && (
        <div className="grid transition-[grid-template-rows,opacity] duration-200 ease-meno" style={{ gridTemplateRows: open === "projections" ? "1fr" : "0fr", opacity: open === "projections" ? 1 : 0 }}>
          <div className="overflow-hidden" inert={open !== "projections"}>
            <div role="group" aria-label="Projections" className="mt-1 pt-1 border-t border-gh-line flex items-center gap-0.5" style={{ width: width - 8 }}>
              {PROJECTIONS.map((c) => (
                <RowIcon key={c.id} name={c.name} tip={c.tip} icon={c.icon} onClick={() => onChoose(c.id as QuickAddChoice)} />
              ))}
            </div>
          </div>
        </div>
      )}
      {/* (the marks on the page, likewise: each shape drawn from where Quick Add was opened, by a drag from its icon or traced with the button up; the pen, its card opened) */}
      {!wired && (
        <div className="grid transition-[grid-template-rows,opacity] duration-200 ease-meno" style={{ gridTemplateRows: open === "marks" ? "1fr" : "0fr", opacity: open === "marks" ? 1 : 0 }}>
          <div className="overflow-hidden" inert={open !== "marks"}>
            <div role="group" aria-label="Marks on the page" className="mt-1 pt-1 border-t border-gh-line flex items-center gap-0.5" style={{ width: width - 8 }}>
              {SHAPE_KINDS.map((k) => (
                <RowIcon key={k} name={SHAPE_NAMES[k]} icon={SHAPE_ICONS[k]} onPointerDown={(e) => e.button === 0 && onShape?.(k, e)} />
              ))}
              <RowIcon name={PEN.name} icon={PEN.icon} onClick={() => onChoose(PEN.id)} />
            </div>
          </div>
        </div>
      )}
      {/* (opening below the row in a short ease, not at once) */}
      <div className="grid transition-[grid-template-rows,opacity] duration-200 ease-meno" style={{ gridTemplateRows: calcOpen ? "1fr" : "0fr", opacity: calcOpen ? 1 : 0 }}>
        <div className="overflow-hidden">
          <div className={wired ? "" : "mt-1 pt-1 border-t border-gh-line"} style={{ width: width - 8 }}>
            {!calcMade ? null : steps.length || offered.length ? (
              <QuickAddCalculations steps={steps} procedures={offered} width={width - 8} shown={calcOpen} onStep={onStep} onProcedure={onProcedure} />
            ) : (
              <div className="px-2 text-xs leading-9 text-gh-gray whitespace-nowrap">No step added takes this</div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Where a SMILES is typed, below Quick Add's row: Enter draws it - the
 * first time, once the plugin that reads SMILES is set up - and what went
 * wrong, if anything, is said under it. Coordinates pasted in it are read
 * whole, their lines' ends and all, which the field itself would drop.
 * A molecule the dictionary has - DMF, Et3N, THF - is drawn from the
 * dictionary, its name and formula said under the field as it is typed;
 * where the text is that and a SMILES too (NBS), each is offered there, the
 * SMILES first, and Enter draws the one chosen - by a click, or the up and
 * down arrows (chem/resolve).
 *
 * Where a plugin looks names up (the names role), one more row is offered,
 * last - first only where nothing else reads: the text looked up there.
 * Nothing goes out while typing: only that row chosen, by Enter or a click,
 * sends it (chem/nameLookup, docs/EDITOR-2D.md *Quick Add*).
 */
function SmilesField({
  width,
  open,
  seed,
  onSmiles,
  onNamed,
  onFound,
  onCoordinates,
  onOutput,
}: {
  width: number;
  open: boolean;
  /** A key typed in Quick Add with no icon chosen: the field begun with it (each its own `n`). */
  seed?: { text: string; n: number } | null;
  onSmiles: (smiles: string) => Promise<void>;
  onNamed?: (label: string) => void;
  onFound?: (found: NamedStructure, service: string) => Promise<void>;
  onCoordinates?: (structures: CoordinateStructure[]) => void;
  onOutput?: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  // (a SMILES no plugin here reads: the plugins online that do, each to add - RoleOffer)
  const [needs, setNeeds] = useState<RoleId | null>(null);
  const [busy, setBusy] = useState(false);
  // (where chemistry stands while it is got ready or started: one line under the field - a SMILES typed meanwhile waits, and is drawn)
  const chem = useChem();
  // (the first start's card, where it sets chemistry up: said here too, as the card says it)
  const card = useFirstSetUp();
  // (its files' share as they download: the worker's set-up's, or the card's plugin's while the card sets it up)
  const share = useDownloads((d) => (chem.state === "setting-up" ? d[chem.id] : card.phase === "going" && card.plugin ? d[card.plugin.id] : undefined));
  // (what the text reads as - offered only where the dictionary has it: a SMILES alone is drawn as it was - and which is chosen)
  const named = onNamed != null;
  const readings = useMemo(() => (named ? resolve(text, "molecule").readings : []), [text, named]);
  // (the plugin that looks names up, where one does; the network's state, for a lookup that cannot go out)
  const finder = onFound ? rolePlugin("names") : undefined;
  const offline = useNetwork((n) => n.offline);
  // (one known not to be added - taken away, or its set-up not done - offered as such: nothing asked of the network for it)
  const finderAway = useReaders((r) => (finder ? r.state[finder.id] === "absent" || r.state[finder.id] === "removing" : false));
  const lookable = !!finder && text.trim().length > 0;
  // (with a lookup offered, every reading is offered beside it - a SMILES alone too - and the lookup last: ./quickAddSmiles)
  const shown = fieldRows(readings, lookable);
  const { offered, rows } = shown;
  const [choice, setChoice] = useState(0);
  const at = Math.min(choice, Math.max(0, rows - 1));
  const lookupChosen = lookable && at === offered.length;
  const chosen: Reading | undefined = lookupChosen ? undefined : offered[at];
  // (what a lookup came to - going, found several to choose from, or said - for the text it was asked for; and which found is chosen)
  const [looked, setLooked] = useState<{ name: string; going: true } | { name: string; found: NameFound } | null>(null);
  const [pick, setPick] = useState(0);
  const several = looked && "found" in looked && "found" in looked.found && looked.found.found.length > 1 ? looked.found : null;
  // (each lookup's own number: one asked again, or the text changed, and an answer that comes after is dropped)
  const asked = useRef(0);
  useEffect(() => () => void (asked.current += 1), []);
  // (a SMILES being read: a second Enter as quick as the first finds it so, though React has not drawn the first's yet)
  const reading = useRef(false);
  // (a compound found that a plugin missing kept from being drawn: drawn once that plugin is added, not looked up again)
  const foundAgain = useRef<NamedStructure | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  // (begun with the key typed in Quick Add: what is there now, as typed, the caret after it)
  useEffect(() => {
    if (!seed) return;
    setText(seed.text);
    setChoice(0);
    setError(null);
    setNeeds(null);
  }, [seed]);
  /** The SMILES read and drawn; or why not, and the plugins online that read it (./quickAddSmiles). */
  const read = (smiles: string) => {
    foundAgain.current = null;
    reading.current = true;
    setBusy(true);
    setError(null);
    setNeeds(null);
    void readSmiles(smiles, onSmiles)
      .then((r) => {
        if (!r) return;
        setError(r.error);
        setNeeds(r.needs);
      })
      .finally(() => {
        reading.current = false;
        setBusy(false);
      });
  };
  /** A compound found drawn; or why not, said under the field. */
  const draw = (f: NamedStructure) => {
    if (!finder || !onFound) return;
    foundAgain.current = null;
    reading.current = true;
    setBusy(true);
    setError(null);
    void onFound(f, finder.name)
      .catch((e: unknown) => {
        // (said as a SMILES not drawn is - a plugin missing offered as there, and drawn once it is added: `foundAgain`)
        const r = notDrawnSaid(e, FOUND_NOT_DRAWN);
        foundAgain.current = r.needs ? f : null;
        setError(r.error);
        setNeeds(r.needs);
      })
      .finally(() => {
        reading.current = false;
        setBusy(false);
      });
  };
  /** The text looked up, as the chemist chose: one found drawn at once, several offered, none or an error said. */
  const lookUp = (name: string) => {
    if (!finder || offline || finderAway) return;
    const mine = ++asked.current;
    setError(null);
    setNeeds(null);
    setPick(0);
    setLooked({ name, going: true });
    void lookUpName(finder, name)
      .catch((e: unknown): NameFound => ({ error: failureSaid(e, lookUpFailedSaid(finder.name)) }))
      .then((found) => {
        if (asked.current !== mine) return;
        setLooked({ name, found });
        if ("found" in found && found.found.length === 1) draw(found.found[0]);
      });
  };
  const going = !!looked && "going" in looked;
  return (
    <form
      className="mt-1 pt-1 pb-0.5 border-t border-gh-line"
      style={{ width }}
      onSubmit={(e) => {
        e.preventDefault();
        const smiles = text.trim();
        if (!smiles || busy || going || reading.current) return;
        const does = enterDoes(shown, choice, !!several);
        if (does === "found") draw(several!.found[Math.min(pick, several!.found.length - 1)]);
        else if (does === "look up") lookUp(smiles);
        else if (does === "named" && chosen?.as === "label") onNamed!(chosen.label);
        else read(smiles);
      }}
    >
      <input
        ref={input}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setChoice(0);
          setError(null);
          setNeeds(null);
          // (another text: a lookup under way for the last is let go, and what it found with it)
          asked.current += 1;
          setLooked(null);
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          const step = e.key === "ArrowDown" ? 1 : -1;
          if (several) {
            e.preventDefault();
            const n = several.found.length;
            setPick((p) => (Math.min(p, n - 1) + step + n) % n);
            return;
          }
          if (rows < 2) return;
          e.preventDefault();
          setChoice((at + step + rows) % rows);
        }}
        onPaste={(e) => {
          const as = pastedAs(e.clipboardData.getData("text/plain"), { output: !!onOutput, coordinates: !!onCoordinates });
          if (!as) return;
          e.preventDefault();
          if ("output" in as) onOutput!(as.output);
          else onCoordinates!(as.structures);
        }}
        placeholder={finder ? (onCoordinates ? "SMILES, name or coordinates" : "SMILES or name") : onCoordinates ? "SMILES or coordinates" : "SMILES"}
        aria-label={finder ? "SMILES or name" : "SMILES"}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        className="w-full h-8 rounded-md border border-gh-line px-2 font-mono text-xs outline-none focus:border-accel-base focus:ring-2 focus:ring-accel-lightbase"
      />
      {rows > 0 && !several && (
        <DrawAs
          offered={offered}
          chosen={chosen}
          onChoose={setChoice}
          lookup={
            lookable && finder
              ? {
                  text: going ? "Looking up…" : offline ? offlineSaid(finder) : finderAway ? notAddedSaid(finder) : `Look up “${text.trim()}” at ${finder.name}`,
                  chosen: lookupChosen,
                  dim: (offline || finderAway) && !going,
                  onChoose: () => {
                    setChoice(offered.length);
                    if (!busy && !going && !reading.current) lookUp(text.trim());
                  },
                }
              : undefined
          }
        />
      )}
      {several && finder && (
        <FoundRows
          found={several}
          chosen={Math.min(pick, several.found.length - 1)}
          service={finder.name}
          onChoose={(i) => {
            setPick(i);
            draw(several.found[i]);
          }}
        />
      )}
      {looked && "found" in looked && finder && "none" in looked.found && <div className="px-0.5 pt-1 text-[11px] leading-snug text-gh-gray">{finder.name} has no compound by this name</div>}
      {looked && "found" in looked && "error" in looked.found && <div className="px-0.5 pt-1 text-[11px] leading-snug text-accel-accent break-words">{looked.found.error}</div>}
      {/* (where chemistry stands, while it is got ready or started - many seconds on a first start: said here, where it is typed) */}
      {!error && !needs && chemistryLine(chem, share, busy, card) && (
        <div role="status" className="meno-fade-in px-0.5 pt-1 text-[11px] leading-snug text-gh-gray">
          {chemistryLine(chem, share, busy, card)}
        </div>
      )}
      {error && <div className="px-0.5 pt-1 text-[11px] leading-snug text-accel-accent break-words">{error}</div>}
      {/* (no plugin looks names up and nothing here reads the text: the role offered, quietly - looked up later only on the chemist's Enter) */}
      {error && !needs && onFound && !finder && !readings.length && (
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setNeeds("names")} className="px-0.5 pt-1 text-[11px] text-gh-gray hover:text-gh-black transition-colors duration-150 ease-meno">
          Look it up as a name…
        </button>
      )}
      {needs && (
        <div className="flex flex-wrap items-center gap-1.5 px-0.5 pt-1 text-[11px]">
          <RoleOffer
            role={needs}
            // (added: what was typed is read again, and drawn - not typed again; a name is looked up only on the chemist's Enter)
            done={() => {
              const letGo = () => {
                setError(null);
                setNeeds(null);
              };
              const found = foundAgain.current;
              if (needs === "names") letGo();
              else if (found) draw(found);
              else afterAdded(text, reading.current, read, letGo);
            }}
          />
        </div>
      )}
    </form>
  );
}

/**
 * The compounds a name was found as, in the service's order, none chosen for
 * the chemist: each by its title, formula and id, and in words what is not
 * plain about it; how many more the service has, where it has more. Enter,
 * or a click, draws the one chosen.
 */
function FoundRows({ found, chosen, service, onChoose }: { found: { found: NamedStructure[]; more: number }; chosen: number; service: string; onChoose: (i: number) => void }) {
  return (
    <div className="pt-1">
      <div role="radiogroup" aria-label={`Found at ${service}`} className="flex flex-col gap-0.5">
        {found.found.map((f, i) => {
          const notes = foundNotes(f);
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={i === chosen}
              aria-label={[`${f.title} · ${f.formula} · ${f.id}`, ...(notes.length ? [notes.join(", ")] : [])].join(", ")}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChoose(i)}
              className={`w-full rounded-md border px-2 py-1 text-left text-[11px] leading-snug transition-colors duration-150 ease-meno ${i === chosen ? "border-accel-base bg-accel-lightbase text-gh-black" : "border-gh-line text-gh-gray hover:bg-gh-base"}`}
            >
              <span className="block truncate">
                {f.title}
                {" · "}
                <FormulaText text={f.formula} />
                {" · "}
                {f.id}
              </span>
              {notes.length > 0 && <span className="block truncate text-gh-gray">{notes.join(", ")}</span>}
            </button>
          );
        })}
      </div>
      {found.more > 0 && (
        <div className="px-0.5 pt-1 text-[11px] text-gh-gray">
          and {found.more} more at {service}
        </div>
      )}
    </div>
  );
}

/**
 * What the SMILES field's text will be drawn as, under it: each reading -
 * the SMILES, the dictionary's molecule by its name (or its label) - with
 * its formula (once, where the label is the formula), the one chosen in
 * Meno's colour; a click chooses another.
 */
export function DrawAs({
  offered,
  chosen,
  onChoose,
  lookup,
}: {
  offered: readonly Reading[];
  chosen: Reading | undefined;
  onChoose: (i: number) => void;
  /** The text looked up as a name, last: what the row says, whether it is chosen, dimmed where it cannot go out. */
  lookup?: { text: string; chosen: boolean; dim: boolean; onChoose: () => void };
}) {
  return (
    <div role="radiogroup" aria-label="Draw as" className="flex flex-wrap gap-1 pt-1">
      {offered.map((r, i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={r === chosen}
          // (named by the words it shows, its formula's counts among them - not left to how its parts are set)
          aria-label={readingSaid(r)}
          // (the field keeps the keys: Enter still draws)
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChoose(i)}
          className={`h-6 max-w-full truncate rounded-full border px-2 text-[11px] leading-6 transition-colors duration-150 ease-meno ${r === chosen ? "border-accel-base bg-accel-lightbase text-gh-black" : "border-gh-line text-gh-gray hover:bg-gh-base"}`}
        >
          {r.as === "smiles" ? "SMILES" : r.as === "label" && r.name ? r.name : <FormulaText text={r.as === "label" ? r.label : r.formula} />}
          {/* (a label that is its formula, PdCl2, is said once) */}
          {!(r.as === "label" && !r.name && sameFormula(r.label, r.formula)) && (
            <>
              {" \u00b7 "}
              <FormulaText text={r.formula} />
            </>
          )}
        </button>
      ))}
      {lookup && (
        <button
          type="button"
          role="radio"
          aria-checked={lookup.chosen}
          aria-label={lookup.text}
          aria-disabled={lookup.dim || undefined}
          onMouseDown={(e) => e.preventDefault()}
          onClick={lookup.onChoose}
          className={`h-6 max-w-full truncate rounded-full border px-2 text-[11px] leading-6 transition-colors duration-150 ease-meno ${lookup.dim ? "border-gh-line text-gh-gray opacity-60" : lookup.chosen ? "border-accel-base bg-accel-lightbase text-gh-black" : "border-gh-line text-gh-gray hover:bg-gh-base"}`}
        >
          {lookup.text}
        </button>
      )}
    </div>
  );
}

/** An icon of a row Quick Add opens below its own: as the row's icons are, named as the pointer rests on it. */
function RowIcon({ name, tip, icon, onClick, onPointerDown }: { name: string; tip?: string; icon: ReactNode; onClick?: () => void; onPointerDown?: (e: React.PointerEvent) => void }) {
  return (
    <button
      aria-label={name}
      data-tip={tip ?? name}
      onClick={onClick}
      onPointerDown={onPointerDown}
      className="meno-press rounded-md flex items-center justify-center text-gh-black hover:bg-gh-base transition-colors duration-150 ease-meno"
      style={{ width: SIZE, height: SIZE }}
    >
      <svg viewBox="0 0 20 20" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {icon}
      </svg>
    </button>
  );
}
