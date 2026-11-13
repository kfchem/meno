/** Where a text's body lies on the page, for its flight to the column and back (PdfColumn). */
import { drawnSheetBox } from "./textSheets";
import { lookOf, poseOf, seenBounds, solidOf } from "./molecule3d";
import { style3dOf } from "../style3d";
import { cardFrameOf } from "../workflow/place";
import type { EditorState, WorkspaceText } from "../store/types";

/**
 * Where a text's body lies on the page: its sheet - or, what it is the text
 * of (`of`): a step's log, its step's card; an output shown from a
 * molecule, that molecule as it is seen; none, a text with none of them, or
 * whose body has gone.
 */
export function bodyBoxOf(st: EditorState, t: WorkspaceText): { x0: number; x1: number; y0: number; y1: number } | null {
  if (t.at) return drawnSheetBox(t);
  const of = t.of;
  if (!of) return null;
  if ("step" in of) {
    const s = st.steps.find((x) => x.id === of.step);
    return s ? cardFrameOf(s) : null;
  }
  const m = st.molecules3d.find((x) => x.id === of.molecule);
  if (!m) return null;
  const style = style3dOf(st);
  const b = seenBounds(poseOf(m, solidOf(m, style), lookOf(m), st.turns3d[m.id], st.frames3d[m.id]));
  return { x0: b.minX, x1: b.maxX, y0: b.minY, y1: b.maxY };
}
