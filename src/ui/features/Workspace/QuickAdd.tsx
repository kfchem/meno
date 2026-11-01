import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RISE } from "../../theme/motion";
import { useLeaving } from "../../theme/leaving";
import { CalculationsGlyph, ProcedureGlyph, StepGlyph } from "./workflow/icons";
import { placeQuickAdd } from "./quickAddPlace";
import { labelWidth } from "./quickAddLabel";
import { guideNotice } from "../../../lib/guide/guide";
import type { StepKind } from "./workflow/kinds";
import type { QuickGroup } from "./workflow/offered";
import { SHAPE_KINDS, SHAPE_NAMES, type ShapeKind } from "../../../lib/chem/shapes";
import { swallowPress, togglesOn } from "./utils/press";
import type { CoordinateStructure } from "../../../lib/io/coordinates";
import { pastedAs } from "./quickAddPaste";
import { resolve, sameFormula, type Reading } from "./chem/resolve";
import { FormulaText } from "../../abbreviations/FormulaText";

/** What Quick Add puts down where it was opened. */
export type QuickAddChoice = "bond" | "text" | "arrow" | "plus" | "push" | "cycle" | "slide" | "pen";

/** What opens below Quick Add's row: nothing, the calculations, the field a SMILES is typed in, or the shapes. */
type QuickPanel = "none" | "calculations" | "smiles" | "shapes";
const QUICK_PANELS: readonly QuickPanel[] = ["none", "calculations", "smiles", "shapes"];

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
 * SMILES - then what a reaction scheme has besides - words, an arrow, a "+"
 * - and an electron-pushing arrow, begun at the first atom or bond pressed;
 * then a slide of what is seen (docs/PRESENTING.md), the pen - its card
 * opened, to write by hand - and the shapes, which open a row of their own
 * below it.
 */
const ROW: { id: QuickAddChoice | "chain" | "smiles" | "shapes"; name: string; icon: ReactNode }[] = [
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
  {
    id: "pen",
    name: "Pen",
    // (a pen, writing)
    icon: <path d="M4 16 L5 12 L13.5 3.5 L16.5 6.5 L8 15 Z M11.5 5.5 L14.5 8.5" />,
  },
  {
    id: "shapes",
    name: "Shapes",
    // (a square and a circle, one over the other)
    icon: (
      <>
        <rect x="2.5" y="7.5" width="9" height="9" rx="1" />
        <circle cx="13" cy="7.5" r="4.5" />
      </>
    ),
  },
];

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
    // (a press elsewhere only closes it - utils/press#swallowPress; a turn of the wheel closes it and zooms)
    const outside = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return;
      if (e.type === "pointerdown") swallowPress(e);
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("wheel", outside, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("wheel", outside, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose, leaving]);
  // (a row for each who does steps: its name, then its kinds - and one for the procedures, after them)
  const offered = wired ? [] : procedures;
  const most = Math.max(1, ...steps.map((g) => g.steps.length), offered.length);
  const labelW = useMemo(() => labelWidth([...steps.map((g) => g.name), ...(offered.length ? ["Procedures"] : [])]), [steps, offered.length]);
  const calcWidth = labelW + most * SIZE + 8;
  // (its icons, the Calculations one among them, the gaps between them, the divider before Calculations, the card's padding: the rules and the field below span it whole)
  const rowWidth = (ROW.length + 1) * (SIZE + GAP) + 8 + 9;
  // (a wire's: as wide as its rows, or the words saying there are none)
  const width = wired ? (steps.length ? calcWidth : 200) : calcOpen ? Math.max(rowWidth, calcWidth) : rowWidth;
  const rows = Math.max(1, steps.length) + (offered.length ? 1 : 0);
  // (its size with each panel open below its row - a wire's, its calculations alone - and where it stands, chosen once, as it opens)
  const sizeOf = (panel: QuickPanel): { width: number; height: number } => {
    if (wired) return { width, height: Math.max(1, steps.length) * SIZE + 8 };
    switch (panel) {
      case "none":
        return { width: rowWidth, height: SIZE + 8 };
      case "calculations":
        return { width: Math.max(rowWidth, calcWidth), height: SIZE + 8 + rows * SIZE + 9 };
      case "smiles":
        return { width: rowWidth, height: SIZE + 8 + SMILES_H };
      case "shapes":
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
              aria-expanded={c.id === "smiles" || c.id === "shapes" ? open === c.id : undefined}
              onPointerDown={c.id === "chain" ? (e) => e.button === 0 && onChain(e) : c.id === "arrow" && onArrow ? (e) => e.button === 0 && onArrow(e) : undefined}
              onClick={
                c.id === "chain" || (c.id === "arrow" && onArrow)
                  ? undefined
                  : c.id === "smiles" || c.id === "shapes"
                    ? (e) => togglesOn(e.detail) && setOpen((o) => (o === c.id ? "none" : (c.id as QuickPanel)))
                    : () => onChoose(c.id as QuickAddChoice)
              }
              className={`rounded-md flex items-center justify-center text-gh-black transition-colors duration-150 ease-meno ${(c.id === "smiles" || c.id === "shapes") && open === c.id ? "bg-gh-base" : "hover:bg-gh-base"}`}
              style={{ width: SIZE, height: SIZE }}
            >
              <svg viewBox="0 0 20 20" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {c.icon}
              </svg>
            </button>
          ))}
          <div className="mx-1 h-6 border-l border-gh-line" role="separator" />
          <button
            aria-label="Calculations"
            aria-expanded={calcOpen}
            title="Calculations"
            onClick={(e) => togglesOn(e.detail) && setOpen((o) => (o === "calculations" ? "none" : "calculations"))}
            className={`rounded-md flex items-center justify-center text-gh-black transition-colors duration-150 ease-meno ${calcOpen ? "bg-gh-base" : "hover:bg-gh-base"}`}
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
      {/* (the shapes, likewise: each drawn from where Quick Add was opened, by a drag from its icon or traced with the button up) */}
      {!wired && (
        <div className="grid transition-[grid-template-rows,opacity] duration-200 ease-meno" style={{ gridTemplateRows: open === "shapes" ? "1fr" : "0fr", opacity: open === "shapes" ? 1 : 0 }}>
          <div className="overflow-hidden" inert={open !== "shapes"}>
            <div role="group" aria-label="Shapes" className="mt-1 pt-1 border-t border-gh-line flex items-center gap-0.5" style={{ width: width - 8 }}>
              {SHAPE_KINDS.map((k) => (
                <button
                  key={k}
                  aria-label={SHAPE_NAMES[k]}
                  title={SHAPE_NAMES[k]}
                  onPointerDown={(e) => e.button === 0 && onShape?.(k, e)}
                  className="rounded-md flex items-center justify-center text-gh-black hover:bg-gh-base transition-colors duration-150 ease-meno"
                  style={{ width: SIZE, height: SIZE }}
                >
                  <svg viewBox="0 0 20 20" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    {SHAPE_ICONS[k]}
                  </svg>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* (opening below the row in a short ease, not at once) */}
      <div className="grid transition-[grid-template-rows,opacity] duration-200 ease-meno" style={{ gridTemplateRows: calcOpen ? "1fr" : "0fr", opacity: calcOpen ? 1 : 0 }}>
        <div className="overflow-hidden">
          <div role="group" aria-label="Calculations" className={wired ? "" : "mt-1 pt-1 border-t border-gh-line"} style={{ width: wired ? undefined : width - 8 }}>
            {steps.length ? (
              steps.map((g) => (
                <div key={g.by} role="group" aria-label={g.name} className="flex items-center">
                  <span className="shrink-0 truncate px-1.5 text-xs text-gh-gray" style={{ width: labelW }}>
                    {g.name}
                  </span>
                  {g.steps.map((k) => (
                    <button
                      key={k.kind}
                      aria-label={`${k.name} \u00b7 ${g.name}`}
                      title={k.name}
                      onClick={() => onStep(k.kind, g.by)}
                      className="rounded-md flex items-center justify-center text-gh-black hover:bg-gh-base"
                      style={{ width: SIZE, height: SIZE }}
                    >
                      <StepGlyph icon={k.icon} size={20} stroke={2.1} />
                    </button>
                  ))}
                </div>
              ))
            ) : (
              <div className="px-2 text-xs leading-9 text-gh-gray whitespace-nowrap">No step added takes this</div>
            )}
            {offered.length > 0 && (
              <div role="group" aria-label="Procedures" className="flex items-center">
                <span className="shrink-0 truncate px-1.5 text-xs text-gh-gray" style={{ width: labelW }}>
                  Procedures
                </span>
                {offered.map((p) => (
                  <button
                    key={p.id}
                    aria-label={`Procedure: ${p.name}`}
                    title={p.needs.length ? `${p.name} - needs ${p.needs.join(" and ")}` : p.name}
                    disabled={p.needs.length > 0}
                    onClick={() => onProcedure?.(p.id)}
                    className="rounded-md flex items-center justify-center text-gh-black hover:bg-gh-base disabled:opacity-35 disabled:hover:bg-transparent"
                    style={{ width: SIZE, height: SIZE }}
                  >
                    <ProcedureGlyph size={20} stroke={2.1} />
                  </button>
                ))}
              </div>
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
        reading.current = true;
        setBusy(true);
        setError(null);
        onSmiles(smiles)
          .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
          .finally(() => {
            reading.current = false;
            setBusy(false);
          });
      }}
    >
      <input
        ref={input}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setChoice(0);
          setError(null);
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
