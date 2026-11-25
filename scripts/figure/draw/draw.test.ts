import { describe, expect, it } from "vitest";
import { STYLE_PRESETS } from "../../../src/lib/chem/style";
import { captionSet } from "../../../src/lib/chem/captions";
import { drawFigures, FigureError, type FigureSpec, type Manifest } from "./figures";
import { chain, mol, reaction, U_SHAPE } from "./fixtures";

// Every answer below is worked by hand from the fixtures' coordinates and the style's bond length (the world's 1.8, ./README.md),
// never taken from what the script drew. The SVG is read as text: its lines, its texts and its filled paths. Its y runs down, the
// structure's (the file's) up.

const files: Record<string, string> = {
  "a.mol": chain("a", 3),
  "b.mol": chain("b", 4),
  "wide.mol": chain("wide", 3, 0.9),
  "u.mol": U_SHAPE,
  "o.mol": mol("o", [["C", 0, 0], ["C", 1.5, 0], ["O", 1.5, -1.5]], [[1, 2], [2, 3]]),
  "pair.sdf": `${chain("first", 3)}$$$$\n${chain("second", 4)}$$$$\n`,
  "r.rxn": reaction(),
};
const read = (path: string) => {
  if (!(path in files)) throw new Error("no such file");
  return files[path];
};
const draw = async (figure: Omit<FigureSpec, "name"> & { name?: string }, more: Partial<Manifest> = {}) =>
  (await drawFigures({ ...more, figures: [{ name: "f", ...figure }] }, read))[0];

type Seg = { x1: number; y1: number; x2: number; y2: number };
const segments = (svg: string): Seg[] =>
  [...svg.matchAll(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g)].map((m) => ({ x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4] }));
const texts = (svg: string) => [...svg.matchAll(/<text x="([^"]+)" y="([^"]+)"[^>]*>([^<]*)<\/text>/g)].map((m) => ({ x: +m[1], y: +m[2], text: m[3] }));
const filled = (svg: string, color: string) => [...svg.matchAll(/<path d="([^"]+)" fill="([^"]+)"/g)].filter((m) => m[2] === color).map((m) => m[1]);
const box = (segs: Seg[]) => {
  const xs = segs.flatMap((s) => [s.x1, s.x2]);
  const ys = segs.flatMap((s) => [s.y1, s.y2]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};
const length = (s: Seg) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
const mid = (b: ReturnType<typeof box>) => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });

describe("a caption", () => {
  it("stands under its structure, centred on it", async () => {
    // a (three carbons: two bonds) then b (four: three bonds), drawn in that order: the first two lines are a's.
    const { svg } = await draw({ items: [{ file: "a.mol", id: "1a" }, { file: "b.mol", id: "1b" }] });
    const segs = segments(svg);
    expect(segs).toHaveLength(5);
    const fontPx = 1.25; // the style's label size in the SVG's units (the font-size of its texts)
    for (const [id, own] of [["1a", segs.slice(0, 2)], ["1b", segs.slice(2)]] as const) {
      const t = texts(svg).filter((x) => x.text === id);
      expect(t).toHaveLength(1);
      expect(svg).toContain(`font-size="${fontPx}"`);
      // the text is anchored at its start: its middle is that and half its width (Meno's own measure of it, as the picture is set by)
      const middle = t[0].x + captionSet(id, 0, 0, fontPx).halfW;
      // Under the structure: below its lowest line (y runs down). A chain's lines carry no label, so their ends are its extent, and
      // Meno centres on its drawn extent, which differs from that by the round line caps (0.0375 each side, equal): tolerance 0.05,
      // a thirty-sixth of a bond.
      expect(Math.abs(middle - mid(box(own)).x)).toBeLessThan(0.05);
      expect(t[0].y).toBeGreaterThan(box(own).y1);
    }
  });
  it("has a second line under the first where a value is given", async () => {
    const { svg } = await draw({ items: [{ file: "a.mol", id: "1a", value: "85 %" }] });
    const [first, second] = [texts(svg).find((t) => t.text === "1a")!, texts(svg).find((t) => t.text === "85 %")!];
    expect(second.y).toBeGreaterThan(first.y);
  });
});

describe("a grid", () => {
  it("of five in three columns stands in two rows, the second row starting under the first column", async () => {
    const { svg } = await draw({ columns: 3, items: ["1a", "1b", "1c", "1d", "1e"].map((id) => ({ file: "a.mol", id })) });
    const segs = segments(svg);
    expect(segs).toHaveLength(10); // two bonds each
    const boxes = [0, 1, 2, 3, 4].map((i) => box(segs.slice(2 * i, 2 * i + 2)));
    const m = boxes.map(mid);
    const near = (p: number, q: number) => Math.abs(p - q) < 0.05; // as for a caption: the caps' 0.0375
    // rows: items 1-3 on one level, 4-5 on a lower one (y runs down)
    expect([near(m[0].y, m[1].y), near(m[1].y, m[2].y), near(m[3].y, m[4].y)]).toEqual([true, true, true]);
    expect(m[3].y).toBeGreaterThan(m[0].y + 1.8);
    // columns: 4 under 1, 5 under 2, each column to the right of the one before
    expect([near(m[0].x, m[3].x), near(m[1].x, m[4].x)]).toEqual([true, true]);
    expect(m[1].x).toBeGreaterThan(boxes[0].x1);
    expect(m[2].x).toBeGreaterThan(boxes[1].x1);
    // no two structures overlap
    for (let i = 0; i < 5; i++)
      for (let j = i + 1; j < 5; j++) {
        const [p, q] = [boxes[i], boxes[j]];
        expect(p.x1 < q.x0 || q.x1 < p.x0 || p.y1 < q.y0 || q.y1 < p.y0).toBe(true);
      }
    // each caption is there, each under its structure
    for (let i = 0; i < 5; i++) expect(texts(svg).find((t) => t.text === "1abcde"[0] + "abcde"[i])!.y).toBeGreaterThan(boxes[i].y1);
  });
});

describe("one bond length", () => {
  it("is every structure's, whatever its file's scale and whether Meno or the file lays it out", async () => {
    // three structures whose bonds are 1.5, 0.9 and (the U) 1.5 long in their files, the last laid out by Meno: every bond of all
    // three is the style's bond, 1.8 world units (a molfile's mean bond made the drawing's), each line of the SVG one bond (to 0.001: the files give their coordinates to four decimals).
    const { svg } = await draw({
      items: [{ file: "a.mol", keepLayout: true }, { file: "wide.mol", keepLayout: true }, { file: "u.mol" }],
    });
    const segs = segments(svg);
    expect(segs).toHaveLength(2 + 2 + 3);
    for (const s of segs) expect(Math.abs(length(s) - 1.8)).toBeLessThan(1e-3);
  });
});

describe("keepLayout", () => {
  const points = (segs: Seg[]) => segs.flatMap((s) => [[s.x1, s.y1], [s.x2, s.y2]]);
  it("draws the file's coordinates, scaled and shifted and nothing else", async () => {
    const { svg } = await draw({ items: [{ file: "u.mol", keepLayout: true }] });
    const q = points(segments(svg));
    // The file's four points (0,0) (1.5,0) (1.5,1.5) (0,1.5): its bonds 1.5 long are made 1.8, a scale of 1.8 / 1.5 = 1.2; the file's
    // y runs up and the SVG's down, so SVG = (1.2 x + tx, -1.2 y + ty). The shift is found from the first point; the other three must
    // then lie where that puts them.
    const file = [[0, 0], [1.5, 0], [1.5, 1.5], [0, 1.5]];
    const tx = q[0][0];
    const ty = q[0][1];
    for (const [x, y] of file) {
      const want = [1.2 * x + tx, -1.2 * y + ty];
      expect(q.some(([qx, qy]) => Math.abs(qx - want[0]) < 1e-6 && Math.abs(qy - want[1]) < 1e-6)).toBe(true);
    }
  });
  it("is Meno's own layout without it: a chain's bonds meet at 120 degrees, not the file's 90", async () => {
    const { svg } = await draw({ items: [{ file: "u.mol" }] });
    const [s1, s2] = segments(svg);
    // the bonds' ends: bond 1 runs a to b, bond 2 b to c; at b the angle between b->a and b->c
    const [ax, ay] = [s1.x1 - s1.x2, s1.y1 - s1.y2];
    const [cx, cy] = [s2.x2 - s2.x1, s2.y2 - s2.y1];
    const angle = (Math.acos((ax * cx + ay * cy) / (Math.hypot(ax, ay) * Math.hypot(cx, cy))) * 180) / Math.PI;
    expect(Math.abs(angle - 120)).toBeLessThan(1); // an sp3 chain's zigzag, drawn by Meno at 120
  });
});

describe("an arrow between two items", () => {
  it("stands between them, with its words over it and under it", async () => {
    const { svg, drawn } = await draw({ items: [{ file: "a.mol", arrowAfter: { over: "Pd/C", under: "rt" } }, { file: "b.mol" }] });
    expect(drawn.arrows).toHaveLength(1);
    const segs = segments(svg);
    const left = box(segs.slice(0, 2));
    const right = box(segs.slice(2));
    // the arrow is the one filled path of the bonds' ink: its x lies between the structures, its y is the middle the words are over and under
    const arrow = filled(svg, "#141414");
    expect(arrow).toHaveLength(1);
    const nums = arrow[0].match(/-?\d+(\.\d+)?(e-?\d+)?/g)!.map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThan(left.x1);
    expect(Math.max(...xs)).toBeLessThan(right.x0);
    const over = texts(svg).find((t) => t.text === "Pd/C")!;
    const under = texts(svg).find((t) => t.text === "rt")!;
    const axisY = (Math.min(...ys) + Math.max(...ys)) / 2;
    // (the baseline of the words over it is above the arrow's line, under it below: y runs down)
    expect(over.y).toBeLessThan(axisY);
    expect(under.y).toBeGreaterThan(axisY);
    // and each is between the structures too
    expect(over.x).toBeGreaterThan(left.x1);
    expect(under.x).toBeGreaterThan(left.x1);
  });
});

describe("a highlight", () => {
  it("is drawn in its colour behind an atom and behind a bond, and in no colour where none is asked", async () => {
    const red = "#ff0000";
    const none = await draw({ items: [{ file: "a.mol" }] });
    const atom = await draw({ items: [{ file: "a.mol", highlight: { atoms: [2], color: red } }] });
    const both = await draw({ items: [{ file: "a.mol", highlight: { atoms: [2], bonds: [1], color: red } }] });
    // one filled shape for the atom; a second for the bond; none without
    expect([filled(none.svg, red).length, filled(atom.svg, red).length, filled(both.svg, red).length]).toEqual([0, 1, 2]);
    expect(both.drawn.atoms.filter((a) => a.highlight === red).map((a) => a.id)).toHaveLength(1);
  });
  it("by the file's own numbers, whichever way Meno lays it out", async () => {
    // atom 3 of o.mol is the O: with the layout kept or not, it is the highlighted one
    for (const keepLayout of [true, false]) {
      const { drawn } = await draw({ items: [{ file: "o.mol", keepLayout, highlight: { atoms: [3] } }] });
      expect(drawn.atoms.filter((a) => a.highlight).map((a) => a.el)).toEqual(["O"]);
    }
  });
});

describe("an .rxn file", () => {
  it("with two reactants and a product is drawn with its one arrow and its one plus sign", async () => {
    const { svg, drawn } = await draw({ items: [{ file: "r.rxn", id: "rxn" }] });
    expect(drawn.arrows).toHaveLength(1);
    expect(drawn.pluses).toHaveLength(1);
    // chains of 3, 4 and 5 carbons: 12 atoms, 2 + 3 + 4 = 9 bonds
    expect(drawn.atoms).toHaveLength(12);
    const segs = segments(svg);
    expect(segs).toHaveLength(9);
    const [a, b, c] = [box(segs.slice(0, 2)), box(segs.slice(2, 5)), box(segs.slice(5))];
    // Two filled shapes in the bonds' ink, taken left to right: the plus sign (one shape, its two bars) between the reactants, and the
    // arrow (one shape, shaft and head) between the second reactant and the product.
    const shapes = filled(svg, "#141414").map((d) => {
      const xs = (d.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 0);
      return { x0: Math.min(...xs), x1: Math.max(...xs) };
    }).sort((p, q) => p.x0 - q.x0);
    expect(shapes).toHaveLength(2);
    expect(shapes[0].x0).toBeGreaterThan(a.x1);
    expect(shapes[0].x1).toBeLessThan(b.x0);
    expect(shapes[1].x0).toBeGreaterThan(b.x1);
    expect(shapes[1].x1).toBeLessThan(c.x0);
  });
});

describe("an .sdf file", () => {
  it("is drawn by the record asked for", async () => {
    // record 2 is the chain of four: three bonds
    const { svg } = await draw({ items: [{ file: "pair.sdf", record: 2 }] });
    expect(segments(svg)).toHaveLength(3);
    expect(segments((await draw({ items: [{ file: "pair.sdf" }] })).svg)).toHaveLength(2);
  });
});

describe("a mistake", () => {
  const fails = async (figure: Partial<FigureSpec>, more: Partial<Manifest> = {}) => {
    try {
      await drawFigures({ ...more, figures: [{ name: "table", items: [{ file: "a.mol" }, { file: "b.mol", id: "1b" }], ...figure }] }, read);
    } catch (e) {
      expect(e).toBeInstanceOf(FigureError);
      return (e as Error).message;
    }
    throw new Error("it was drawn");
  };
  it("a missing file names the figure and the item", async () => {
    const m = await fails({ items: [{ file: "a.mol" }, { file: "nowhere.mol", id: "1b" }] });
    expect(m).toContain('figure "table"');
    expect(m).toContain('item 2 ("1b")');
    expect(m).toContain("nowhere.mol");
  });
  it("an atom out of range names the figure and the item", async () => {
    const m = await fails({ items: [{ file: "a.mol" }, { file: "b.mol", id: "1b", highlight: { atoms: [5] } }] });
    expect(m).toContain('figure "table"');
    expect(m).toContain('item 2 ("1b")');
    expect(m).toMatch(/atom 5 is not in the file, which has 4/);
  });
  it("a bond out of range, and a number below 1, likewise", async () => {
    const m = await fails({ items: [{ file: "a.mol", highlight: { bonds: [3] } }] });
    expect(m).toContain("item 1");
    expect(m).toMatch(/bond 3 is not in the file, which has 2/);
    expect(await fails({ items: [{ file: "a.mol", highlight: { atoms: [0] } }] })).toMatch(/atom 0 is not in the file/);
  });
  it("an unknown style names the figure, or the manifest", async () => {
    expect(await fails({ style: "nope" })).toContain('figure "table": unknown style "nope"');
    expect(await fails({}, { style: "nope" })).toContain('The manifest: unknown style "nope"');
  });
  it("a file that is not a structure's names the item", async () => {
    files["empty.mol"] = "nothing here";
    const m = await fails({ items: [{ file: "a.mol" }, { file: "empty.mol" }] });
    expect(m).toContain('figure "table", item 2');
  });
  it("an arrow in a grid, an arrow after the last item and a record of a .mol name theirs", async () => {
    expect(await fails({ columns: 2, items: [{ file: "a.mol", arrowAfter: { over: "x" } }, { file: "b.mol" }] })).toContain("item 1");
    expect(await fails({ items: [{ file: "a.mol" }, { file: "b.mol", arrowAfter: {} }] })).toContain("item 2");
    expect(await fails({ items: [{ file: "a.mol", record: 2 }] })).toContain("item 1");
  });
});

it("draws in every style preset, and a figure's own style overrides the manifest's", async () => {
  for (const p of STYLE_PRESETS) {
    const { svg } = await draw({ items: [{ file: "a.mol" }] }, { style: p.id });
    expect(svg).toContain("<svg");
    expect((await draw({ style: p.id, items: [{ file: "a.mol" }] }, { style: STYLE_PRESETS[1].id })).svg).toBe(svg);
  }
});
