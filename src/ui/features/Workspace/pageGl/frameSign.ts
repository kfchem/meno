/**
 * A set's frame showing what letting go would do while the pointer is held
 * (workflow/setSigns; docs/WORKFLOWS.md, *A set holds its members*): one
 * that would take what is held in - its edge in Meno's colour and a wash of
 * it over its room - and one that would let a member go - its edge dashed
 * grey, no wash. Each as far as it has come (0 none, 1 whole), eased in and
 * out as a highlight is (docs/LOOK.md, *Motion*); its line and dashes in page
 * pixels, scaled with the page as the frame's own line is.
 */
import { COLORS } from "../../../theme/colors";
import type { Frame } from "../workflow/entries";
import type { Shape } from "./shapes";

/** How far each of a frame's signs has come, eased: 0 none, 1 whole. */
export type FrameSign = { takes: number; letsGo: number };

/** The signs' look: a taking frame's edge and wash, a letting frame's dashed edge - in page px. */
export const SIGN_LOOK = {
  takes: { color: COLORS.base, wash: 0.05, widthPx: 1 },
  letsGo: { color: COLORS.quiet, widthPx: 1, dashed: { onPx: 3, offPx: 3 } },
} as const;

/** How present a frame's own hairline is under its signs: given way to the dashed edge as it comes - the frame's edge is drawn dashed. */
export const lineUnder = (sign: FrameSign | undefined): number => 1 - Math.min(1, Math.max(0, sign?.letsGo ?? 0));

/** The shapes of a frame's signs over its own (`key` its frame's, `radiusPx` its corners, `opacity` its own), none where none has come. */
export function frameSignShapes(key: string, box: Frame, radiusPx: number, sign: FrameSign | undefined, opacity = 1): Shape[] {
  const shapes: Shape[] = [];
  if (!sign) return shapes;
  const { x0, y0, x1, y1 } = box;
  if (sign.takes > 0) {
    const t = SIGN_LOOK.takes;
    shapes.push({ kind: "box", key: `${key}:takes`, x0, y0, x1, y1, radiusPx, fill: t.color, fillAlpha: t.wash, line: { widthPx: t.widthPx, color: t.color }, opacity: opacity * sign.takes, z: 0 });
  }
  if (sign.letsGo > 0) {
    const g = SIGN_LOOK.letsGo;
    shapes.push({ kind: "box", key: `${key}:letsGo`, x0, y0, x1, y1, radiusPx, line: { widthPx: g.widthPx, color: g.color, dashed: g.dashed }, opacity: opacity * sign.letsGo, z: 0 });
  }
  return shapes;
}
