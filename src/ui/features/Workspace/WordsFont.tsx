import { useState } from "react";
import { WORDS_SIZE_CHIPS, WORDS_SIZE_RANGE, WORDS_SPACING_RANGE, WORDS_SPACINGS } from "../../../lib/chem/captions";
import { LABEL_TYPEFACES } from "../../../lib/chem/styleFields";
import TypefacePicker from "../StyleEditor/TypefacePicker";
import { useEditor } from "./store";

const ROUND = (v: number) => String(Math.round(v * 100) / 100);

/** How tall the rows are, in pixels, as the menu reckons where it goes (PartMenu). */
export const WORDS_FONT_HEIGHT = 196;

/**
 * How words on the page are set, inside their menu under its icons
 * (docs/EDITOR-2D.md, *Text*): their size in points - 8, 10, 12, 14, 18 or
 * 24, or any other typed - how far apart their lines are - single, 1.15,
 * one and a half, double, or any other typed - and their typeface, the
 * drawing's or one of their own. Each pressed, or typed and Enter, is
 * given at once, one step, the menu kept open to try another; those they
 * have now are lit, as they change.
 */
export default function WordsFont({
  id,
  label,
  drawing,
  onSize,
  onLines,
  onFont,
}: {
  /** The words, by their caption's id. */
  id: number;
  /** The labels' size, in points. */
  label: number;
  /** The drawing's typeface: the labels'. */
  drawing: string;
  onSize: (pt: number) => void;
  /** Their line spacing; null, single. */
  onLines: (lines: number | null) => void;
  /** Their own typeface; null, the drawing's. */
  onFont: (family: string | null) => void;
}) {
  // (as the words are now: each change seen lit as it is given)
  const c = useEditor((s) => s.captions.find((w) => w.id === id));
  const lines = c?.lines ?? 1;
  const family = c?.font ?? null;
  // (the size they are set at: their own, or the labels')
  const pt = c?.size ?? label;
  const [typed, setTyped] = useState(() => ROUND(pt));
  const [spaced, setSpaced] = useState(() => ROUND(lines));
  const typedPt = Number(typed.replace(",", "."));
  const typedOk = Number.isFinite(typedPt) && typedPt >= WORDS_SIZE_RANGE[0] && typedPt <= WORDS_SIZE_RANGE[1];
  const spacedBy = Number(spaced.replace(",", "."));
  const spacedOk = Number.isFinite(spacedBy) && spacedBy >= WORDS_SPACING_RANGE[0] && spacedBy <= WORDS_SPACING_RANGE[1];
  const giveSize = (v: number) => {
    onSize(v);
    setTyped(ROUND(v));
  };
  const giveLines = (v: number) => {
    onLines(v === 1 ? null : v);
    setSpaced(ROUND(v));
  };
  const chip = (on: boolean) =>
    `h-7 min-w-8 px-1.5 rounded-md border text-xs tabular-nums transition-colors duration-150 ease-meno ${on ? "border-accel-base text-accel-base bg-accel-lightbase/40" : "border-gh-line hover:bg-gh-base"}`;
  const field = (ok: boolean) =>
    `w-14 h-7 rounded-md border px-2 text-xs text-right text-gh-black tabular-nums outline-none ${ok ? "border-gh-line focus:border-accel-base" : "border-accel-accent"}`;
  const heading = "block text-[11px] text-gh-gray mb-1";
  return (
    <div className="px-2 pb-1 flex flex-col gap-2">
      <div>
        <span className={heading}>Size</span>
        <div role="group" aria-label="Sizes" className="flex items-center gap-1">
          {WORDS_SIZE_CHIPS.map((v) => (
            <button key={v} onClick={() => giveSize(v)} className={chip(Math.abs(pt - v) < 1e-6)}>
              {v}
            </button>
          ))}
          <input
            aria-label="Size in points"
            inputMode="decimal"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && typedOk) giveSize(typedPt);
            }}
            className={`${field(typedOk)} ml-1`}
          />
          <span className="text-xs text-gh-gray">pt</span>
        </div>
      </div>
      <div>
        <span className={heading}>Line spacing</span>
        <div role="group" aria-label="Line spacings" className="flex items-center gap-1">
          {WORDS_SPACINGS.map((v) => (
            <button key={v} onClick={() => giveLines(v)} className={chip(Math.abs(lines - v) < 1e-6)}>
              {v}
            </button>
          ))}
          <input
            aria-label="Line spacing"
            inputMode="decimal"
            value={spaced}
            onChange={(e) => setSpaced(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && spacedOk) giveLines(spacedBy);
            }}
            className={`${field(spacedOk)} ml-1`}
          />
          <span className="text-xs text-gh-gray">×</span>
        </div>
      </div>
      <div>
        <span className={heading}>Typeface</span>
        {/* (the drawing's first: picked, the words follow the drawing's typeface again) */}
        <TypefacePicker value={family ?? drawing} suggested={[drawing, ...LABEL_TYPEFACES.filter((f) => f !== drawing)]} label="Typeface" onChange={(f) => onFont(f === drawing ? null : f)} />
      </div>
    </div>
  );
}
