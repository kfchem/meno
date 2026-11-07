/**
 * A molecule's frames chip, shut, as WebGL draws it (part of the page's
 * WebGL, docs/WORKSPACE.md, *Drawn by WebGL*): the same box and words its
 * HTML has (components/Frames3D `FramesChip`), so that one is not told from
 * the other as the pointer comes onto it and its HTML takes its place.
 */
import { COLORS } from "../../../theme/colors";
import type { SaidRun } from "../utils/chipSaid";
import { FRAMES_CHIP_GAP } from "../utils/molecule3d";
import type { Drawn } from "./PagePlaced";
import { fitted, textWidth, type PageText } from "./texts";
import { pagePx } from "./units";

/** Its words' size and line, its room either side and above and below them, its corners and line, and its shadow - FramesChip's, in page px. */
export const CHIP = { size: 11, line: 18, side: 10, pad: 4, border: 1, radius: 16, shadow: { blurPx: 2, offsetYPx: 1, alpha: 0.05 } } as const;
/** How tall it is, shut, in page px: its line, its padding and its line round it. */
export const CHIP_HEIGHT = CHIP.line + 2 * CHIP.pad + 2 * CHIP.border;
/** How opaque it is shut, letting the page show through a little, and its fill: FramesChip's shut chip. */
export const CHIP_SHUT = { opacity: 0.75, fill: 0.85 } as const;

/** Where its baseline stands below the top of its line, as Plex sets 11 px in an 18 px line: half the room the letters leave, then their ascent. */
const BASELINE = (CHIP.line - 1.3 * CHIP.size) / 2 + 1.025 * CHIP.size;

const TONE: Record<SaidRun["tone"], string> = { quiet: COLORS.quiet, ink: COLORS.ink, attention: COLORS.attention };

/** Its runs as they are drawn - each cut to its most, after its room - and how wide they come to, in page px. */
export function chipLine(runs: readonly SaidRun[]): { runs: { text: string; tone: SaidRun["tone"]; from: number }[]; width: number } {
  let x = 0;
  const out = runs.map((r) => {
    x += r.gapPx ?? 0;
    const text = fitted(r.text, CHIP.size, 400, r.mostPx);
    const from = x;
    x += textWidth(text, CHIP.size);
    return { text, tone: r.tone, from };
  });
  return { runs: out, width: x };
}

/**
 * The chip `key` saying `runs`, hung from `at` - its molecule's lowest point,
 * as the chip's HTML is - `FRAMES_CHIP_GAP` page px below it, its middle under
 * it; the place it takes the pointer, its box.
 */
export function shutChip(key: string, runs: readonly SaidRun[], at: { x: number; y: number }): Drawn {
  const line = chipLine(runs);
  // (as wide as what it says and its room either side, its line within that - CSS's border-box, as FramesChip's)
  const w = pagePx(line.width + 2 * CHIP.side);
  const h = pagePx(CHIP.line + 2 * CHIP.pad + 2 * CHIP.border);
  const top = at.y - pagePx(FRAMES_CHIP_GAP);
  const x0 = at.x - w / 2;
  const box = { x0, y0: top - h, x1: x0 + w, y1: top };
  const baseline = top - pagePx(CHIP.border + CHIP.pad + BASELINE);
  const left = x0 + pagePx(CHIP.side);
  const texts: PageText[] = line.runs.map((r, i) => ({ key: `${key}:${i}`, x: left + pagePx(r.from), y: baseline, anchor: "start", text: r.text, sizePx: CHIP.size, color: TONE[r.tone], opacity: CHIP_SHUT.opacity, z: 1 }));
  return {
    shapes: [{ kind: "box", key, ...box, radiusPx: CHIP.radius, fill: COLORS.background, fillAlpha: CHIP_SHUT.fill, line: { widthPx: CHIP.border, color: COLORS.hairline }, shadow: CHIP.shadow, opacity: CHIP_SHUT.opacity }],
    texts,
    regions: [{ key, part: "chip", rect: box }],
  };
}
