import { describe, expect, it } from "vitest";
import { openDoubleBonds, readStereo } from "./drawn";
import { layout2D } from "./engine";
import { smilesInput } from "./smilesInput";
import type { LayoutInput } from "./perceive";
import { unspecifiedDoubles, type Atom, type Bond } from "../chem/layout2d";

// A double bond that arrives with no configuration given is drawn as stating none (Brecher 2006, ST-4.4; ST-6.2): straight on where each end has
// one group, a wavy bond on a group where an end has two.

const open = (smiles: string) => openDoubleBonds(smilesInput(smiles));

describe("the double bonds a structure's text leaves open", () => {
  it("keeps but-2-ene's ends straight on, from CC=CC with no marks", () => {
    const o = open("CC=CC");
    expect(o.straight.sort()).toEqual([1, 2]);
    expect(o.either).toEqual([]);
  });

  it("leaves a double bond given E or Z as it is: C/C=C/C and C/C=C\\C", () => {
    for (const s of ["C/C=C/C", "C/C=C\\C"]) expect(open(s)).toEqual({ straight: [], either: [] });
  });

  it("gives 3-methylpent-2-ene, with no marks, a wavy bond: its C3 has two groups, unlike", () => {
    const input = smilesInput("CC=C(C)CC");
    const o = openDoubleBonds(input);
    expect(o.straight).toEqual([]);
    expect(o.either).toHaveLength(1);
    const b = input.bonds[o.either[0]];
    expect([b.a, b.b].sort()).toEqual([1, 2]);
  });

  it("keeps stilbene's ends straight on, from C(=Cc1ccccc1)c1ccccc1", () => {
    const o = open("C(=Cc1ccccc1)c1ccccc1");
    expect(o.straight).toHaveLength(2);
    expect(o.either).toEqual([]);
  });

  it("leaves as they are the double bonds that have no cis or trans: cyclohexene, isobutene, 2-methylbut-2-ene (two alike), an amidine's C=NH, an allene, porphine's (an aromatic macrocycle's, in Kekule form)", () => {
    for (const s of ["C1=CCCCC1", "C=C(C)C", "CC=C(C)C", "CC(=N)N", "CC=C=CC", "C1=CC2=CC3=CC=C(N3)C=C4C=CC(=N4)C=C5C=CC(N5)=CC1=N2"]) expect(open(s), s).toEqual({ straight: [], either: [] });
  });

  it("gives citral with no marks a wavy bond on its C2=C3 - C3 has two groups, unlike - and leaves its C6=C7, an end of two methyls, as it is", () => {
    const o = open("CC(C)=CCCC(C)=CC=O");
    expect(o.straight).toEqual([]);
    expect(o.either).toHaveLength(1);
  });
});

describe("laid out by the engine", () => {
  /** The drawing as the reader takes it: the layout's places, the input's bonds. */
  const read = (input: LayoutInput, laid: { x: number[]; y: number[] }) =>
    readStereo(
      input.atoms.map((a, i) => ({ el: a.el, x: laid.x[i], y: laid.y[i], hs: a.hs ?? 0 })) as never,
      input.bonds.map((b) => ({ a: b.a, b: b.b, order: b.order })),
    );

  it("draws but-2-ene's ends straight on, so that the drawing states neither cis nor trans", () => {
    const input = smilesInput("CC=CC");
    expect(input.atoms.filter((a) => a.linear).length).toBe(2);
    // (as drawn without it: bent, and read as one of them; smilesInput gives the engine the straight ends itself)
    const bent = { ...input, atoms: input.atoms.map(({ linear: _l, ...a }) => a) };
    expect(read(input, layout2D(bent)).cisTrans.size).toBe(1);
    expect(read(input, layout2D(input)).cisTrans.size).toBe(0);
  });
});

describe("the wavy bond of a double bond left open with an end of two groups", () => {
  it("goes on the group of the end that has ONE group - 3-methylpent-2-ene's on C2's methyl - not on C3's two", () => {
    const input = smilesInput("CC=C(C)CC");
    const laid = layout2D(input);
    const o = openDoubleBonds(input);
    const atoms: Atom[] = input.atoms.map((a, i) => ({ id: i, x: laid.x[i], y: laid.y[i], el: a.el }));
    const bonds: Bond[] = input.bonds.map((b, i) => ({ a1: b.a, a2: b.b, order: b.order as 1 | 2 | 3, ...(o.either.includes(i) ? { stereo: "either" as const } : {}) }));
    const drawn = unspecifiedDoubles(atoms, bonds);
    const wavy = drawn.filter((b) => b.stereo === "wavy");
    expect(wavy).toHaveLength(1);
    expect([wavy[0].a1, wavy[0].a2].sort()).toEqual([0, 1]);
  });
});

describe("a double bond in a ring of eight atoms or more, and the end of two groups one of which is a stereocentre", () => {
  /** The structure laid out, its open bonds marked "either", drawn as the SVG writer draws them: the wavy bonds, and what the reader takes. */
  const drawn = (smiles: string) => {
    const input = smilesInput(smiles);
    const laid = layout2D(input);
    const o = openDoubleBonds(input);
    const atoms: Atom[] = input.atoms.map((a, i) => ({ id: i, x: laid.x[i], y: laid.y[i], el: a.el }));
    const bonds: Bond[] = input.bonds.map((b, i) => ({ a1: b.a, a2: b.b, order: b.order as 1 | 2 | 3, ...(o.either.includes(i) ? { stereo: "either" as const } : {}) }));
    for (const w of laid.wedges) {
      const k = bonds.findIndex((b) => (b.a1 === w.from && b.a2 === w.to) || (b.a1 === w.to && b.a2 === w.from));
      if (k >= 0) bonds[k] = { ...bonds[k], a1: w.from, a2: w.to, stereo: w.stereo };
    }
    const shown = unspecifiedDoubles(atoms, bonds);
    const wavy = shown.flatMap((b, k) => (b.stereo === "wavy" ? [k] : []));
    const read = readStereo(
      input.atoms.map((a, i) => ({ el: a.el, x: laid.x[i], y: laid.y[i], hs: a.hs ?? 0 })) as never,
      input.bonds.map((b, k) => ({ a: b.a, b: b.b, order: b.order, ...(wavy.includes(k) ? { either: true } : {}) })),
    );
    return { input, o, wavy, read };
  };

  it("never keeps a ring's ends straight on: cyclooctene and cyclododecene with no marks get a wavy bond on a ring bond beside the C=C, and read as none", () => {
    for (const s of ["C1CCCCCC=C1", "C1CCCCCCCCCC=C1"]) {
      const { input, o, wavy, read } = drawn(s);
      expect(o.straight, s).toEqual([]);
      expect(o.either, s).toHaveLength(1);
      expect(input.atoms.some((a) => a.linear), s).toBe(false);
      expect(wavy, s).toHaveLength(1);
      const d = input.bonds[o.either[0]];
      const w = input.bonds[wavy[0]];
      expect(w.order, s).toBe(1);
      expect([w.a, w.b].some((x) => x === d.a || x === d.b), s).toBe(true);
      expect(read.cisTrans.size, s).toBe(0);
    }
  });

  it("leaves cyclooctene's C=C, given Z, as it is", () => {
    expect(open("C1CCCCC/C=C\\1")).toEqual({ straight: [], either: [] });
  });

  it("puts the wavy bond on the free group of an end whose other group is a stereocentre: C[C@H](O)C=C(C)[C@@H](C)O's on C4's methyl", () => {
    const { input, wavy, read } = drawn("C[C@H](O)C=C(C)[C@@H](C)O");
    expect(wavy).toHaveLength(1);
    const w = input.bonds[wavy[0]];
    // (C4 is atom 4, its methyl atom 5)
    expect([w.a, w.b].sort((p, q) => p - q)).toEqual([4, 5]);
    expect(read.cisTrans.size).toBe(0);
  });

  it("leaves a C=N whose E/Z is none of its own as it is: CC(N)=NC, an amidine", () => {
    expect(open("CC(N)=NC")).toEqual({ straight: [], either: [] });
  });
});

describe("the wavy bond's end, where both ends have two groups", () => {
  it("is the end with a free group, though the end listed first has none: the bond to each centre kept plain", () => {
    // (C0=C1; C0's groups 2 and 3 and C1's group 5 each a stereocentre - a wedge narrow there - C1's group 4 a methyl)
    const atoms: Atom[] = [
      [0, 0], [1.3, 0], [-0.7, 1.1], [-0.7, -1.1], [2, 1.1], [2, -1.1], [-0.2, 2.2], [-0.2, -2.2], [1.5, -2.2],
    ].map(([x, y], i) => ({ id: i, x, y, el: "C" }));
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 2, stereo: "either" },
      { a1: 0, a2: 2, order: 1 },
      { a1: 0, a2: 3, order: 1 },
      { a1: 1, a2: 4, order: 1 },
      { a1: 1, a2: 5, order: 1 },
      { a1: 2, a2: 6, order: 1, stereo: "up", narrow: 2 },
      { a1: 3, a2: 7, order: 1, stereo: "down", narrow: 3 },
      { a1: 5, a2: 8, order: 1, stereo: "up", narrow: 5 },
    ];
    const wavy = unspecifiedDoubles(atoms, bonds).flatMap((b, k) => (b.stereo === "wavy" ? [k] : []));
    expect(wavy).toEqual([3]);
  });
});
