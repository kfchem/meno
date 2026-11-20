import { describe, expect, it } from "vitest";
import { figureRead, type FigureJob } from "./structuresRead";
import type { Box } from "../../../../lib/figure/drawn";

type Pt = [number, number];
/** A picture `side` square of a hexagon of bonds `bond` long round its middle, lines `w` wide, black on white (sixteen samples a pixel). */
function ringPicture(side: number, bond: number, w: number): { width: number; height: number; data: ArrayBuffer } {
  const c = side / 2;
  const h = Array.from({ length: 6 }, (_, k) => [c + bond * Math.sin((k * Math.PI) / 3), c - bond * Math.cos((k * Math.PI) / 3)] as Pt);
  const lines = h.map((p, k) => [p, h[(k + 1) % 6]] as [Pt, Pt]);
  const data = new Uint8ClampedArray(side * side * 4);
  const on = (x: number, y: number) =>
    lines.some(([p, q]) => {
      const d = [q[0] - p[0], q[1] - p[1]];
      const t = Math.min(Math.max(((x - p[0]) * d[0] + (y - p[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1]), 0), 1);
      return Math.hypot(x - (p[0] + t * d[0]), y - (p[1] + t * d[1])) <= w / 2;
    });
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      let n = 0;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (on(x + (i + 0.5) / 4, y + (j + 0.5) / 4)) n++;
      const v = Math.round(255 * (1 - n / 16));
      data.set([v, v, v, 255], 4 * (y * side + x));
    }
  return { width: side, height: side, data: data.buffer };
}

// (a figure of a page that is a picture alone: 48 points square at 100, 100 - 200 pixels at 300 dpi - stored at 300 dpi)
const box: Box = [100, 100, 148, 148];
const job = (picture?: FigureJob["picture"]): FigureJob => ({
  objects: [],
  text: null,
  figures: [box],
  k: 0,
  drawn: { paths: [], letters: [], pictures: [box], pixels: [[200, 200]] },
  sha256: "f".repeat(64),
  page: 0,
  ...(picture ? { picture } : {}),
});

describe("a figure of a PDF that is a picture, read ahead for the lens", () => {
  it("gives no structure from its lines, and asks to be drawn as finely as its picture is stored", () => {
    const read = figureRead(job());
    expect(read.structures).toEqual([]);
    expect(read.picture?.dpi).toBeCloseTo(300, 6);
  });

  it("drawn, is traced and read: its structure tied to where it lies on the page", { timeout: 30_000 }, () => {
    const read = figureRead(job({ ...ringPicture(200, 60, 2.5), at: { scale: 72 / 300, x: 100, y: 100 }, known: [] }));
    expect(read.picture).toBeUndefined();
    expect(read.structures).toHaveLength(1);
    const st = read.structures[0];
    expect("model" in st.read).toBe(true);
    if (!("model" in st.read)) return;
    expect(st.read.model.atoms).toHaveLength(6);
    expect(st.read.model.bonds).toHaveLength(6);
    // (on the page, within the picture's box)
    for (const a of st.atoms) expect(a.x > 100 && a.x < 148 && a.y > 100 && a.y < 148).toBe(true);
  });
});
