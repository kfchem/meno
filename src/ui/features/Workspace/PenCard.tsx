import { motion } from "motion/react";
import { useEffect } from "react";
import { RISE } from "../../theme/motion";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { setInUse } from "../../../lib/chem/palette";
import { INK_WIDTHS_PT, markerColour } from "../../../lib/chem/ink";
import type { InkMode } from "./store/types";
import { useInFront } from "../../layouts/inFront";

/** Each button's square, in px; each swatch's. */
const SIZE = 32;
const SWATCH = 20;

/** The pen, the marker and the eraser, each as Quick Add draws its icons. */
const TOOLS: { tool: InkMode["tool"]; name: string; icon: React.ReactNode }[] = [
  { tool: "pen", name: "Pen", icon: <path d="M4 16 L5 12 L13.5 3.5 L16.5 6.5 L8 15 Z M11.5 5.5 L14.5 8.5" /> },
  {
    tool: "marker",
    name: "Marker",
    icon: (
      <>
        <path d="M6 13 L12.5 4.5 L15.5 7 L9 15.5 Z" />
        <path d="M3 17 H17" strokeWidth={3} />
      </>
    ),
  },
  { tool: "eraser", name: "Eraser", icon: <path d="M8 16 H16 M3.5 11.5 L10.5 4.5 L16 10 L10 16 H7.5 Z M7 8 L12.5 13.5" /> },
];

/**
 * The pen's card (docs/PRESENTING.md, *Handwriting*), at the top of the
 * canvas while writing with a mouse or a trackpad: the pen, the marker or
 * the eraser; the colours of the set in use - the first, none of the pen's
 * own: a pen's, the drawing's ink; a marker's, the set's first colour, so
 * not shown twice; the three widths; and Done. Escape is Done too.
 */
export default function PenCard({ mode, onMode, onDone }: { mode: InkMode; onMode: (mode: InkMode) => void; onDone: () => void }) {
  const set = setInUse(useAppSettings((s) => s.colours));
  const palette = set.colours;
  // (Escape is Done while its tab is in front: in another tab it is that tab's, the pen waiting)
  const inFront = useInFront();
  useEffect(() => {
    if (!inFront) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onDone();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone, inFront]);
  const writing = mode.tool !== "eraser";
  const marker = mode.tool === "marker";
  const own = marker ? markerColour(set) : "#141414";
  const swatches = [null, ...(marker ? palette.filter((c) => c !== own) : palette)];
  const widths = INK_WIDTHS_PT[mode.tool === "marker" ? "marker" : "pen"];
  return (
    <motion.div
      {...RISE}
      role="toolbar"
      aria-label="Pen"
      className="absolute z-40 left-1/2 top-3 -translate-x-1/2 flex items-center gap-1 rounded-lg border border-gh-line bg-white p-1 shadow-lg"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {TOOLS.map((t) => (
        <button
          key={t.tool}
          aria-label={t.name}
          title={t.name}
          aria-pressed={mode.tool === t.tool}
          onClick={() => onMode({ ...mode, tool: t.tool })}
          className={`rounded-md flex items-center justify-center text-gh-black transition-colors duration-150 ease-meno ${mode.tool === t.tool ? "bg-gh-base" : "hover:bg-gh-base"}`}
          style={{ width: SIZE, height: SIZE }}
        >
          <svg viewBox="0 0 20 20" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {t.icon}
          </svg>
        </button>
      ))}
      <div className="mx-1 h-6 border-l border-gh-line" role="separator" />
      <div role="group" aria-label="Colour" className={`flex items-center gap-1 transition-opacity duration-150 ease-meno ${writing ? "" : "opacity-35 pointer-events-none"}`}>
        {swatches.map((c) => (
          <button
            key={c ?? "own"}
            aria-label={c ?? (marker ? "The marker's own" : "The pen's own")}
            title={c ?? (marker ? "The marker's own" : "The pen's own")}
            onClick={() => onMode({ ...mode, color: c })}
            className={`shrink-0 rounded-full transition-shadow duration-150 ease-meno ${mode.color === c || (c === null && mode.color === own) ? "ring-2 ring-offset-1 ring-gh-gray" : ""}`}
            style={{ width: SWATCH, height: SWATCH, background: c ?? own }}
          />
        ))}
      </div>
      <div className="mx-1 h-6 border-l border-gh-line" role="separator" />
      <div role="group" aria-label="Width" className={`flex items-center gap-0.5 transition-opacity duration-150 ease-meno ${writing ? "" : "opacity-35 pointer-events-none"}`}>
        {([0, 1, 2] as const).map((w) => (
          <button
            key={w}
            aria-label={`${widths[w]} pt`}
            title={`${widths[w]} pt`}
            aria-pressed={mode.width === w}
            onClick={() => onMode({ ...mode, width: w })}
            className={`rounded-md flex items-center justify-center transition-colors duration-150 ease-meno ${mode.width === w ? "bg-gh-base" : "hover:bg-gh-base"}`}
            style={{ width: SIZE - 6, height: SIZE }}
          >
            <span className="rounded-full bg-gh-black" style={{ width: 3 + 3 * w, height: 3 + 3 * w }} />
          </button>
        ))}
      </div>
      <div className="mx-1 h-6 border-l border-gh-line" role="separator" />
      <button onClick={onDone} className="h-8 px-3 rounded-md text-sm text-gh-black hover:bg-gh-base transition-colors duration-150 ease-meno">
        Done
      </button>
    </motion.div>
  );
}
