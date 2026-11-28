import { describe, expect, it } from "vitest";
import { readSmiles, smilesWritten, writeSmiles, type Smiles, type SmilesAtomOut } from "./smiles";
import { implicitHydrogens } from "./molecule";
import { identityText } from "./identity";
import { cipInput } from "./cip/testdata/cipFrom";

/** A structure read from a SMILES written in Kekulé form, as the writer takes it: each atom's H counted, its configuration kept. */
function out(s: Smiles): SmilesAtomOut[] {
  const sum = s.atoms.map(() => 0);
  for (const b of s.bonds) {
    sum[b.a1] += b.order;
    sum[b.a2] += b.order;
  }
  return s.atoms.map((a, i) => ({
    el: a.el,
    hs: a.hs ?? implicitHydrogens(a.el, sum[i], a.charge ?? 0),
    ...(a.charge ? { charge: a.charge } : {}),
    ...(a.isotope ? { isotope: a.isotope } : {}),
    ...(a.tetra ? { tetra: a.tetra } : {}),
  }));
}
const written = (smiles: string, start = 0) => {
  const s = readSmiles(smiles);
  return writeSmiles(out(s), s.bonds, start);
};
const same = (p: string, q: string) => identityText(cipInput(p)) === identityText(cipInput(q));

describe("a tetrahedral centre written with its @ or @@ (OpenSMILES)", () => {
  // (L-alanine, N[C@@H](C)C(=O)O: from its N, the order is N, H, CH3, COOH as read)
  it("writes a centre as it was read, where the walk takes its neighbours in the same order", () => {
    expect(written("N[C@@H](C)C(=O)O")).toBe("N[C@@H](C)C(=O)O");
  });
  it("turns the mark for each swap of the order its neighbours are written in: its methyl written before it", () => {
    // (from the methyl: CH3, H, N, COOH - one swap of N and CH3 from the order read, so @: C[C@H](N)C(=O)O, L-alanine as it is often written)
    expect(written("N[C@@H](C)C(=O)O", 2)).toBe("C[C@H](N)C(=O)O");
  });
  it("writes a centre written first with its H the atom looked from", () => {
    // (H, N, CH3, COOH: N and H swapped from the order read, so @)
    expect(written("N[C@@H](C)C(=O)O", 1)).toBe("[C@H](N)(C)C(=O)O");
  });
  it("counts a ring-closure digit at a centre where the digit comes", () => {
    // (read: C4, H, O (its digit), CH3 with @@; written from the methyl: CH3, H, O (its digit), C4 - one swap, so @)
    expect(written("O1CCCC[C@@H]1C", 6)).toBe("C[C@H]1CCCCO1");
  });
  it("writes a sulfoxide's S, its lone pair where the reader puts it, and never first", () => {
    // (read: C, lone pair, O, CH2 with @; written from the ethyl's end: CH2, lone pair, CH3, O - an even permutation, so @)
    expect(written("C[S@](=O)CC", 4)).toBe("CC[S@](C)=O");
    const first = written("C[S@](=O)CC", 1);
    expect(first.startsWith("[S")).toBe(false);
    expect(same(first, "C[S@](=O)CC")).toBe(true);
  });
  it("leaves unmarked a centre given no configuration, and one whose neighbours are not the atom's own", () => {
    expect(written("NC(C)C(=O)O")).toBe("NC(C)C(=O)O");
    const s = readSmiles("N[C@@H](C)C(=O)O");
    const atoms = out(s).map((a, i) => (i === 1 ? { ...a, tetra: { neighbours: [0, 2, 4, -1], volume: 1 as const } } : a));
    expect(smilesWritten(atoms, s.bonds, 0)).toEqual({ text: "NC(C)C(=O)O", unwritten: { centres: [1], bonds: [] } });
  });
});

describe("a double bond's cis or trans written with / and \\ (OpenSMILES)", () => {
  it("writes trans and cis from either end", () => {
    expect(written("F/C=C/F")).toBe("F/C=C/F");
    expect(written("F/C=C\\F")).toBe("F/C=C\\F");
    expect(written("F/C=C/F", 3)).toBe("F/C=C/F");
    expect(written("F/C=C\\F", 3)).toBe("F/C=C\\F");
  });
  it("marks the single bond between two double bonds of a chain once, for both", () => {
    // ((2E,4E)- and (2Z,4E)-hexa-2,4-diene: the C3-C4 bond's one mark serves both)
    expect(written("C/C=C/C=C/C")).toBe("C/C=C/C=C/C");
    expect(written("C/C=C\\C=C\\C")).toBe("C/C=C\\C=C\\C");
  });
  it("writes a ring's double bond with its mark, where a ring of eight states it", () => {
    expect(written("C1CCC/C=C/CC1")).toBe("C1CCC/C=C/CC1");
    expect(written("C1CCC/C=C\\CC1")).toBe("C1CCC/C=C\\CC1");
  });
  it("leaves an open double bond unmarked, and never states one through a neighbour's marks", () => {
    expect(written("C/C=C/C=CC")).toBe("C/C=C/C=CC");
    // (octa-2,4,6-triene with its middle double bond open: both its ends' single bonds would be marked for the other two,
    //  which would state it - so the second given is not written, and said)
    const s = readSmiles("C/C=C/C=C/C=C/C");
    const bonds = s.bonds.map((b) => (b.a1 === 3 && b.a2 === 4 ? { ...b, cisTrans: undefined } : b));
    const w = smilesWritten(out(s), bonds, 0);
    const back = readSmiles(w.text);
    expect(back.bonds.find((b) => b.a1 === 3 && b.a2 === 4)?.cisTrans).toBeUndefined();
    expect(w.unwritten.bonds).toEqual([bonds.findIndex((b) => b.a1 === 5 && b.a2 === 6)]);
  });
});

// Made-up structures with every kind of case: a centre first, with its H, with ring-closure digits (two at one atom), with a
// neighbour written before it; a lone pair's centre; double bonds alone, in chains, in rings, with two groups on an end, and
// beside a centre.
const MADE_UP = [
  "N[C@@H](C)C(=O)O",
  "C[C@@H](O)[C@H](F)CC",
  "O1CCCC[C@@H]1C",
  "[C@@H]1(F)CCCC[C@H]1Cl",
  "F[C@]12CCC[C@@]1(Cl)CCC2",
  "C[S@](=O)CC",
  "C[S@@](=O)C1=CC=CC=C1",
  "C[P@](CC)C1=CC=CC=C1",
  "C[C@H]1[N@](Cl)C1",
  "O[C@@H]1CC[C@H](CC1)N",
  "F/C=C/F",
  "C/C=C\\C=C\\C",
  "C/C(Cl)=C(/F)Br",
  "C1CCC/C=C/CC1",
  "C/1=C/CCCCCC1",
  "C/C=C/[C@@H](O)CC",
  "OC/C=C(/C)\\C=C\\[C@H](N)C",
];

describe("the round trip: read(write(m)) is m, from every start", () => {
  for (const smiles of MADE_UP) {
    it(smiles, () => {
      const s = readSmiles(smiles);
      for (let start = 0; start < s.atoms.length; start++) {
        const w = smilesWritten(out(s), s.bonds, start);
        expect(w.unwritten, `${smiles} from ${start}: ${w.text}`).toEqual({ centres: [], bonds: [] });
        expect(same(w.text, smiles), `${smiles} from ${start}: ${w.text}`).toBe(true);
      }
    });
  }
});

describe("each configuration turned over is written apart", () => {
  for (const smiles of MADE_UP) {
    it(smiles, () => {
      const s = readSmiles(smiles);
      const base = writeSmiles(out(s), s.bonds, 0);
      const turns = [
        ...s.atoms.flatMap((a, i) => (a.tetra ? [{ ...s, atoms: s.atoms.map((b, j) => (j === i ? { ...b, tetra: { ...a.tetra!, volume: -a.tetra!.volume as 1 | -1 } } : b)) }] : [])),
        ...s.bonds.flatMap((b, k) => (b.cisTrans ? [{ ...s, bonds: s.bonds.map((c, j) => (j === k ? { ...c, cisTrans: { ...b.cisTrans!, cis: !b.cisTrans!.cis } } : c)) }] : [])),
      ];
      expect(turns.length).toBeGreaterThan(0);
      for (const t of turns) {
        const other = writeSmiles(out(t), t.bonds, 0);
        expect(other).not.toBe(base);
        expect(same(other, base), `${smiles}: ${other}`).toBe(false);
        // (and reads back as the structure turned: written again, the same text)
        const again = readSmiles(other);
        expect(writeSmiles(out(again), again.bonds, 0)).toBe(other);
      }
    });
  }
});
