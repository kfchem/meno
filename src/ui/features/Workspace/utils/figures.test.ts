import { describe, expect, it } from "vitest";
import type { FigureDrawn, FigureLetter, FigurePath, PathStep } from "../../../../lib/figure/drawn";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import type { Model } from "../store/types";
import { readDrawn } from "./copyPaste";
import { atomAs, atomAtSpot, bondAs, placedBeside, readMarks, structureFrom } from "./figures";

const SHA = "a".repeat(64);
const L = 14.4;
type P = [number, number];
const stroke = (...pts: P[]): FigurePath => ({ fill: null, stroke: "#000000ff", width: 0.6, d: pts.map(([x, y], i): PathStep => [i ? "L" : "M", x, y]) });
const wedge = (tip: P, base: P): FigurePath => {
  const l = Math.hypot(base[0] - tip[0], base[1] - tip[1]);
  const [ux, uy] = [(base[0] - tip[0]) / l, (base[1] - tip[1]) / l];
  return { fill: "#000000ff", stroke: null, width: 0, d: [["M", ...tip], ["L", base[0] - uy * 2, base[1] + ux * 2], ["L", base[0] + uy * 2, base[1] - ux * 2], ["Z"]] };
};
const step = (p: P, deg: number): P => [p[0] + L * Math.cos((deg * Math.PI) / 180), p[1] - L * Math.sin((deg * Math.PI) / 180)];
const letters = (text: string, [x, y]: P): FigureLetter[] =>
  [...text].map((c, i) => ({ c, box: [x - 3.4 + 6.8 * i, y - 3.6, x + 3.4 + 6.8 * i, y + 3.6], at: [x - 3.4 + 6.8 * i, y + 3.6], size: 10 }));

/** A branched chain with an OH at its end and a wedge, as drawn on page 2 of a PDF. */
function drawn(label = "OH"): FigureDrawn {
  const a: P = [100, 200];
  const b = step(a, 30);
  const c = step(b, -30);
  const o = step(c, 30);
  return {
    paths: [stroke(a, b, c), stroke(c, [c[0] + (o[0] - c[0]) * 0.55, c[1] + (o[1] - c[1]) * 0.55]), wedge(b, step(b, 90))],
    letters: letters(label, o),
    pictures: [],
  };
}

describe("a figure read as a structure for the page", () => {
  it("ties each atom to where it was drawn, a bond as long as Meno draws one", () => {
    const m = structureFrom(drawn(), SHA, 2) as Model;
    expect(m.atoms).toHaveLength(5);
    expect(m.atoms.every((a) => a.seen?.sha256 === SHA && a.seen.page === 2 && Math.abs(a.seen.bond - L) < 0.5)).toBe(true);
    const o = m.atoms.find((a) => a.el === "O")!;
    // (the O where its letter was drawn)
    expect(o.seen!.x).toBeCloseTo(100 + 3 * L * Math.cos(Math.PI / 6), 0);
    const [p, q] = [m.atoms[0], m.atoms[1]];
    const bond = m.bonds.find((x) => (x.a === p.id && x.b === q.id) || (x.a === q.id && x.b === p.id));
    if (bond) expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeCloseTo(NOMINAL_BOND_LENGTH, 1);
    // (the wedge narrow at its stereocentre: drawn so without being told, it having more bonds)
    const w = m.bonds.find((x) => x.stereo === "up")!;
    expect(m.bonds.filter((x) => x.a === w.a || x.b === w.a)).toHaveLength(3);
    expect(w.stereoOrient).toBeUndefined();
  });

  it("says why there is nothing to read: no lines, or a picture", () => {
    expect(structureFrom({ paths: [], letters: [], pictures: [] }, SHA, 0)).toEqual({ none: "No structure is drawn there." });
    expect("none" in (structureFrom({ paths: [], letters: [], pictures: [[0, 0, 10, 10]] }, SHA, 0) as object)).toBe(true);
  });

  it("marks what was unsure while it is as it was read, and not once it is put right", () => {
    const m = structureFrom(drawn("Qz"), SHA, 0) as Model;
    const q = m.atoms.find((a) => a.el === "Qz")!;
    expect(readMarks(m).atoms.get(q.id)).toMatch(/not read/);
    // (made an oxygen: put right)
    const fixed = { ...m, atoms: m.atoms.map((a) => (a.id === q.id ? { ...a, el: "O" } : a)) };
    expect(readMarks(fixed).atoms.size).toBe(0);
    // (moved only: still as read)
    const moved = { ...m, atoms: m.atoms.map((a) => ({ ...a, x: a.x + 3 })) };
    expect(readMarks(moved).atoms.get(q.id)).toBeDefined();
  });

  it("knows a part by its chemistry: element, charge and bonds; order and stereo", () => {
    const bonds = [{ id: 3, a: 1, b: 2, order: 1 as const, stereo: "up" as const }];
    expect(atomAs({ id: 1, el: "C" }, bonds)).not.toBe(atomAs({ id: 2, el: "C" }, bonds));
    expect(bondAs({ order: 1, stereo: "up" })).not.toBe(bondAs({ order: 1, stereo: "down" }));
  });

  it("finds the atom drawn near a point of its page, and none further than a third of a bond", () => {
    const m = structureFrom(drawn(), SHA, 2) as Model;
    const o = m.atoms.find((a) => a.el === "O")!;
    expect(atomAtSpot(m, SHA, 2, o.seen!.x + 1, o.seen!.y - 1)).toBe(o.id);
    expect(atomAtSpot(m, SHA, 2, o.seen!.x + 6, o.seen!.y)).toBe(null);
    expect(atomAtSpot(m, SHA, 1, o.seen!.x, o.seen!.y)).toBe(null);
  });
});

describe("where a structure read goes", () => {
  const m: Model = {
    atoms: [
      { id: 1, x: -1, y: 0, r: 0.9, el: "C" },
      { id: 2, x: 1, y: 0.5, r: 0.9, el: "C" },
    ],
    bonds: [],
  };
  it("lies beside what it was read from, its top level with it", () => {
    const placed = placedBeside(m, { x0: 0, y0: 0, x1: 10, y1: 8 }, []);
    expect(Math.min(...placed.atoms.map((a) => a.x))).toBeCloseTo(10 + 2 * NOMINAL_BOND_LENGTH);
    expect(Math.max(...placed.atoms.map((a) => a.y))).toBeCloseTo(8);
  });
  it("goes on past what lies there", () => {
    const placed = placedBeside(m, { x0: 0, y0: 0, x1: 10, y1: 8 }, [{ x0: 12, y0: 0, x1: 30, y1: 10 }]);
    expect(Math.min(...placed.atoms.map((a) => a.x))).toBeGreaterThan(30);
  });
});

describe("a structure read, carried by the clipboard's record", () => {
  it("keeps where its atoms were read from and what was unsure, and leaves out what does not read", () => {
    const good = { sha256: SHA, page: 1, x: 10, y: 20, bond: 14 };
    const r = readDrawn({
      atoms: [
        { id: 1, x: 0, y: 0, el: "C", seen: good, unsure: { said: ["Its hashes are even."], as: "C|0|" } },
        { id: 2, x: 1, y: 0, el: "C", seen: { ...good, sha256: "nope" }, unsure: { said: "x", as: 3 } },
      ],
      bonds: [{ id: 3, a: 1, b: 2, order: 1, unsure: { said: ["Drawn twice over."], as: "1|none||" } }],
    })!;
    expect(r.atoms[0].seen).toEqual(good);
    expect(r.atoms[0].unsure?.said).toEqual(["Its hashes are even."]);
    expect(r.atoms[1].seen).toBeUndefined();
    expect(r.atoms[1].unsure).toBeUndefined();
    expect(r.bonds[0].unsure?.as).toBe("1|none||");
  });
});
