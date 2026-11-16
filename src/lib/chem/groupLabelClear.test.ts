import { describe, expect, it } from "vitest";
import { labelBox, labelSetOf, layoutMolecule, segmentMeetsBox, type Atom, type Bond, type LayoutOptions, type TextItem } from "./layout2d";
import { acsWorldOptions, NOMINAL_BOND_LENGTH } from "./acs";

const L = NOMINAL_BOND_LENGTH;
const opts = (): LayoutOptions => acsWorldOptions([], [], { units: "world" });

// trans-2-methylcyclohexan-1-ol's (S)-sec-butyl ether, laid out by hand as a page draws it: the ring's two centres in and1, the
// side chain's centre wedged and in no group - so "and1" is written at each ring centre, not "and enantiomer" beneath
const at = (x: number, y: number) => ({ x: (x / 75) * L, y: (-y / 75) * L });
const and1 = { kind: "and" as const, n: 1 };
const ether = (): { atoms: Atom[]; bonds: Bond[] } => {
  const atoms: Atom[] = [
    { id: 1, ...at(908, 592), el: "C" },
    { id: 2, ...at(969, 635), el: "C" },
    { id: 3, ...at(962, 710), el: "C", stereoGroup: and1 },
    { id: 4, ...at(893, 740), el: "C", stereoGroup: and1 },
    { id: 5, ...at(833, 697), el: "C" },
    { id: 6, ...at(840, 622), el: "C" },
    { id: 7, ...at(1022, 755), el: "O" },
    { id: 8, ...at(886, 815), el: "C" },
    { id: 9, ...at(1092, 722), el: "C" },
    { id: 10, ...at(1152, 765), el: "C" },
    { id: 11, ...at(1099, 648), el: "C" },
    { id: 12, ...at(1167, 617), el: "C" },
  ];
  const bonds: Bond[] = [
    { a1: 0, a2: 1, order: 1 },
    { a1: 1, a2: 2, order: 1 },
    { a1: 2, a2: 3, order: 1 },
    { a1: 3, a2: 4, order: 1 },
    { a1: 4, a2: 5, order: 1 },
    { a1: 5, a2: 0, order: 1 },
    { a1: 2, a2: 6, order: 1, stereo: "up" },
    { a1: 3, a2: 7, order: 1, stereo: "down" },
    { a1: 6, a2: 8, order: 1 },
    { a1: 8, a2: 9, order: 1, stereo: "down" },
    { a1: 8, a2: 10, order: 1 },
    { a1: 10, a2: 11, order: 1 },
  ];
  return { atoms, bonds };
};

const boxOf = (t: TextItem, o: LayoutOptions) => {
  const b = labelBox(t, t.fontPx, labelSetOf(o));
  return { minX: t.x - b.left, maxX: t.x + b.right, minY: t.y - b.bottom, maxY: t.y + b.top };
};
const meet = (p: ReturnType<typeof boxOf>, q: ReturnType<typeof boxOf>) => p.minX < q.maxX && q.minX < p.maxX && p.minY < q.maxY && q.minY < p.maxY;

describe("an atom's enhanced stereo group, written at its centre (GR-11.1)", () => {
  it("is clear of every bond and every other label: never across a ring's bond", () => {
    const { atoms, bonds } = ether();
    const o = opts();
    const layout = layoutMolecule(atoms, bonds, o, 40);
    const groups = layout.texts.filter((t) => t.text === "and1");
    expect(groups).toHaveLength(2);
    expect(layout.texts.some((t) => t.text === "and enantiomer")).toBe(false);
    for (const g of groups) {
      const box = boxOf(g, o);
      for (const b of bonds) expect(segmentMeetsBox(atoms[b.a1], atoms[b.a2], box), `bond ${b.a1}-${b.a2}`).toBe(false);
      for (const t of layout.texts) if (t !== g) expect(meet(box, boxOf(t, o)), t.text).toBe(false);
    }
  });

  it("stays close to its atom: within a bond's length", () => {
    const { atoms, bonds } = ether();
    const layout = layoutMolecule(atoms, bonds, opts(), 40);
    const [ring1, ring2] = [atoms[2], atoms[3]];
    const groups = layout.texts.filter((t) => t.text === "and1");
    const near = (a: Atom) => Math.min(...groups.map((g) => Math.hypot(g.x - a.x, g.y - a.y)));
    expect(near(ring1)).toBeLessThan(L);
    expect(near(ring2)).toBeLessThan(L);
  });

  it("goes where its bonds leave most room when nothing is in the way, as before: above a bare chain's centre", () => {
    // butan-2-ol, C2 in or1 beside an ungrouped wedge: the label's way the one its bonds and GR-11.1 give
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: L * 0.866, y: L / 2, el: "C", stereoGroup: { kind: "or", n: 1 } },
      { id: 3, x: L * 1.732, y: 0, el: "C" },
      { id: 4, x: L * 2.598, y: L / 2, el: "C" },
      { id: 5, x: L * 1.732, y: -L, el: "O" },
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 1 },
      { a1: 1, a2: 2, order: 1 },
      { a1: 2, a2: 3, order: 1 },
      { a1: 2, a2: 4, order: 1, stereo: "up" },
    ];
    const layout = layoutMolecule(atoms, bonds, opts(), 40);
    const g = layout.texts.find((t) => t.text === "or1")!;
    expect(g).toBeDefined();
    expect(g.y).toBeGreaterThan(atoms[1].y);
    expect(Math.abs(g.x - atoms[1].x)).toBeLessThan(L * 0.2);
  });
});

describe("a racemic drawing, all its centres in one group", () => {
  it("still says 'and enantiomer' once beneath it, with plain atoms beside the group and no label at a centre", () => {
    // the ether's ring alone: its two centres in and1, wedged; its CH2s and the methyl plain atoms, the narrow ends of no wedge
    const { atoms, bonds } = ether();
    const ring = atoms.slice(0, 8);
    const ringBonds = bonds.slice(0, 8);
    const t = layoutMolecule(ring, ringBonds, opts(), 40).texts.map((x) => x.text);
    expect(t.filter((x) => x === "and enantiomer")).toHaveLength(1);
    expect(t).not.toContain("and1");
  });
});

describe("segmentMeetsBox", () => {
  const box = { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  it("meets a line through, into or along the box, and not one that passes by", () => {
    expect(segmentMeetsBox({ x: -1, y: 0.5 }, { x: 2, y: 0.5 }, box)).toBe(true);
    expect(segmentMeetsBox({ x: 0.5, y: 0.5 }, { x: 3, y: 3 }, box)).toBe(true);
    expect(segmentMeetsBox({ x: -1, y: 1.5 }, { x: 2, y: 1.5 }, box)).toBe(false);
    expect(segmentMeetsBox({ x: -1, y: 1 }, { x: 1, y: 3 }, box)).toBe(false);
    expect(segmentMeetsBox({ x: 1.5, y: -1 }, { x: 1.5, y: 2 }, box)).toBe(false);
  });
});

describe("what is said beside an atom, among labels and other notes", () => {
  const zigzag = (n: number, map = true): { atoms: Atom[]; bonds: Bond[] } => ({
    atoms: Array.from({ length: n }, (_, i) => ({ id: i + 1, x: i * L * 0.866, y: i % 2 ? L / 2 : 0, el: i === 3 ? "O" : "C", ...(map ? { map: i + 1 } : {}) })),
    bonds: Array.from({ length: n - 1 }, (_, i) => ({ a1: i, a2: i + 1, order: 1 as const })),
  });

  it("keeps a mapping number off a label beside it and off its neighbours' notes, long ones too", () => {
    // (each note long - a map number, inv, exact - so that two neighbours set the same way would meet)
    const { atoms: plainAtoms, bonds } = zigzag(8);
    const atoms = plainAtoms.map((a, i) => ({ ...a, map: 10 + i, invRet: "invert" as const, exactChange: true }));
    const o = opts();
    const texts = layoutMolecule(atoms, bonds, o, 40).texts;
    const notes = texts.filter((t) => t.beside && t.atom == null);
    const labelsOnly = texts.filter((t) => t.atom != null);
    for (const n of notes) {
      const box = boxOf(n, o);
      for (const lab of labelsOnly) expect(meet(box, boxOf(lab, o)), `${n.text} on ${lab.text}`).toBe(false);
      for (const m of notes) if (m !== n) expect(meet(box, boxOf(m, o)), `${n.text} on ${m.text}`).toBe(false);
    }
  });

  it("is placed by what lies near it alone: the start of a long chain's notes is as the same start of a short one's", () => {
    const place = (n: number) =>
      layoutMolecule(zigzag(n).atoms, zigzag(n).bonds, opts(), 40)
        .texts.filter((t) => t.beside && t.atom == null)
        .slice(0, 10)
        .map((t) => `${t.text}@${t.x.toFixed(6)},${t.y.toFixed(6)}`);
    expect(place(400)).toEqual(place(20));
  });
});
