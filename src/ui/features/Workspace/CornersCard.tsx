import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { RISE } from "../../theme/motion";
import { useLeaving } from "../../theme/leaving";

/**
 * A card of corners where a right-click's menu was, for a rectangle
 * (docs/PRESENTING.md, *Shapes*): square, rounded as *Box around these*
 * rounds them, round ends - its shorter side's ends whole half circles -
 * and any other radius typed in points. One pressed, or typed and Enter,
 * is given at once, one step, the corners going round or square eased; the
 * one they have now is ringed. Closes on Escape, on a press elsewhere and
 * on a turn of the wheel.
 */
export default function CornersCard({
  now,
  most,
  rounded,
  onCorners,
  x,
  y,
  within,
  onClose,
}: {
  /** Their radius now, in points: 0, square. */
  now: number;
  /** The most it can be, in points: half the rectangle's shorter side. */
  most: number;
  /** *Rounded*, in points: a fifth of a bond (lib/chem/shapes `roundedOfBondPt`). */
  rounded: number;
  onCorners: (pt: number) => void;
  x: number;
  y: number;
  within: { width: number; height: number };
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // (going, it does nothing more as it fades - theme/leaving)
  const { leaving, held } = useLeaving();
  const [typed, setTyped] = useState(() => String(Math.round(Math.min(now, most) * 10) / 10));
  useEffect(() => {
    if (leaving) return;
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
  }, [onClose, leaving]);
  const give = (pt: number) => {
    onCorners(pt);
    onClose();
  };
  const typedPt = Number(typed.replace(",", "."));
  const typedOk = Number.isFinite(typedPt) && typedPt >= 0 && typedPt <= most + 1e-9;
  const near = (a: number, b: number) => Math.abs(a - b) < 0.05;
  const choices = [
    { name: "Square", pt: 0 },
    { name: "Rounded", pt: Math.min(rounded, most) },
    { name: "Round ends", pt: most },
  ];
  const width = 300;
  const height = 92;
  return (
    <motion.div
      ref={ref}
      {...RISE}
      {...held}
      role="dialog"
      aria-label="Corners"
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
      <div role="group" aria-label="Corners" className="flex flex-wrap gap-1">
        {choices.map((c) => {
          const on = near(Math.min(now, most), c.pt);
          return (
            <button
              key={c.name}
              onClick={() => give(c.pt)}
              className={`h-7 px-2 rounded-md border text-xs transition-colors duration-150 ease-meno ${on ? "border-accel-base text-accel-base bg-accel-lightbase/40" : "border-gh-line hover:bg-gh-base"}`}
            >
              {c.name} {c.pt > 0 && <span className="text-gh-gray tabular-nums">{Math.round(c.pt * 10) / 10}</span>}
            </button>
          );
        })}
      </div>
      <label className="mt-2 flex items-center gap-2 text-xs text-gh-gray">
        Other
        <input
          aria-label="Corner radius in points"
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
