/**
 * What a reaction scheme's arrows and "+" signs take on the page, for a
 * fit to take them in where nothing else holds them: each arrow's ends and
 * the corners it turns at, half a label's letter round them for its head,
 * and each sign as wide and tall as a label's letter.
 */
import { arrowPoints } from "../../../../lib/chem/reactionScheme";

type Box = { x0: number; y0: number; x1: number; y1: number };

export function schemeExtent(arrows: readonly Parameters<typeof arrowPoints>[0][], pluses: readonly { x: number; y: number }[], fontSize: number): Box | null {
  const half = fontSize / 2;
  const pts = [...arrows.flatMap((a) => arrowPoints(a)), ...pluses];
  if (!pts.length) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs) - half, y0: Math.min(...ys) - half, x1: Math.max(...xs) + half, y1: Math.max(...ys) + half };
}
