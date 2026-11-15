import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { formulaOf, type CoordinateStructure } from "../../../lib/io/coordinates";
import { useInFront } from "../../layouts/inFront";
import Checkbox from "../../controls/Checkbox";

/**
 * The structures found in coordinates pasted, dropped or selected in a PDF
 * (lib/io/coordinates), before any is placed: each with its name - to be
 * changed - its atoms and formula, and what looks wrong; those ticked
 * placed in 3D, a set of them, as one step. A card over the canvas, as
 * Ask3D is. Atoms mixed with another column's cannot be ticked. Text
 * pasted on the page may go there as words instead (`onText`).
 */
/** A structure not to be placed: its atoms mixed with another column's, a line among them that does not read, or a table only a plugin not added reads. */
const placeless = (s: CoordinateStructure) => !!s.mixed || !!s.broken?.length || !!s.unread;

export default function CoordinatesCard({
  structures,
  onPlace,
  onText,
  onCancel,
}: {
  structures: CoordinateStructure[];
  onPlace: (chosen: { structure: CoordinateStructure; name: string }[]) => void;
  onText?: () => void;
  onCancel: () => void;
}) {
  const [ticked, setTicked] = useState(() => structures.map((s) => !placeless(s)));
  const [names, setNames] = useState(() => structures.map((s) => s.name));
  const placeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    placeRef.current?.focus();
  }, []);
  const chosen = structures.flatMap((structure, i) => (ticked[i] && !placeless(structure) ? [{ structure, name: names[i].trim() || structure.name }] : []));
  const inFront = useInFront();
  useEffect(() => {
    if (!inFront) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, inFront]);
  const bohr = structures.some((s) => s.bohr);
  return (
    <motion.div
      role="dialog"
      aria-labelledby="coordinates-title"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
      className="absolute top-3 left-1/2 -translate-x-1/2 z-50 w-[460px] max-w-[90%] rounded-lg border border-gh-line bg-white/95 shadow-lg p-3 text-sm text-gh-black"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="coordinates-title" className="font-semibold mb-2">
        3D structures
      </h2>
      <ul className="max-h-[50vh] overflow-y-auto -mx-1 mb-2" aria-label="Structures found">
        {structures.map((s, i) => (
          <li key={i} className="flex items-start gap-2 px-1 py-1 rounded-md hover:bg-gh-base">
            <Checkbox
              label={`Place ${names[i]}`}
              checked={ticked[i] && !placeless(s)}
              disabled={placeless(s)}
              onChange={(v) => setTicked((t) => t.map((x, k) => (k === i ? v : x)))}
              className="mt-1.5"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <input
                  className="min-w-0 flex-1 bg-transparent rounded px-1 -mx-1 py-0.5 outline-none focus:bg-white focus:ring-1 focus:ring-gh-line truncate"
                  aria-label="Name"
                  value={names[i]}
                  onChange={(e) => setNames((n) => n.map((v, k) => (k === i ? e.target.value : v)))}
                />
                <span className="shrink-0 text-gh-gray tabular-nums">{s.atoms.length === 1 ? "1 atom" : `${s.atoms.length} atoms`}</span>
                <span className="shrink-0 w-28 text-right text-gh-gray truncate">{formulaOf(s.atoms)}</span>
              </div>
              {s.notes.length > 0 && <div className="text-xs text-gh-gray truncate">{s.notes.join(" · ")}</div>}
              {s.continues && s.continues.length > 0 && <div className="text-xs text-gh-gray">{`Continues across a page break (${s.continues.join(", ")})`}</div>}
              {s.skipped && s.skipped.length > 0 && (
                <div className="text-xs text-gh-gray truncate" title={s.skipped.join("\n")}>
                  {`${s.skipped.length === 1 ? "1 line" : `${s.skipped.length} lines`} not read: ${s.skipped.join(" · ")}`}
                </div>
              )}
              {s.warnings.map((w) => (
                <div key={w} className="text-xs text-accel-accent">
                  {w}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {bohr && <p className="text-xs text-gh-gray mb-2">Lengths given in bohr are placed in ångströms.</p>}
      <div className="flex justify-end gap-2">
        {onText && (
          <button onClick={onText} className="mr-auto rounded-md border border-gh-line px-3 py-1.5 hover:bg-gray-100">
            Paste as text
          </button>
        )}
        <button onClick={onCancel} className="rounded-md border border-gh-line px-3 py-1.5 hover:bg-gray-100">
          Cancel
        </button>
        <button
          ref={placeRef}
          disabled={!chosen.length}
          onClick={() => onPlace(chosen)}
          className="rounded-md border border-accel-base bg-accel-lightbase px-3 py-1.5 hover:brightness-95 disabled:opacity-50"
        >
          {chosen.length === 1 ? "Place 1" : `Place ${chosen.length}`}
        </button>
      </div>
    </motion.div>
  );
}
