import { motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { RISE } from "../../theme/motion";
import { CalculationsGlyph, ProcedureGlyph, StepGlyph } from "./workflow/icons";
import { placeQuickAdd } from "./quickAddPlace";
import { guideNotice } from "../../../lib/plugins/guides";
import type { StepKind } from "./workflow/kinds";
import type { QuickGroup } from "./workflow/offered";

/** What Quick Add puts down where it was opened. */
export type QuickAddChoice = "bond" | "text" | "arrow" | "plus";

/** What opens below Quick Add's row: nothing, the calculations, or the field a SMILES is typed in. */
type QuickPanel = "none" | "calculations" | "smiles";
const QUICK_PANELS: readonly QuickPanel[] = ["none", "calculations", "smiles"];

/** Each icon's size, in px. */
const SIZE = 36;
/** How wide the name of who does a row of steps stands, beside its kinds: "Gaussian 16" and "Procedures" whole. */
const LABEL_W = 84;
/** How tall the SMILES field stands below the row, its rule above it, in px. */
const SMILES_H = 32 + 9;

/**
 * The row's icons, in order: what draws a structure - a bond, a chain, a
 * SMILES - then what a reaction scheme has besides - words, an arrow, a "+".
 */
const ROW: { id: QuickAddChoice | "chain" | "smiles"; name: string; icon: ReactNode }[] = [
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
    name: "Reaction arrow",
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
  onSmiles,
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
  /** A SMILES drawn where Quick Add was opened: done, or failing with what to say. */
  onSmiles: (smiles: string) => Promise<void>;
  onStep: (kind: StepKind, by: string) => void;
  onProcedure?: (id: string) => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState<QuickPanel>(wired ? "calculations" : "none");
  const calcOpen = open === "calculations";
  const ref = useRef<HTMLDivElement>(null);
  // (opened: a guide's step waiting for it goes on)
  useEffect(() => guideNotice("quick-add"), []);
  useEffect(() => {
    const outside = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
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
  }, [onClose]);
  // (a row for each who does steps: its name, then its kinds - and one for the procedures, after them)
  const offered = wired ? [] : procedures;
  const most = Math.max(1, ...steps.map((g) => g.steps.length), offered.length);
  const calcWidth = LABEL_W + most * SIZE + 8;
  const rowWidth = (ROW.length + 1) * SIZE + 8 + 9;
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
    }
  };
  const [place] = useState(() => placeQuickAdd(x, y, within, sizeOf(wired ? "calculations" : "none"), QUICK_PANELS.map(sizeOf)));
  return (
    <motion.div
      ref={ref}
      {...RISE}
      role="toolbar"
      aria-label="Add"
      data-guide="quick-add"
      className="absolute z-50 rounded-lg border border-gh-line bg-white p-1 shadow-lg"
      style={{ left: place.left, top: place.top, transformOrigin: place.origin }}
    >
      {!wired && (
        <div className="flex items-center gap-0.5">
          {ROW.map((c) => (
            <button
              key={c.id}
              aria-label={c.name}
              title={c.name}
              aria-expanded={c.id === "smiles" ? open === "smiles" : undefined}
              onPointerDown={c.id === "chain" ? (e) => e.button === 0 && onChain(e) : undefined}
              onClick={
                c.id === "chain"
                  ? undefined
                  : c.id === "smiles"
                    ? () => setOpen((o) => (o === "smiles" ? "none" : "smiles"))
                    : () => onChoose(c.id as QuickAddChoice)
              }
              className={`rounded-md flex items-center justify-center text-gh-black transition-colors duration-150 ease-meno ${c.id === "smiles" && open === "smiles" ? "bg-gh-base" : "hover:bg-gh-base"}`}
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
            onClick={() => setOpen((o) => (o === "calculations" ? "none" : "calculations"))}
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
          <div className="overflow-hidden" inert={open !== "smiles"}>
            <SmilesField width={width - 8} open={open === "smiles"} onSmiles={onSmiles} />
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
                  <span className="shrink-0 truncate px-1.5 text-xs text-gh-gray" style={{ width: LABEL_W }}>
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
                <span className="shrink-0 truncate px-1.5 text-xs text-gh-gray" style={{ width: LABEL_W }}>
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
 * wrong, if anything, is said under it.
 */
function SmilesField({ width, open, onSmiles }: { width: number; open: boolean; onSmiles: (smiles: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  return (
    <form
      className="mt-1 pt-1 border-t border-gh-line"
      style={{ width }}
      onSubmit={(e) => {
        e.preventDefault();
        const smiles = text.trim();
        if (!smiles || busy) return;
        setBusy(true);
        setError(null);
        onSmiles(smiles)
          .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
          .finally(() => setBusy(false));
      }}
    >
      <input
        ref={input}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        placeholder="SMILES"
        aria-label="SMILES"
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        className="w-full h-8 rounded-md border border-gh-line px-2 font-mono text-xs outline-none focus:border-accel-base focus:ring-2 focus:ring-accel-lightbase"
      />
      {error && <div className="px-0.5 pt-1 text-[11px] leading-snug text-accel-accent break-words">{error}</div>}
    </form>
  );
}
