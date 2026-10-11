import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { RISE } from "../../theme/motion";
import { WORDS_SIZE_RANGE, WORDS_SIZES } from "../../../lib/chem/captions";

/**
 * A card of sizes where a right-click's menu was, for words on the page
 * (docs/EDITOR-2D.md, *Text*): the labels' own - none of their own -
 * a talk's text, a heading and a title, each named with its points, and
 * any other typed in points. A size pressed, or typed and Enter, is given
 * at once, one step; the one they have now is ringed. Closes on Escape, on
 * a press elsewhere and on a turn of the wheel.
 */
export default function SizeCard({
  now,
  label,
  onSize,
  x,
  y,
  within,
  onClose,
}: {
  /** Their own size now, in points; none, the labels'. */
  now: number | null;
  /** The labels' size, in points. */
  label: number;
  onSize: (pt: number | null) => void;
  x: number;
  y: number;
  within: { width: number; height: number };
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState(() => String(Math.round((now ?? label) * 10) / 10));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPress = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPress, true);
    window.addEventListener("wheel", onClose, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPress, true);
      window.removeEventListener("wheel", onClose, true);
    };
  }, [onClose]);
  const give = (pt: number | null) => {
    onSize(pt);
    onClose();
  };
  const typedPt = Number(typed.replace(",", "."));
  const typedOk = Number.isFinite(typedPt) && typedPt >= WORDS_SIZE_RANGE[0] && typedPt <= WORDS_SIZE_RANGE[1];
  const width = 300;
  const height = 92;
  return (
    <motion.div
      ref={ref}
      {...RISE}
      role="dialog"
      aria-label="Size"
      tabIndex={-1}
      className="absolute z-50 rounded-md border border-gh-line bg-white px-2 py-2 shadow-lg text-sm text-gh-black outline-none"
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
              onClick={() => give(s.pt)}
              className={`h-7 px-2 rounded-md border text-xs transition-colors duration-150 ease-meno ${on ? "border-accel-base text-accel-base bg-accel-lightbase/40" : "border-gh-line hover:bg-gh-base"}`}
            >
              {s.name} <span className="text-gh-gray tabular-nums">{s.pt ?? Math.round(label * 10) / 10}</span>
            </button>
          );
        })}
      </div>
      <label className="mt-2 flex items-center gap-2 text-xs text-gh-gray">
        Other
        <input
          aria-label="Size in points"
          inputMode="decimal"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && typedOk) give(typedPt);
          }}
          className={`w-16 h-7 rounded-md border px-2 text-sm text-gh-black tabular-nums outline-none ${typedOk ? "border-gh-line focus:border-accel-base" : "border-accel-accent"}`}
        />
        pt
      </label>
    </motion.div>
  );
}
