/**
 * A molecule's frames chip as WebGL draws it (docs/WORKSPACE.md, *Drawn by
 * WebGL*): its box and its line of words, in the sizes its HTML had - the
 * rest of it, opened, in `liveChip`.
 */
import type { SaidRun } from "../utils/chipSaid";
import { fitted, textWidth } from "./texts";

/** Its words' size and line, its room either side and above and below them, its corners and line, and its shadow - its HTML's, in page px. */
export const CHIP = { size: 11, line: 18, side: 10, pad: 4, border: 1, radius: 16, shadow: { blurPx: 2, offsetYPx: 1, alpha: 0.05 } } as const;
/** How opaque it is shut, letting the page show through a little, and its fill: as its HTML was shut. */
export const CHIP_SHUT = { opacity: 0.75, fill: 0.85 } as const;

/**
 * The chip's look as CSS says it, for what stands under it in HTML - Make
 * again, Edited from - so that every chip is one style: its room, line, words,
 * hairline, fill, shadow and rest opacity as above, full once pointed at
 * (`CHIP`, `CHIP_SHUT`; chips.test pins them to each other, and its shadow
 * - `meno-chip-shadow` in App.css - to `CHIP.shadow`).
 */
export const CHIP_HTML =
  "w-max whitespace-nowrap rounded-full border border-gh-line bg-white/85 px-[9px] py-[4px] text-[11px] leading-[18px] text-gh-gray opacity-75 meno-chip-shadow transition-opacity duration-150 ease-meno hover:opacity-100";

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
