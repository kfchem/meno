import { besidesBoxes, type Box } from "./extent";
import type { EditorState } from "../store/types";
import type { DrawingStyle } from "../../../../lib/chem/style";

type Pt = { x: number; y: number };

/**
 * Where what a file brings goes, opened onto a page near `at` - the middle
 * of the view: at `at` itself where it is clear of all there is there
 * (`there`, each thing's box), else at the nearest point about `at`, of a
 * grid `step` apart, where it is - its own box (`foot`, about the point it
 * is put at) kept `gap` from each of theirs. Of points as near, the one to
 * the right comes first, then below. At `at`, where nothing within `reach`
 * steps of it is clear.
 */
export function freePlace(there: readonly Box[], foot: Box, at: Pt, step: number, gap = step, reach = 24): Pt {
  const clear = (c: Pt) => {
    const x0 = c.x + foot.x0 - gap;
    const x1 = c.x + foot.x1 + gap;
    const y0 = c.y + foot.y0 - gap;
    const y1 = c.y + foot.y1 + gap;
    return there.every((b) => b.x1 <= x0 || b.x0 >= x1 || b.y1 <= y0 || b.y0 >= y1);
  };
  if (clear(at)) return at;
  const points: [number, number][] = [];
  for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) if (i || j) points.push([i, j]);
  // (nearest first; of those as near, to the right, then below - the y axis up)
  points.sort((p, q) => p[0] * p[0] + p[1] * p[1] - (q[0] * q[0] + q[1] * q[1]) || q[0] - p[0] || p[1] - q[1]);
  for (const [i, j] of points) {
    const c = { x: at.x + i * step, y: at.y + j * step };
    if (clear(c)) return c;
  }
  return at;
}

const NONE = new Set<number>();

/** Boxes round all there is on the page, selected or not, each as it is drawn (./extent). */
export function pageBoxes(st: EditorState, style: DrawingStyle): Box[] {
  return besidesBoxes(
    { ...st, sel: { atoms: NONE, bonds: NONE }, sel3d: NONE, selCaptions: NONE, selArrows: NONE, selPluses: NONE, selPictures: NONE, selPdfs: NONE, selTexts: NONE, selSlides: NONE, selShapes: NONE, selInks: NONE },
    style,
  );
}
