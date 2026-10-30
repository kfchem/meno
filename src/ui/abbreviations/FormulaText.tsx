import { labelRuns } from "../../lib/chem/abbreviations";
import { SUB_DROP, SUB_SCALE, SUP_RISE } from "../../lib/chem/layout2d";

/**
 * A label or a formula set in a line of text as the drawing sets it: its
 * counts below the line (the 6 and 15 of C6H15OSi) and a charge above it,
 * at the drawing's size, drop and rise for them - not a font's own
 * subscript digits, which some fonts lack - a descriptor's R and S and a t-
 * in italics.
 */
export function FormulaText({ text }: { text: string }) {
  return (
    <>
      {labelRuns(text).map((r, i) =>
        r.sub || r.sup ? (
          <span key={i} style={{ fontSize: `${SUB_SCALE}em`, position: "relative", top: `${r.sub ? SUB_DROP / SUB_SCALE : -SUP_RISE / SUB_SCALE}em`, lineHeight: 0 }}>
            {r.text}
          </span>
        ) : r.italic ? (
          <i key={i}>{r.text}</i>
        ) : (
          <span key={i}>{r.text}</span>
        ),
      )}
    </>
  );
}
