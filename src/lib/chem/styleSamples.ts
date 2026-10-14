import { createSVG, layoutMolecule, xmlAttr, type Atom, type Bond } from "./layout2d";
import { layoutOptionsFor, type DrawingStyle } from "./style";
import { arrowMeasures, arrowOutline } from "./reactionArrow";

/**
 * What the drawing-style settings show a style on: a small molecule with
 * labels, a ring and a wedge, and each kind of bond on its own - drawn by the
 * same layout as the canvas and the export, so what the settings show is
 * what a structure will look like.
 */

export type StyleSample = {
  name: string;
  atoms: Atom[];
  bonds: Bond[];
  /** Rings drawn with a circle rather than alternating double bonds. */
  aromaticCircle?: boolean;
};

const S = Math.sqrt(3) / 2;

/**
 * 4-Chlorophenylalanine: labels with and without hydrogens, a subscript, a
 * two-letter symbol, a ring's double bonds, a double bond to a label and a
 * wedge. One bond long.
 */
export const SAMPLE_MOLECULE: StyleSample = {
  name: "4-Chlorophenylalanine",
  atoms: [
    // the ring, pointing up
    { id: 1, x: 0, y: 1, el: "C" },
    { id: 2, x: -S, y: 0.5, el: "C" },
    { id: 3, x: -S, y: -0.5, el: "C" },
    { id: 4, x: 0, y: -1, el: "C" },
    { id: 5, x: S, y: -0.5, el: "C" },
    { id: 6, x: S, y: 0.5, el: "C" },
    // the chain, zigzag to the right
    { id: 7, x: 2 * S, y: 1, el: "C" },
    { id: 8, x: 3 * S, y: 0.5, el: "C" },
    { id: 9, x: 4 * S, y: 1, el: "C" },
    { id: 10, x: 4 * S, y: 2, el: "O" },
    { id: 11, x: 5 * S, y: 0.5, el: "O" },
    { id: 12, x: 3 * S, y: -0.5, el: "N" },
    // para to the chain
    { id: 13, x: -2 * S, y: -1, el: "Cl" },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 2 },
    { a1: 1, a2: 2, order: 1 },
    { a1: 2, a2: 3, order: 2 },
    { a1: 3, a2: 4, order: 1 },
    { a1: 4, a2: 5, order: 2 },
    { a1: 5, a2: 0, order: 1 },
    { a1: 5, a2: 6, order: 1 },
    { a1: 6, a2: 7, order: 1 },
    { a1: 7, a2: 8, order: 1 },
    { a1: 8, a2: 9, order: 2 },
    { a1: 8, a2: 10, order: 1 },
    { a1: 7, a2: 11, order: 1, stereo: "up" },
    { a1: 2, a2: 12, order: 1 },
  ],
};

const pair = (name: string, bond: Omit<Bond, "a1" | "a2">): StyleSample => ({
  name,
  atoms: [
    { id: 1, x: 0, y: 0, el: "C" },
    { id: 2, x: 1, y: 0, el: "C" },
  ],
  bonds: [{ a1: 0, a2: 1, ...bond }],
});

/** Each kind of bond on its own, and an aromatic ring. */
export const SAMPLE_BONDS: StyleSample[] = [
  pair("Single", { order: 1 }),
  pair("Double", { order: 2 }),
  pair("Triple", { order: 3 }),
  pair("Wedge", { order: 1, stereo: "up" }),
  pair("Hashed wedge", { order: 1, stereo: "down" }),
  pair("Wavy", { order: 1, stereo: "wavy" }),
  pair("Bold", { order: 1, display: "bold" }),
  pair("Hashed", { order: 1, display: "hashed" }),
  pair("Dashed", { order: 1, display: "dashed" }),
  pair("Dative", { order: 1, dative: true }),
  {
    name: "Aromatic ring",
    atoms: Array.from({ length: 6 }, (_, i) => {
      const a = Math.PI / 2 + (i * Math.PI) / 3;
      return { id: i + 1, x: Math.cos(a), y: Math.sin(a), el: "C" };
    }),
    bonds: Array.from({ length: 6 }, (_, i) => ({
      a1: i,
      a2: (i + 1) % 6,
      order: (i % 2 === 0 ? 2 : 1) as 1 | 2,
    })),
    aromaticCircle: true,
  },
];

/** CSS pixels to the point. */
const PX_PER_PT = 96 / 72;

/**
 * A sample as SVG in `style`, `magnification` times the size it would have
 * on the page.
 */
export function sampleSvg(
  sample: StyleSample,
  style: DrawingStyle,
  magnification = 1,
): string {
  const opts = layoutOptionsFor(style, 1, {
    aromaticCircle: sample.aromaticCircle ?? false,
    minLinePx: 0,
    paddingPx: 6,
  });
  const pxPerBond = style.bondLengthPt * PX_PER_PT * magnification;
  const layout = layoutMolecule(sample.atoms, sample.bonds, opts, pxPerBond);
  return createSVG(layout, opts);
}

/**
 * A reaction arrow two bonds long as SVG in `style`, `magnification` times
 * the size it would have on the page.
 */
export function arrowSampleSvg(style: DrawingStyle, magnification = 1): string {
  const L = style.bondLengthPt * PX_PER_PT * magnification;
  const m = arrowMeasures(style, L);
  const len = 2 * L;
  const pad = 6;
  const t = m.thickness / 2;
  const half = Math.max(m.headWidth / 2, t);
  const outline = arrowOutline({ x: 0, y: 0 }, { x: len, y: 0 }, m);
  const n = (v: number) => +v.toFixed(3);
  const d =
    outline.map((p, i) => `${i ? "L" : "M"} ${n(p.x)} ${n(-p.y)}`).join(" ") + " Z";
  const x = n(-t - pad);
  const y = n(-half - pad);
  const w = n(len + t + 2 * pad);
  const h = n(2 * (half + pad));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}">` +
    `<path d="${d}" fill="${xmlAttr(style.bondColor)}"/></svg>`
  );
}
