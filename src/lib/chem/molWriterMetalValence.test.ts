/**
 * The valence a MOL file says of a P, S or Se bonded to a metal: the core's (perception/hydrogens `LADDER`, its step chosen by its
 * bonds to non-metals alone), so that no reader of the file - a plugin asked for SMILES, a program the file is opened in - lifts it by
 * a rule of its own: a phosphine on Pd is P(III), no H, never P(V) with one.
 */
import { describe, expect, it } from "vitest";
import { writeMolfile, writeMolfile3d, type WriterModel } from "./molWriter";
import { readSmiles } from "./smiles";

/** A SMILES as drawn atoms, each at its own place, its bonds as single, double or triple as read (a phenyl's in Kekule form). */
function drawn(smiles: string): WriterModel {
  const s = readSmiles(smiles);
  return {
    atoms: s.atoms.map((a, i) => ({ id: i + 1, el: a.el, x: i, y: (i % 3) * 0.7, ...(a.charge ? { charge: a.charge } : {}) })),
    bonds: s.bonds.map((b, k) => ({ id: 1000 + k, a: b.a1 + 1, b: b.a2 + 1, order: (b.order === 4 ? 1 : b.order) as 1 | 2 | 3 })),
  };
}

/** Each atom's V3000 line, by its element and what it says of its valence ("" where it says none). */
const valences = (molfile: string) =>
  molfile
    .split("\n")
    .filter((l) => /^M {2}V30 \d+ [A-Z][a-z]? /.test(l) && !/BEGIN|END|COUNTS/.test(l))
    .map((l) => `${l.split(" ")[4]}${/VAL=(-?\d+)/.exec(l)?.[1] ?? ""}`);

describe("a P, S or Se bonded to a metal, as a MOL file says it", () => {
  it("says a phosphine's P on Pd has the valence of its four bonds: no H for a reader to add", () => {
    const v = valences(writeMolfile(drawn("Cl[Pd](Cl)P(c1ccccc1)(c1ccccc1)c1ccccc1"), { version: "V3000" }));
    expect(v.filter((x) => x.startsWith("P") && !x.startsWith("Pd"))).toEqual(["P4"]);
    // (and nothing else said: the carbons, chlorines and Pd as before)
    expect(v.filter((x) => /\d/.test(x))).toEqual(["P4"]);
  });

  it("says it of each P of Pd(PPh3)4, and of the P a label on a metal holds (PPh3, written out bound)", () => {
    const four = "[Pd](P(c1ccccc1)(c1ccccc1)c1ccccc1)(P(c1ccccc1)(c1ccccc1)c1ccccc1)(P(c1ccccc1)(c1ccccc1)c1ccccc1)P(c1ccccc1)(c1ccccc1)c1ccccc1";
    expect(valences(writeMolfile(drawn(four), { version: "V3000" })).filter((x) => x.startsWith("P") && !x.startsWith("Pd"))).toEqual(["P4", "P4", "P4", "P4"]);
    const labelled: WriterModel = {
      atoms: [
        { id: 1, el: "Pd", x: 0, y: 0 },
        { id: 2, el: "PPh3", x: 1.5, y: 0 },
        { id: 3, el: "Cl", x: -1.5, y: 0 },
      ],
      bonds: [
        { a: 1, b: 2, order: 1 },
        { a: 1, b: 3, order: 1 },
      ],
    };
    // (written out with its bond to Pd a coordination bond, which takes nothing of the P: the valence of its own three)
    expect(valences(writeMolfile(labelled, { version: "V3000" })).filter((x) => x.startsWith("P") && !x.startsWith("Pd"))).toEqual(["P3"]);
  });

  it("says it in V2000 too, in the valence field", () => {
    const v2000 = writeMolfile(drawn("Cl[Pd](Cl)P(C)(C)C"), { version: "V2000" });
    const pLine = v2000.split("\n").find((l) => / P {2}/.test(l))!;
    // (aaaddcccssshhhbbbvvv: the valence, the sixth field after the symbol)
    expect(pLine.slice(34).trim().split(/\s+/)[5]).toBe("4");
  });

  it("says nothing of a P on no metal, nor of one whose valence is set, nor of a sulfide S on a carbon", () => {
    expect(valences(writeMolfile(drawn("P(c1ccccc1)(c1ccccc1)c1ccccc1"), { version: "V3000" })).some((x) => /\d/.test(x))).toBe(false);
    expect(valences(writeMolfile(drawn("O=P(c1ccccc1)c1ccccc1"), { version: "V3000" })).some((x) => /\d/.test(x))).toBe(false);
    const set = drawn("Cl[Pd](Cl)P(C)(C)C");
    set.atoms = set.atoms.map((a) => (a.el === "P" ? { ...a, valence: 5 } : a));
    expect(valences(writeMolfile(set, { version: "V3000" })).filter((x) => x.startsWith("P") && !x.startsWith("Pd"))).toEqual(["P5"]);
    expect(valences(writeMolfile(drawn("CSC"), { version: "V3000" })).some((x) => /\d/.test(x))).toBe(false);
  });

  it("says a dimethyl sulfide's S on a metal has the valence of its three bonds, and a dative P on Pd its own three", () => {
    expect(valences(writeMolfile(drawn("C[S](C)[Pd](Cl)Cl"), { version: "V3000" })).filter((x) => x.startsWith("S"))).toEqual(["S3"]);
    const dative = drawn("Cl[Pd](Cl)P(C)(C)C");
    dative.bonds = dative.bonds.map((b) => (dative.atoms[b.a - 1].el === "Pd" && dative.atoms[b.b - 1].el === "P" ? { ...b, dative: true } : b));
    expect(valences(writeMolfile(dative, { version: "V3000" })).filter((x) => x.startsWith("P") && !x.startsWith("Pd"))).toEqual(["P3"]);
  });

  it("in 3D, says a P on a metal has the valence of its bonds, its hydrogens all atoms", () => {
    const atoms = [
      { el: "Pd", x: 0, y: 0, z: 0 },
      { el: "P", x: 2.3, y: 0, z: 0 },
      { el: "C", x: 3, y: 1.5, z: 0 },
      { el: "C", x: 3, y: -1.5, z: 0 },
      { el: "C", x: 3, y: 0, z: 1.5 },
    ];
    const bonds = [0, 2, 3, 4].map((j, k) => ({ a1: k === 0 ? 0 : 1, a2: k === 0 ? 1 : j, order: 1 }));
    const v = valences(writeMolfile3d(atoms, bonds, { version: "V3000" }));
    expect(v.filter((x) => /\d/.test(x))).toEqual(["P4"]);
  });
});
