import { describe, expect, it } from "vitest";
import {
  createSVG,
  fontStack,
  layoutMolecule,
  placeLabel,
  type Atom,
  type Bond,
} from "./layout2d";
import { acsWorldOptions } from "./acs";

const atoms: Atom[] = [
  { id: 1, x: 0, y: 0, el: "C" },
  { id: 2, x: 1.5, y: 0, el: "C" },
  { id: 3, x: 2.3, y: 1.3, el: "N" },
];
const bonds: Bond[] = [
  { a1: 0, a2: 1, order: 1, stereo: "up" },
  { a1: 1, a2: 2, order: 1, stereo: "none" },
];

const opts = (over = {}) =>
  acsWorldOptions(atoms, bonds, { units: "world", ...over });

const numbers = (svg: string, attr: string) =>
  [...svg.matchAll(new RegExp(`${attr}="([-\\d.e]+)"`, "g"))].map((m) =>
    Number(m[1]),
  );

describe("createSVG", () => {
  // the canvas converts the layout's pixel sizes with the zoom it drew at;
  // the SVG has to land on the same numbers or the two drift apart
  it("writes sizes in the coordinates the drawing is in", () => {
    const o = opts();
    const zoom = 60;
    const layout = layoutMolecule(atoms, bonds, o, zoom);
    const svg = createSVG(layout, o);
    const expected = layout.lines.map((l) => l.widthPx / zoom);
    expect(numbers(svg, "stroke-width").sort()).toEqual(
      [...new Set(expected)].sort(),
    );
    // and nothing is pinned to the screen, so it scales as one drawing
    expect(svg).not.toContain("non-scaling-stroke");
  });

  it("keeps a bond the same width in the drawing at any zoom", () => {
    // world sizes do not depend on the zoom, so neither may the SVG's; only
    // the padding does, being a margin in screen pixels
    const o = opts();
    for (const zoom of [30, 300]) {
      const svg = createSVG(layoutMolecule(atoms, bonds, o, zoom), o);
      expect(numbers(svg, "stroke-width")[0]).toBeCloseTo(o.lineWidthPx, 9);
    }
  });

  it("pads by the padding asked for, in pixels", () => {
    const o = opts();
    const zoom = 60;
    const layout = layoutMolecule(atoms, bonds, o, zoom);
    const box = /viewBox="([-\d.e ]+)"/
      .exec(createSVG(layout, o))![1]
      .split(" ")
      .map(Number);
    const pad = o.paddingPx / zoom;
    expect(box[0]).toBeCloseTo(layout.bounds.min.x - pad, 9);
    expect(box[2]).toBeCloseTo(
      layout.bounds.max.x - layout.bounds.min.x + pad * 2,
      9,
    );
  });

  it("says how big it was meant to be drawn", () => {
    const o = opts();
    const zoom = 60;
    const svg = createSVG(layoutMolecule(atoms, bonds, o, zoom), o);
    const box = /viewBox="([-\d.e ]+)"/.exec(svg)![1].split(" ").map(Number);
    expect(Number(/width="([\d.e]+)"/.exec(svg)![1])).toBeCloseTo(
      box[2] * zoom,
      6,
    );
  });

  it("names, after a typeface, the nearest most readers have - IBM Plex Sans, which Meno carries, Arial or Helvetica", () => {
    expect(fontStack("IBM Plex Sans")).toBe("'IBM Plex Sans', Arial, Helvetica, 'IBM Plex Sans JP', sans-serif");
    expect(fontStack("Arial")).toBe("Arial, Helvetica, 'IBM Plex Sans JP', sans-serif");
    expect(fontStack("Helvetica")).toBe("Helvetica, Arial, 'IBM Plex Sans JP', sans-serif");
    const o = opts({ fontFamily: "IBM Plex Sans", labelSet: { ...opts().labelSet, fontFamily: "IBM Plex Sans" } });
    const svg = createSVG(layoutMolecule(atoms, bonds, o, 60), o);
    expect(svg).toContain(`font-family="'IBM Plex Sans', Arial, Helvetica, 'IBM Plex Sans JP', sans-serif"`);
  });

  it("sets a label as the canvas does: in Arial, run by run, on its baseline", () => {
    const o = opts();
    const layout = layoutMolecule(atoms, bonds, o, 60);
    const svg = createSVG(layout, o);
    const label = layout.texts.find((t) => t.text.startsWith("N"))!;
    // the count is a subscript, so it is its own smaller piece
    expect(label.runs?.some((r) => r.sub)).toBe(true);
    const runs = placeLabel(label, o.fontPx);
    const texts = [
      ...svg.matchAll(
        /<text x="([-\d.e]+)" y="([-\d.e]+)" font-family="([^"]*)" font-size="([-\d.e]+)"[^>]*>([^<]*)</g,
      ),
    ];
    expect(texts.map((m) => m[5])).toEqual(runs.map((r) => r.text));
    texts.forEach((m, i) => {
      expect(Number(m[1])).toBeCloseTo(runs[i].x, 9);
      // SVG's y runs down
      expect(Number(m[2])).toBeCloseTo(-runs[i].y, 9);
      expect(m[3].startsWith("Arial")).toBe(true);
      expect(Number(m[4])).toBeCloseTo(runs[i].size, 9);
    });
  });
});

describe("the drawing's bounds", () => {
  it("take in what the bonds draw past their atoms, so an export does not clip it", () => {
    // a lone triple bond: its outer lines lie a spacing either side of the atoms
    const a: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 1.8, y: 0, el: "C" },
    ];
    const triple: Bond[] = [{ a1: 0, a2: 1, order: 3 }];
    const o = acsWorldOptions(a, triple, { units: "world", paddingPx: 0 });
    const layout = layoutMolecule(a, triple, o, 60);
    const outer = Math.max(...layout.lines.map((l) => Math.abs(l.y1)));
    expect(outer).toBeGreaterThan(0.3);
    const reach = outer + o.lineWidthPx / 2;
    expect(layout.bounds.max.y).toBeCloseTo(reach, 9);
    expect(layout.bounds.min.y).toBeCloseTo(-reach, 9);
    // and a wedge's broad end
    const wedge: Bond[] = [{ a1: 0, a2: 1, order: 1, stereo: "up" }];
    const w = layoutMolecule(a, wedge, o, 60);
    expect(w.bounds.max.y).toBeGreaterThanOrEqual(o.wedgeWidthPx / 2 - 1e-9);
  });
});
