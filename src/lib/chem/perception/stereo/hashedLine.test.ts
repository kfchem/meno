import { describe, expect, it } from "vitest";
import { HASHED_BETWEEN, HASHED_TO_LARGE, HASHED_TWO, readStereo, unreadWhy, unsureStereo, type DrawnAtom, type DrawnBond } from "./from2d";

/**
 * A centre C (atom 0) at the page's middle with three groups drawn plain - `left` up-left, `right` up-right, and the line's group down -
 * built of atoms here: each group a list of the atoms out from its first, a chain. `line` is how the bond down is drawn.
 */
type Line = "line" | "wedge" | "reverse" | "solid-reverse" | "bold";
function centre(down: string[], line: Line, hs = 1): { atoms: DrawnAtom[]; bonds: DrawnBond[] } {
  const atoms: DrawnAtom[] = [{ x: 0, y: 0, el: "C", hs }];
  const bonds: DrawnBond[] = [];
  const chain = (els: string[], dx: number, dy: number, from = 0) => {
    let prev = from;
    els.forEach((el, k) => {
      atoms.push({ x: atoms[from].x + dx * (k + 1), y: atoms[from].y + dy * (k + 1), el, hs: el === "C" ? 2 : el === "O" || el === "N" ? 1 : 0 });
      bonds.push({ a: prev, b: atoms.length - 1, order: 1 });
      prev = atoms.length - 1;
    });
    return atoms.length - els.length;
  };
  chain(["C", "C"], -0.87, 0.5); // an ethyl up-left
  chain(["C"], 0.87, 0.5); // a methyl up-right
  const first = atoms.length;
  atoms.push({ x: 0, y: -1, el: down[0], hs: down.length === 1 ? (down[0] === "O" || down[0] === "N" ? 1 : down[0] === "C" ? 3 : 0) : 0 });
  const b: DrawnBond = { a: 0, b: first, order: 1 };
  if (line === "line") b.hashed = true;
  if (line === "wedge") b.wedge = { narrow: 0, stereo: "down" };
  if (line === "reverse") b.wedge = { narrow: first, stereo: "down" };
  if (line === "solid-reverse") b.wedge = { narrow: first, stereo: "up" };
  if (line === "bold") b.bold = true;
  bonds.push(b);
  // (the rest of the down group, out from its first atom)
  down.slice(1).forEach((el, k) => {
    const t = (-90 + (k - (down.length - 2) / 2) * 60) * (Math.PI / 180);
    atoms.push({ x: atoms[first].x + Math.cos(t), y: atoms[first].y + Math.sin(t), el, hs: el === "C" ? 3 : el === "O" ? 1 : 0 });
    bonds.push({ a: first, b: atoms.length - 1, order: el === "=O" ? 2 : 1 });
  });
  return { atoms, bonds };
}
const tetra = (d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }) => readStereo(d.atoms, d.bonds).tetra.get(0);

describe("a hashed line, read as IUPAC grades it", () => {
  it("to an end group - an OH, an ethyl's CH2, a CHO's C - is read as the hashed wedge the right way round would be", () => {
    for (const down of [["O"], ["C", "C"], ["C", "O"]]) {
      const asWedge = tetra(centre(down, "wedge"));
      expect(asWedge, down.join("")).toBeDefined();
      expect(tetra(centre(down, "line")), down.join("")).toEqual(asWedge);
    }
  });

  it("to a group of two other groups or more - an isopropyl, a tert-butyl - is read as nothing: open, saying which end is not said", () => {
    // (an isopropyl, a tert-butyl, a COOH's C)
    for (const down of [["C", "C", "C"], ["C", "C", "C", "C"], ["C", "O", "O"]]) {
      const d = centre(down, "line");
      expect(tetra(d), down.join("")).toBeUndefined();
      expect(unreadWhy(d.atoms, d.bonds, 0)).toBe(HASHED_TO_LARGE);
      expect(unsureStereo(d.atoms, d.bonds).atoms).toContain(0);
    }
  });

  it("a hashed wedge the wrong way round to an OH is read as the right way round; a solid wedge so stays unread", () => {
    expect(tetra(centre(["O"], "reverse"))).toEqual(tetra(centre(["O"], "wedge")));
    expect(tetra(centre(["O"], "solid-reverse"))).toBeUndefined();
  });

  it("a bold line to an OH at a centre states nothing: open", () => {
    expect(tetra(centre(["O"], "bold"))).toBeUndefined();
  });

  it("a centre with a solid wedge of its own and a hashed line to its OH is read from the wedge, the same as without the line", () => {
    const d = centre(["O"], "line");
    // (the ethyl's bond made a solid wedge narrow at the centre)
    d.bonds[0] = { ...d.bonds[0], wedge: { narrow: 0, stereo: "up" } };
    const plain = { atoms: d.atoms, bonds: d.bonds.map((b) => (b.hashed ? { a: b.a, b: b.b, order: b.order } : b)) };
    expect(tetra(d)).toBeDefined();
    expect(tetra(d)).toEqual(tetra(plain));
  });

  it("two hashed lines at one atom: open, saying so", () => {
    const d = centre(["O"], "line");
    d.bonds[2] = { ...d.bonds[2], hashed: true };
    expect(tetra(d)).toBeUndefined();
    expect(unreadWhy(d.atoms, d.bonds, 0)).toBe(HASHED_TWO);
  });
});

describe("a hashed line between two stereocentres", () => {
  it("of a 2,3-disubstituted butane (2,3-butanediol): states neither, both open and shown", () => {
    // (C2 at the middle: CH3 up-left, OH up-right, C3 down; C3: CH3 down-left, OH down-right; the C2-C3 bond a hashed line)
    const atoms: DrawnAtom[] = [
      { x: 0, y: 0, el: "C", hs: 1 },
      { x: -0.87, y: 0.5, el: "C", hs: 3 },
      { x: 0.87, y: 0.5, el: "O", hs: 1 },
      { x: 0, y: -1, el: "C", hs: 1 },
      { x: -0.87, y: -1.5, el: "C", hs: 3 },
      { x: 0.87, y: -1.5, el: "O", hs: 1 },
    ];
    const bonds: DrawnBond[] = [
      { a: 0, b: 1, order: 1 },
      { a: 0, b: 2, order: 1 },
      { a: 0, b: 3, order: 1, hashed: true },
      { a: 3, b: 4, order: 1 },
      { a: 3, b: 5, order: 1 },
    ];
    const read = readStereo(atoms, bonds);
    expect(read.tetra.get(0)).toBeUndefined();
    expect(read.tetra.get(3)).toBeUndefined();
    expect(unreadWhy(atoms, bonds, 0)).toBe(HASHED_BETWEEN);
    expect(unreadWhy(atoms, bonds, 3)).toBe(HASHED_BETWEEN);
    expect(unsureStereo(atoms, bonds).atoms).toEqual(expect.arrayContaining([0, 3]));
  });
});

describe("three ring carbons each with a hashed line to its OH (the text's acceptable figure)", () => {
  it("each read, the same as with three hashed wedges", () => {
    // (a cyclohexane, its atoms 0..5 round; atoms 0, 2 and 4 each with an OH out of the ring)
    const ring = Array.from({ length: 6 }, (_, k) => ({ x: Math.cos((k * Math.PI) / 3), y: Math.sin((k * Math.PI) / 3) }));
    const atoms: DrawnAtom[] = ring.map((p, k) => ({ ...p, el: "C", hs: k % 2 ? 2 : 1 }));
    const bonds: DrawnBond[] = ring.map((_, k) => ({ a: k, b: (k + 1) % 6, order: 1 }));
    for (const k of [0, 2, 4]) {
      atoms.push({ x: ring[k].x * 2, y: ring[k].y * 2, el: "O", hs: 1 });
      bonds.push({ a: k, b: atoms.length - 1, order: 1, hashed: true });
    }
    const asWedges = bonds.map((b) => (b.hashed ? { a: b.a, b: b.b, order: b.order, wedge: { narrow: b.a, stereo: "down" as const } } : b));
    const lines = readStereo(atoms, bonds).tetra;
    const wedges = readStereo(atoms, asWedges).tetra;
    for (const k of [0, 2, 4]) {
      expect(wedges.get(k)).toBeDefined();
      expect(lines.get(k)).toEqual(wedges.get(k));
    }
  });
});
