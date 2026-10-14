/**
 * A figure of the round trip with its words drawn as outlines, as many
 * journals print a figure's labels: each letter a filled path of its own
 * ("letter"), or each word one path of all its letters ("word") - drawn
 * from the typeface the letter was set in, as this Mac has it (Times New
 * Roman for a serif, IBM Plex Sans for Meno's own, Arial for the rest),
 * at its size, on its baseline, turned as its line is. The letters
 * themselves are taken away, as such a PDF has none.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, type Font } from "opentype.js/dist/opentype.mjs";
import type { FigureDrawn, FigureLetter, FigurePath, PathStep } from "../../../src/lib/figure/drawn";
import type { GlyphShape } from "../../../src/lib/figure/glyphs";

export type Outlined = "letter" | "word";

const FACES: [RegExp, string][] = [
  [/times|serif/i, "/System/Library/Fonts/Supplemental/Times New Roman.ttf"],
  [/plex/i, resolve(process.cwd(), "src/assets/fonts/IBMPlexSans-Regular.ttf")],
  [/./, "/System/Library/Fonts/Supplemental/Arial.ttf"],
];
const faces = new Map<string, Font>();

function faceOf(font: string | undefined): Font {
  const file = FACES.find(([re]) => re.test(font ?? ""))![1];
  let f = faces.get(file);
  if (!f) {
    const bytes = readFileSync(file);
    f = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    faces.set(file, f);
  }
  return f;
}

/** A letter's outline as steps: its curves as points along them, each a "C" step, as Meno's PDF reader gives a curve. */
function outlineOf(l: FigureLetter): PathStep[] {
  if (!l.at || !l.c.trim()) return [];
  const path = faceOf(l.font).charToGlyph(l.c).getPath(0, 0, l.size);
  const t = l.dir ?? 0;
  const [cos, sin] = [Math.cos(t), Math.sin(t)];
  const at = (x: number, y: number): [number, number] => [l.at![0] + x * cos - y * sin, l.at![1] + x * sin + y * cos];
  const out: PathStep[] = [];
  let [px, py] = [0, 0];
  for (const c of path.commands) {
    if (c.type === "M" || c.type === "L") {
      out.push([c.type, ...at(c.x, c.y)]);
      [px, py] = [c.x, c.y];
    } else if (c.type === "Q" || c.type === "C") {
      const n = c.type === "Q" ? 6 : 8;
      for (let k = 1; k <= n; k++) {
        const s = k / n;
        const u = 1 - s;
        const [x, y] =
          c.type === "Q"
            ? [u * u * px + 2 * u * s * c.x1 + s * s * c.x, u * u * py + 2 * u * s * c.y1 + s * s * c.y]
            : [u * u * u * px + 3 * u * u * s * c.x1 + 3 * u * s * s * c.x2 + s * s * s * c.x, u * u * u * py + 3 * u * u * s * c.y1 + 3 * u * s * s * c.y2 + s * s * s * c.y];
        out.push(["C", ...at(x, y)]);
      }
      [px, py] = [c.x, c.y];
    } else if (c.type === "Z") out.push(["Z"]);
  }
  return out;
}

/**
 * The words of a figure's letters, as they were set: each letter after
 * the one before it on its line - no further on than a letter and a half,
 * not more than half its size above or below it (a subscript's 2 is its
 * word's), turned the same way.
 */
function wordsOf(letters: readonly FigureLetter[]): FigureLetter[][] {
  const words: FigureLetter[][] = [];
  for (const l of letters) {
    const word = words[words.length - 1];
    const last = word?.[word.length - 1];
    if (last && last.at && l.at && (last.dir ?? 0) === (l.dir ?? 0)) {
      const t = last.dir ?? 0;
      const [dx, dy] = [l.at[0] - last.at[0], l.at[1] - last.at[1]];
      const along = dx * Math.cos(t) + dy * Math.sin(t);
      const across = -dx * Math.sin(t) + dy * Math.cos(t);
      const size = Math.max(last.size, l.size);
      if (along > 0 && along < 1.5 * size && Math.abs(across) < 0.5 * size) {
        word.push(l);
        continue;
      }
    }
    words.push([l]);
  }
  return words;
}

/** The figure with its letters drawn as outlines: a path for each letter, or for each word. */
export function outlined(drawn: FigureDrawn, as: Outlined): FigureDrawn {
  const groups = as === "letter" ? drawn.letters.map((l) => [l]) : wordsOf(drawn.letters);
  const paths: FigurePath[] = groups.map((g) => ({ fill: "#000000ff", stroke: null, width: 0, d: g.flatMap(outlineOf) })).filter((p) => p.d.length);
  return { ...drawn, paths: [...drawn.paths, ...paths], letters: [] };
}

/** The system's letters to read outlines against, as glyphs.swift measured them (known.json in the round trip's folder). */
export function knownLetters(file: string): GlyphShape[] {
  const shapes = JSON.parse(readFileSync(file, "utf8")) as (Omit<GlyphShape, "ink"> & { ink: number[] })[];
  return shapes.map((g) => ({ c: g.c, ink: Float32Array.from(g.ink), aspect: g.aspect, height: g.height, drop: g.drop }));
}
