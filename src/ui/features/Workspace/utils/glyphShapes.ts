/**
 * The shapes of the letters a label is written with, as the system's own
 * typefaces draw them - a sans serif, and a serif - to read letters a
 * figure draws as outlines against (lib/figure/glyphs). They are drawn
 * here, once, the first time they are wanted: no letter's shape is carried
 * in Meno.
 */
import { GRID, LETTERS, type GlyphShape } from "../../../../lib/figure/glyphs";

/** The typefaces figures are most often set in, as the system has them. */
const FAMILIES = ["Helvetica, Arial, sans-serif", "Times, 'Times New Roman', serif"];
/** How large each letter is drawn to be measured, in pixels. */
const SIZE = 96;

let had: GlyphShape[] | null = null;

/** A letter as it is drawn: a minus as a minus sign, not a hyphen. */
const drawnAs = (c: string) => (c === "-" ? "−" : c);

/** The letters' shapes, drawn the first time they are wanted; none where there is nothing to draw them on. */
export function systemGlyphs(): GlyphShape[] {
  if (had) return had;
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  const cx = canvas?.getContext("2d", { willReadFrequently: true });
  if (!canvas || !cx) return [];
  const side = SIZE * 2;
  canvas.width = side;
  canvas.height = side;
  const base = Math.round(SIZE * 1.3);
  const left = Math.round(SIZE * 0.4);
  /** A letter's ink: the box round it, in pixels, and how inked each pixel is. */
  const inkOf = (c: string) => {
    cx.clearRect(0, 0, side, side);
    cx.fillStyle = "#000";
    cx.textBaseline = "alphabetic";
    cx.fillText(drawnAs(c), left, base);
    const a = cx.getImageData(0, 0, side, side).data;
    let [x0, y0, x1, y1] = [side, side, -1, -1];
    for (let y = 0; y < side; y++)
      for (let x = 0; x < side; x++)
        if (a[(y * side + x) * 4 + 3] > 64) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
    return x1 < 0 ? null : { a, box: [x0, y0, x1 + 1, y1 + 1] as const };
  };
  const out: GlyphShape[] = [];
  for (const family of FAMILIES) {
    cx.font = `${SIZE}px ${family}`;
    const capital = inkOf("H");
    if (!capital) continue;
    const cap = capital.box[3] - capital.box[1];
    for (const c of LETTERS) {
      const got = inkOf(c);
      if (!got) continue;
      const [x0, y0, x1, y1] = got.box;
      const w = x1 - x0;
      const h = y1 - y0;
      // (the ink on the grid, each cell its pixels' mean)
      const ink = new Float32Array(GRID * GRID);
      for (let j = 0; j < GRID; j++) {
        for (let i = 0; i < GRID; i++) {
          const [ax, bx] = [x0 + Math.floor((i * w) / GRID), x0 + Math.max(Math.floor(((i + 1) * w) / GRID), Math.floor((i * w) / GRID) + 1)];
          const [ay, by] = [y0 + Math.floor((j * h) / GRID), y0 + Math.max(Math.floor(((j + 1) * h) / GRID), Math.floor((j * h) / GRID) + 1)];
          let sum = 0;
          for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) sum += got.a[(y * side + x) * 4 + 3] / 255;
          ink[j * GRID + i] = sum / ((bx - ax) * (by - ay));
        }
      }
      out.push({ c, ink, aspect: w / Math.max(h, 1), height: h / cap, drop: (y1 - base) / cap });
    }
  }
  had = out;
  return out;
}
