/**
 * A workflow's small marks on the page, as WebGL draws them (docs/WORKSPACE.md,
 * *Drawn by WebGL*), as their HTML drew them: a box round what has just
 * joined a set - Meno's colour, a wash of it - or left it - dashed grey - a
 * moment, fading in and out (`memberPulse`); an Enumerate step's position
 * numbered in a small round badge; a structure's number among those a step
 * numbered, under it, how it was made said in the page's tip as it is
 * pointed at.
 */
import { COLORS } from "../../../theme/colors";
import { eased, EASE } from "../../../theme/motion";
import type { Frame } from "../workflow/entries";
import type { Region } from "./hits";
import type { Shape } from "./shapes";
import { textWidth, type PageText } from "./texts";
import { pagePx } from "./units";

/** A member mark's whole time, in ms, and the share of it it takes to come in (App.css `meno-member-mark`: 0, 1 at 30 %, 0). */
export const MEMBER_MS = 700;
const IN = 0.3;

/** How present a member mark is `ms` after it came: in to whole over its first 30 %, out again over the rest, on Meno's curve. */
export function memberPulse(ms: number): number {
  const t = Math.min(1, Math.max(0, ms / MEMBER_MS));
  return t < IN ? eased(EASE, t / IN) : 1 - eased(EASE, (t - IN) / (1 - IN));
}

/** A box round what joined a set (Meno's colour, a wash of it) or left it (dashed grey): rounded 8 page px, its line 1. */
export function memberMarkBox(key: string, frame: Frame, joined: boolean, opacity: number, z = 0): Shape {
  return joined
    ? { kind: "box", key, ...frame, radiusPx: 8, fill: COLORS.base, fillAlpha: 0.05, line: { widthPx: 1, color: COLORS.base }, opacity, z }
    : { kind: "box", key, ...frame, radiusPx: 8, line: { widthPx: 1, color: COLORS.quiet, dashed: { onPx: 3, offPx: 3 } }, opacity, z };
}

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
