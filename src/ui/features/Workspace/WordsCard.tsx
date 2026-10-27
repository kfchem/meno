import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { RISE } from "../../theme/motion";
import { useLeaving } from "../../theme/leaving";
import { WORDS_SIZE_RANGE, WORDS_SIZES, WORDS_SPACING_RANGE, WORDS_SPACINGS } from "../../../lib/chem/captions";
import { LABEL_TYPEFACES } from "../../../lib/chem/styleFields";
import TypefacePicker from "../StyleEditor/TypefacePicker";
import { useEditor } from "./store";
import { WORDS_CARD } from "./utils/cardBeside";

const ROUND = (v: number) => String(Math.round(v * 100) / 100);

/**
 * A card of how words on the page are set, opened from their menu
 * (docs/EDITOR-2D.md, *Text*), beside them, clear of them: their size - the labels' own, none of their
 * own, a talk's text, a heading and a title, each named with its points,
 * and any other typed in points; how far apart their lines are - single,
 * 1.15, one and a half, double, or any other typed; and their typeface -
 * the drawing's, or one of their own. Each pressed, or typed and Enter, is
 * given at once, one step; those they have now are ringed. Closes on
 * Escape, on a press elsewhere and on a turn of the wheel elsewhere.
 */
export default function WordsCard({
  id,
  label,
  drawing,
  onSize,
  onLines,
  onFont,
  x,
  y,
  within,
  onClose,
}: {
  /** The words, by their caption's id. */
  id: number;
  /** The labels' size, in points. */
  label: number;
  /** The drawing's typeface: the labels'. */
  drawing: string;
  onSize: (pt: number | null) => void;
  /** Their line spacing, as a multiple of single spacing; null, single. */
  onLines: (lines: number | null) => void;
  /** Their own typeface; null, the drawing's. */
  onFont: (family: string | null) => void;
  x: number;
  y: number;
  within: { width: number; height: number };
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // (going, it does nothing more as it fades - theme/leaving)
  const { leaving, held } = useLeaving();
  // (as the words are now: each change seen ringed as it is given)
  const c = useEditor((s) => s.captions.find((w) => w.id === id));
  const now = c?.size ?? null;
  const lines = c?.lines ?? 1;
  const font = c?.font ?? drawing;
  const [typed, setTyped] = useState(() => ROUND(now ?? label));
  const [spaced, setSpaced] = useState(() => ROUND(lines));
  useEffect(() => {
    if (leaving) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPress = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    // (the typefaces' list scrolled inside it: not a turn of the wheel elsewhere)
    const onWheel = (e: WheelEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPress, true);
    window.addEventListener("wheel", onWheel, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPress, true);
      window.removeEventListener("wheel", onWheel, true);
    };
  }, [onClose, leaving]);
  const typedPt = Number(typed.replace(",", "."));
  const typedOk = Number.isFinite(typedPt) && typedPt >= WORDS_SIZE_RANGE[0] && typedPt <= WORDS_SIZE_RANGE[1];
  const spacedBy = Number(spaced.replace(",", "."));
  const spacedOk = Number.isFinite(spacedBy) && spacedBy >= WORDS_SPACING_RANGE[0] && spacedBy <= WORDS_SPACING_RANGE[1];
  const giveLines = (v: number) => {
    onLines(v === 1 ? null : v);
    setSpaced(ROUND(v));
  };
  const { width, height } = WORDS_CARD;
  const chip = (on: boolean) =>
    `h-7 px-2 rounded-md border text-xs transition-colors duration-150 ease-meno ${on ? "border-accel-base text-accel-base bg-accel-lightbase/40" : "border-gh-line hover:bg-gh-base"}`;
  const field = (ok: boolean) =>
    `w-16 h-7 rounded-md border px-2 text-sm text-gh-black tabular-nums outline-none ${ok ? "border-gh-line focus:border-accel-base" : "border-accel-accent"}`;
  return (
    <motion.div
      ref={ref}
      {...RISE}
      {...held}
      role="dialog"
      aria-label="Font"
      tabIndex={-1}
      className="absolute z-50 rounded-md border border-gh-line bg-white px-2 py-2 shadow-lg text-sm text-gh-black outline-none flex flex-col gap-2"
      style={{ left: Math.max(0, Math.min(x, within.width - width - 8)), top: Math.max(0, Math.min(y, within.height - height - 8)), width }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div role="group" aria-label="Sizes" className="flex flex-wrap gap-1">
        {WORDS_SIZES.map((s) => {
          const on = s.pt == null ? now == null : now === s.pt;
          return (
            <button
              key={s.name}
              onClick={() => {
                onSize(s.pt);
                setTyped(ROUND(s.pt ?? label));
              }}
              className={chip(on)}
            >
              {s.name} <span className="text-gh-gray tabular-nums">{s.pt ?? Math.round(label * 10) / 10}</span>
            </button>
          );
        })}
      </div>
      <label className="flex items-center gap-2 text-xs text-gh-gray">
        Other
        <input
          aria-label="Size in points"
          inputMode="decimal"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && typedOk) onSize(typedPt);
          }}
          className={field(typedOk)}
        />
        pt
      </label>
      <div className="border-t border-gh-line pt-2 flex flex-col gap-1">
        <span className="text-xs text-gh-gray">Line spacing</span>
        <div role="group" aria-label="Line spacings" className="flex flex-wrap items-center gap-1">
          {WORDS_SPACINGS.map((v) => (
            <button key={v} onClick={() => giveLines(v)} className={`${chip(Math.abs(lines - v) < 1e-6)} tabular-nums min-w-9`}>
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
      <div className="border-t border-gh-line pt-2 flex items-start justify-between gap-2">
        <span className="text-xs text-gh-gray pt-1.5">Typeface</span>
        {/* (the drawing's first: picked, the words follow the drawing's typeface again) */}
        <TypefacePicker value={font} suggested={[drawing, ...LABEL_TYPEFACES.filter((f) => f !== drawing)]} label="Typeface" onChange={(f) => onFont(f === drawing ? null : f)} />
      </div>
    </motion.div>
  );
}
