import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { RISE } from "../../theme/motion";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { setInUse } from "../../../lib/chem/palette";
import { useEditor, useEditorStore } from "./store";
import { stylesOf } from "../../../lib/chem/captions";
import { isBox, tintOf } from "../../../lib/chem/shapes";

/** What a colour card is for: the atoms and bonds it colours or highlights, the rings it fills, by key, the electron-pushing arrows, arrows and words on the page it colours, and the shapes whose line it colours and which it fills. */
export type ColourTarget = { atoms: number[]; bonds: number[]; rings: string[]; pushes?: number[]; arrows?: number[]; captions?: number[]; shapes?: number[] };

type Row = "color" | "highlight" | "ring" | "line" | "fill" | "tint";
const ROW_NAME: Record<Row, string> = { color: "Colour", highlight: "Highlight", ring: "Fill ring", line: "Line", fill: "Fill", tint: "Light fill" };
/** How far toward white a light fill is: a quarter of its colour. */
const TINT = 0.25;
/** Each swatch's square, in px. */
const SWATCH = 22;

/**
 * A card of colours where a right-click's menu was, for the part it was
 * opened on: a row for its colour, one for its highlight, and - where it
 * holds rings whole, or is one - one for the rings' fill. A swatch pressed
 * is given at once, one step each; the one given now is ringed. Closes on
 * Escape, on a press elsewhere and on a turn of the wheel.
 */
export default function ColourCard({
  target,
  x,
  y,
  within,
  onClose,
}: {
  target: ColourTarget;
  x: number;
  y: number;
  within: { width: number; height: number };
  onClose: () => void;
}) {
  const store = useEditorStore();
  // (the set in use, chosen in Settings - and any other colour by the system's own chooser)
  const palette = setInUse(useAppSettings((s) => s.colours)).colours;
  const model = useEditor((s) => s.model);
  const ringFills = useEditor((s) => s.ringFills);
  const ref = useRef<HTMLDivElement>(null);
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
    ref.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPress, true);
      window.removeEventListener("wheel", onClose, true);
    };
  }, [onClose]);

  const parts = target.atoms.length + target.bonds.length > 0;
  const arrows = target.pushes ?? [];
  const pushes = useEditor((s) => s.pushes);
  // (arrows - a reaction's, or any: their colour)
  const lines = target.arrows ?? [];
  const drawnArrows = useEditor((s) => s.arrows);
  // (words on the page: their letters' colour)
  const words = target.captions ?? [];
  const captions = useEditor((s) => s.captions);
  // (an arrow has a colour, not a highlight; nor have words)
  // (shapes: their line's colour - none, no line - and, boxes among them, their fill, a colour or a light one)
  const shapeIds = target.shapes ?? [];
  const shapes = useEditor((s) => s.shapes).filter((x) => shapeIds.includes(x.id));
  const boxes = shapes.filter((x) => isBox(x.kind));
  const rows: Row[] = [
    ...(parts ? (["color", "highlight"] as const) : arrows.length || lines.length || words.length ? (["color"] as const) : []),
    ...(target.rings.length ? (["ring"] as const) : []),
    ...(shapes.length ? (["line"] as const) : []),
    ...(boxes.length ? (["fill", "tint"] as const) : []),
  ];
  // (the colour each row has now, where all it is for have the same one; null, none; undefined, several)
  const now = (row: Row): string | null | undefined => {
    const atoms = new Set(target.atoms);
    const bonds = new Set(target.bonds);
    if (row === "line" || row === "fill" || row === "tint") {
      const had = row === "line" ? shapes.map((x) => (x.stroke === "none" ? null : (x.stroke ?? ""))) : boxes.map((x) => x.fill ?? null);
      return had.every((c) => c === had[0]) ? had[0] : undefined;
    }
    const had =
      row === "ring"
        ? target.rings.map((k) => ringFills[k] ?? null)
        : [
            ...model.atoms.filter((a) => atoms.has(a.id)),
            ...model.bonds.filter((b) => bonds.has(b.id)),
            ...(row === "color" ? pushes.filter((p) => arrows.includes(p.id)) : []),
            ...(row === "color" ? drawnArrows.filter((a) => lines.includes(a.id)) : []),
          ]
            .map((p) => (p as { color?: string; highlight?: string })[row] ?? null)
            .concat(row === "color" ? captions.filter((c) => words.includes(c.id)).flatMap((c) => stylesOf(c.text.length, c.marks).map((st) => st?.color ?? null)) : []);
    return had.every((c) => c === had[0]) ? had[0] : undefined;
  };
  // (a colour chosen in the system's chooser is given as it changes there, all of it one step)
  const [opened] = useState(() => `card-${performance.now()}`);
  const give = (row: Row, color: string | null, gesture?: string) => {
    const s = store.getState();
    if (row === "ring") s.fillRings(target.rings, color, gesture);
    else if (row === "line") s.colourShapes(shapes.map((x) => x.id), "stroke", color ?? "none", gesture);
    else if (row === "fill" || row === "tint") s.colourShapes(boxes.map((x) => x.id), "fill", color, gesture);
    else {
      if (parts || arrows.length) s.colourParts({ atoms: target.atoms, bonds: target.bonds, pushes: arrows }, row, color, gesture);
      if (words.length && row === "color") s.colourWords(words, color, gesture);
      if (lines.length && row === "color") s.setArrowForm(lines, { color }, gesture);
    }
  };
  const width = 92 + (palette.length + 2) * (SWATCH + 4) + 12;
  const height = rows.length * (SWATCH + 10) + 12;
  return (
    <motion.div
      ref={ref}
      {...RISE}
      role="dialog"
      aria-label="Colour"
      tabIndex={-1}
      className="absolute z-50 rounded-md border border-gh-line bg-white px-2 py-1.5 shadow-lg text-sm text-gh-black outline-none"
      style={{ left: Math.max(0, Math.min(x, within.width - width - 8)), top: Math.max(0, Math.min(y, within.height - height - 8)), width }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {rows.map((row) => {
        const has = now(row);
        const ring = (c: string | null) => (has === c ? "ring-2 ring-offset-1 ring-gh-gray" : "");
        // (a light fill's row: the colours toward white; neither fill's own an other colour)
        const tints = palette.map((c) => tintOf(c, TINT));
        const swatches = row === "tint" ? tints : palette;
        const known = row === "fill" || row === "tint" ? [...palette, ...tints] : palette;
        const other = !!has && !known.includes(has) && row !== "tint";
        return (
          <div key={row} role="group" aria-label={ROW_NAME[row]} className="flex items-center gap-1 py-1">
            <span className="w-[88px] shrink-0 text-gh-gray">{ROW_NAME[row]}</span>
            <button
              aria-label="None"
              title="None"
              onClick={() => give(row, null)}
              className={`shrink-0 rounded-full border border-gh-line bg-white transition-shadow duration-150 ease-meno ${ring(null)}`}
              style={{ width: SWATCH, height: SWATCH, backgroundImage: "linear-gradient(135deg, transparent 46%, #c0c0c0 46%, #c0c0c0 54%, transparent 54%)" }}
            />
            {swatches.map((c) => (
              <button
                key={c}
                aria-label={c}
                title={c}
                onClick={() => give(row, c)}
                className={`shrink-0 rounded-full transition-shadow duration-150 ease-meno ${ring(c)}`}
                style={{ width: SWATCH, height: SWATCH, background: c }}
              />
            ))}
            {/* any other, by the system's own chooser */}
            {row !== "tint" && (
            <label
              title="Other colour"
              className={`relative shrink-0 rounded-full cursor-pointer overflow-hidden transition-shadow duration-150 ease-meno ${other ? "ring-2 ring-offset-1 ring-gh-gray" : ""}`}
              style={{ width: SWATCH, height: SWATCH, background: other ? has : "conic-gradient(#d55e00, #f0e442, #009e73, #56b4e9, #0072b2, #cc79a7, #d55e00)" }}
            >
              <input
                type="color"
                aria-label="Other colour"
                className="absolute inset-0 opacity-0 cursor-pointer"
                value={has || "#000000"}
                onChange={(e) => give(row, e.target.value.toLowerCase(), `${opened}:${row}`)}
              />
            </label>
            )}
          </div>
        );
      })}
    </motion.div>
  );
}
