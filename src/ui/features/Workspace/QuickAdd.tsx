import RoleOffer from "./RoleOffer";
import type { RoleId } from "../../../lib/plugins/roles";
import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RISE } from "../../theme/motion";
import { useLeaving } from "../../theme/leaving";
import { CalculationsGlyph } from "./workflow/icons";
import { placeQuickAdd } from "./quickAddPlace";
import { calcHeight, listWidth } from "./quickAddLabel";
import QuickAddCalculations from "./QuickAddCalculations";
import { guideNotice } from "../../../lib/guide/guide";
import type { StepKind } from "./workflow/kinds";
import type { QuickGroup } from "./workflow/offered";
import { SHAPE_KINDS, SHAPE_NAMES, type ShapeKind } from "../../../lib/chem/shapes";
import { togglesOn } from "./utils/press";
import { quickAddLeaves } from "./quickAddLeave";
import type { CoordinateStructure } from "../../../lib/io/coordinates";
import { pastedAs } from "./quickAddPaste";
import { afterAdded, readSmiles } from "./quickAddSmiles";
import { toggledPanel, type QuickPanel } from "./quickAddPanel";
import { resolve, sameFormula, type Reading } from "./chem/resolve";
import { FormulaText } from "../../abbreviations/FormulaText";

/** What Quick Add puts down where it was opened. */
export type QuickAddChoice = "bond" | "text" | "arrow" | "plus" | "push" | "cycle" | "slide" | "pen" | "conversation";

/** What opens below Quick Add's row: nothing, the calculations, the field a SMILES is typed in, or the shapes. */
const QUICK_PANELS: readonly QuickPanel[] = ["none", "calculations", "smiles", "scheme", "marks"];

/** Each icon's size, in px; and the gap between two in a row (gap-0.5). */
const SIZE = 36;
const GAP = 2;
/** How tall the SMILES field stands below the row, its rule above it and room for its focus ring below, in px; and the row of shapes. */
const SMILES_H = 32 + 9 + 2;
const SHAPES_H = 36 + 9;

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
const ROW: { id: QuickAddChoice | "chain" | "smiles" | "scheme" | "marks"; name: string; icon: ReactNode }[] = [
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

/** The pen, among the marks on the page after the shapes: its card opened, to write by hand. */
const PEN = {
  id: "pen" as const,
  name: "Pen",
  // (a pen, writing)
  icon: <path d="M4 16 L5 12 L13.5 3.5 L16.5 6.5 L8 15 Z M11.5 5.5 L14.5 8.5" />,
};

/** Each that opens a row below the row (or a field): its id. */
const OPENS = ["smiles", "scheme", "marks"] as const;
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
  onCoordinates,
  onOutput,
  onStep,
  onProcedure,
  onClose,
}: {
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
  /** Coordinates pasted in the SMILES field - a paper's, copied from a PDF: the structures they hold, shown before they are placed (lib/io/coordinates). */
  onCoordinates?: (structures: CoordinateStructure[]) => void;
  /** A calculation's output pasted whole in the SMILES field (lib/calc/probe `outputKindIn`): read as one opened is, put down where Quick Add was opened. */
  onOutput?: (text: string) => void;
  onStep: (kind: StepKind, by: string) => void;
  onProcedure?: (id: string) => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState<QuickPanel>(wired ? "calculations" : "none");
  const calcOpen = open === "calculations";
  const ref = useRef<HTMLDivElement>(null);
  // (going, chosen from or closed: it does nothing more as it fades - theme/leaving)
  const { leaving, held } = useLeaving();
  // (opened: a guide's step waiting for it goes on)
  useEffect(() => guideNotice("quick-add"), []);
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
  // (a row for each who does steps, its steps under it - and one for the procedures, after them: as wide as their names need, whatever the row above holds)
  const offered = wired ? [] : procedures;
  const calcWidth = useMemo(() => listWidth([...steps.flatMap((g) => [g.name, ...g.steps.map((k) => k.name)]), ...(wired ? [] : procedures).map((p) => p.name)]), [steps, procedures, wired]);
  const listHeight = calcHeight([...steps.map((g) => g.steps.length), ...(offered.length ? [offered.length] : [])]);
  // (its icons, the Calculations one among them, the gaps between them, the divider before Calculations, the card's padding: the rules and the field below span it whole)
  const rowWidth = (ROW.length + 1) * (SIZE + GAP) + 8 + 9;
  // (a wire's: as wide as its rows, or the words saying there are none)
  const width = wired ? (steps.length ? calcWidth + 8 : 200) : calcOpen ? Math.max(rowWidth, calcWidth + 8) : rowWidth;
  // (its size with each panel open below its row - a wire's, its calculations alone - and where it stands, chosen once, as it opens)
  const sizeOf = (panel: QuickPanel): { width: number; height: number } => {
    if (wired) return { width, height: Math.max(SIZE, listHeight) + 8 };
    switch (panel) {
      case "none":
        return { width: rowWidth, height: SIZE + 8 };
      case "calculations":
        return { width: Math.max(rowWidth, calcWidth + 8), height: SIZE + 8 + Math.max(SIZE, listHeight) + 9 };
      case "smiles":
        return { width: rowWidth, height: SIZE + 8 + SMILES_H };
      case "scheme":
      case "marks":
        return { width: rowWidth, height: SIZE + 8 + SHAPES_H };
    }
  };
  const [place] = useState(() => placeQuickAdd(x, y, within, sizeOf(wired ? "calculations" : "none"), QUICK_PANELS.map(sizeOf)));
  // (as it is laid out - not as it was reckoned: a row wider than its sum, at a display scale, reaches past the canvas - it is eased back within it)
  const [back, setBack] = useState({ dx: 0, dy: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent;
    if (!el || !parent) return;
    const fit = () => {
      const a = el.getBoundingClientRect();
      const b = parent.getBoundingClientRect();
      const dx = a.right > b.right - 4 ? Math.min(0, b.right - 4 - a.right) : 0;
      const dy = a.bottom > b.bottom - 4 ? Math.min(0, b.bottom - 4 - a.bottom) : 0;
      const l = a.left + dx < b.left + 4 ? b.left + 4 - (a.left + dx) : 0;
      const t = a.top + dy < b.top + 4 ? b.top + 4 - (a.top + dy) : 0;
      setBack((was) => {
        const next = { dx: was.dx + dx + l, dy: was.dy + dy + t };
        return next.dx === was.dx && next.dy === was.dy ? was : next;
      });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <motion.div
      ref={ref}
      {...RISE}
      {...held}
      role="toolbar"
      aria-label="Add"
      data-guide="quick-add"
      className="absolute z-50 rounded-lg border border-gh-line bg-white p-1 shadow-lg"
      style={{ left: place.left + back.dx, top: place.top + back.dy, transformOrigin: place.origin, transition: "left 150ms ease-out, top 150ms ease-out" }}
    >
      {!wired && (
        <div className="flex items-center gap-0.5">
          {ROW.map((c) => (
            <button
              key={c.id}
              aria-label={c.name}
              title={c.name}
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
              {(c.id === "scheme" || c.id === "marks") && (
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
            title="Calculations"
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
            <SmilesField width={width - 8} open={open === "smiles"} onSmiles={onSmiles} onNamed={onNamed} onCoordinates={onCoordinates} onOutput={onOutput} />
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
            {steps.length || offered.length ? (
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
 */
function SmilesField({
  width,
  open,
  onSmiles,
  onNamed,
  onCoordinates,
  onOutput,
}: {
  width: number;
  open: boolean;
  onSmiles: (smiles: string) => Promise<void>;
  onNamed?: (label: string) => void;
  onCoordinates?: (structures: CoordinateStructure[]) => void;
  onOutput?: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  // (a SMILES no plugin here reads: the plugins online that do, each to add - RoleOffer)
  const [needs, setNeeds] = useState<RoleId | null>(null);
  const [busy, setBusy] = useState(false);
  // (what the text reads as - offered only where the dictionary has it: a SMILES alone is drawn as it was - and which is chosen)
  const named = onNamed != null;
  const readings = useMemo(() => (named ? resolve(text, "molecule").readings : []), [text, named]);
  const offered = readings.some((r) => r.as === "label") ? readings : [];
  const [choice, setChoice] = useState(0);
  const chosen: Reading | undefined = offered[Math.min(choice, offered.length - 1)];
  // (a SMILES being read: a second Enter as quick as the first finds it so, though React has not drawn the first's yet)
  const reading = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  /** The SMILES read and drawn; or why not, and the plugins online that read it (./quickAddSmiles). */
  const read = (smiles: string) => {
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
  return (
    <form
      className="mt-1 pt-1 pb-0.5 border-t border-gh-line"
      style={{ width }}
      onSubmit={(e) => {
        e.preventDefault();
        const smiles = text.trim();
        if (!smiles || busy || reading.current) return;
        if (chosen?.as === "label") {
          onNamed!(chosen.label);
          return;
        }
        read(smiles);
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
        }}
        onKeyDown={(e) => {
          if (offered.length < 2 || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
          e.preventDefault();
          const at = Math.min(choice, offered.length - 1);
          setChoice((at + (e.key === "ArrowDown" ? 1 : offered.length - 1)) % offered.length);
        }}
        onPaste={(e) => {
          const as = pastedAs(e.clipboardData.getData("text/plain"), { output: !!onOutput, coordinates: !!onCoordinates });
          if (!as) return;
          e.preventDefault();
          if ("output" in as) onOutput!(as.output);
          else onCoordinates!(as.structures);
        }}
        placeholder={onCoordinates ? "SMILES or coordinates" : "SMILES"}
        aria-label="SMILES"
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        className="w-full h-8 rounded-md border border-gh-line px-2 font-mono text-xs outline-none focus:border-accel-base focus:ring-2 focus:ring-accel-lightbase"
      />
      {offered.length > 0 && <DrawAs offered={offered} chosen={chosen} onChoose={setChoice} />}
      {error && <div className="px-0.5 pt-1 text-[11px] leading-snug text-accel-accent break-words">{error}</div>}
      {needs && (
        <div className="flex flex-wrap items-center gap-1.5 px-0.5 pt-1 text-[11px]">
          <RoleOffer
            role={needs}
            // (added: what was typed is read again, and drawn - not typed again)
            done={() =>
              afterAdded(text, reading.current, read, () => {
                setError(null);
                setNeeds(null);
              })
            }
          />
        </div>
      )}
    </form>
  );
}

/**
 * What the SMILES field's text will be drawn as, under it: each reading -
 * the SMILES, the dictionary's molecule by its name (or its label) - with
 * its formula (once, where the label is the formula), the one chosen in
 * Meno's colour; a click chooses another.
 */
export function DrawAs({ offered, chosen, onChoose }: { offered: readonly Reading[]; chosen: Reading | undefined; onChoose: (i: number) => void }) {
  return (
    <div role="radiogroup" aria-label="Draw as" className="flex flex-wrap gap-1 pt-1">
      {offered.map((r, i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={r === chosen}
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
    </div>
  );
}

/** An icon of a row Quick Add opens below its own: as the row's icons are, named as the pointer rests on it. */
function RowIcon({ name, icon, onClick, onPointerDown }: { name: string; icon: ReactNode; onClick?: () => void; onPointerDown?: (e: React.PointerEvent) => void }) {
  return (
    <button
      aria-label={name}
      title={name}
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
