/**
 * A workflow's small marks on the page, as WebGL draws them (docs/WORKSPACE.md,
 * *Drawn by WebGL*), as their HTML drew them: an Enumerate step's position
 * numbered in a small round badge; a structure's number among those a step
 * numbered, under it, how it was made said in the page's tip as it is
 * pointed at.
 */
import { COLORS } from "../../../theme/colors";
import type { Region } from "./hits";
import type { Shape } from "./shapes";
import { textWidth, type PageText } from "./texts";
import { pagePx } from "./units";

/** A position's number in its badge, its middle at `x`, `y`: 16 page px high, at least as wide, white with Meno's colour's line and words. */
export function positionBadge(key: string, x: number, y: number, n: number, z = 0): { shape: Shape; text: PageText } {
  const w = Math.max(16, textWidth(String(n), 10) + 8);
  return {
    shape: { kind: "box", key, x0: x - pagePx(w / 2), x1: x + pagePx(w / 2), y0: y - pagePx(8), y1: y + pagePx(8), radiusPx: 8, fill: COLORS.background, line: { widthPx: 1, color: COLORS.base }, z },
    text: { key: `${key}:n`, x, y, anchor: "middle", baseline: "middle", text: String(n), sizePx: 10, color: COLORS.base, z: z + 1 },
  };
}

/** A structure's number ("#3"), its top middle at `x`, `y`, quiet; the place it takes the pointer, for its tip, where it says more. */
export function recordLabel(key: string, x: number, y: number, label: string, tip: boolean, z = 0): { text: PageText; region: Region | null } {
  const w = textWidth(label, 10) + 8;
  const rect = { x0: x - pagePx(w / 2), x1: x + pagePx(w / 2), y0: y - pagePx(16), y1: y };
  return {
    text: { key, x, y: y - pagePx(8), anchor: "middle", baseline: "middle", text: label, sizePx: 10, color: COLORS.quiet, z },
    region: tip ? { key, part: "record", rect, z } : null,
  };
}
