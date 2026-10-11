/**
 * Markdown's type, as the column draws it (docs/PDF.md, *Markdown*): the
 * fonts a part is set in, for the canvas, and how wide words are in them,
 * measured as they are drawn - kept, a word measured once.
 */
import { useEffect, useSyncExternalStore } from "react";
import type { Font, Measure } from "./markdownLayout";

const SANS = '"IBM Plex Sans", "IBM Plex Sans JP", ui-sans-serif, system-ui, sans-serif';
const MONO = '"IBM Plex Mono", "IBM Plex Sans JP", ui-monospace, monospace';

/** A font as the canvas takes it. */
export const fontCss = (f: Font) => `${f.italic ? "italic " : ""}${f.weight} ${f.px}px ${f.mono ? MONO : SANS}`;

let ctx: CanvasRenderingContext2D | null = null;
const widths = new Map<string, number>();
const MOST_WIDTHS = 20000;

/** How wide words are, measured in the canvas's type - or, with no page to measure on, near enough. */
export const measureText: Measure = (text, font) => {
  if (!text) return 0;
  const key = `${fontCss(font)}\u0000${text}`;
  let w = widths.get(key);
  if (w != null) return w;
  if (typeof document === "undefined") w = Array.from(text).reduce((a, ch) => a + (/[\u3000-\u9fff]/.test(ch) ? font.px : font.px * 0.55), 0);
  else {
    ctx ??= document.createElement("canvas").getContext("2d")!;
    ctx.font = fontCss(font);
    w = ctx.measureText(text).width;
  }
  if (widths.size > MOST_WIDTHS) widths.clear();
  widths.set(key, w);
  return w;
};

let ready: Promise<void> | null = null;
let version = 0;
const told = new Set<() => void>();

/** The type ready to measure with, once its files have come - Japanese too: what was measured before, measured again, and those laid out by it told. */
export function markdownTypeReady(): Promise<void> {
  return (ready ??= (async () => {
    try {
      await Promise.all(
        (
          [
            { px: 15, weight: 400, italic: false, mono: false },
            { px: 15, weight: 600, italic: false, mono: false },
            { px: 15, weight: 400, italic: true, mono: false },
            { px: 15, weight: 600, italic: true, mono: false },
            { px: 13, weight: 400, italic: false, mono: true },
          ] as Font[]
        ).map((f) => document.fonts.load(fontCss(f), "Ag\u3042")),
      );
    } catch {
      // (measured in the system's own until then)
    }
    widths.clear();
    version++;
    for (const f of told) f();
  })());
}

/** How many times the type has come and been measured again: what is laid out by it, laid out again as it changes. */
export const typeVersion = () => version;

/** The type's version, as it changes - asking for the type to come. */
export function useMarkdownType(): number {
  useEffect(() => void markdownTypeReady(), []);
  return useSyncExternalStore(
    (f) => {
      told.add(f);
      return () => told.delete(f);
    },
    () => version,
  );
}

/** How much wider a part is in its own face than in the regular one the page's type draws it in, slanted or thickened: what it is stretched by there. */
export function faceStretch(text: string, font: Font): number {
  if (font.weight === 400 && !font.italic) return 1;
  const regular = measureText(text, { ...font, weight: 400, italic: false });
  return regular > 0 ? measureText(text, font) / regular : 1;
}
