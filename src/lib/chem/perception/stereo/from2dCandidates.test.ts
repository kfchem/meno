/**
 * The reader reads a configuration only where the core's candidates put a centre (./candidates): a wedge at a metal of the d or
 * f block, or at an N+ with an H, states none, and says why; a centre of four groups or of three and a lone pair it keeps reads
 * as before. Drawn by the layout engine from SMILES, as the chemist's drawing would be.
 */
import { describe, expect, it } from "vitest";
import { layout2D } from "../../../layout/engine";
import { drawnOf } from "../../../layout/readBack";
import { readStereo, unreadWhy, unsureStereo } from "../../../layout/drawn";
import { smilesInput } from "../../../layout/smilesInput";

const drawn = (smiles: string) => {
  const input = smilesInput(smiles);
  const d = drawnOf(input, layout2D(input));
  // (each atom's charge, as the drawing carries it)
  input.atoms.forEach((a, i) => a.charge && (d.atoms[i] = { ...d.atoms[i], charge: a.charge }));
  return d;
};
/** The atoms read as centres, by element, and the words at each atom a wedge is narrow at that is not read. */
const read = (smiles: string) => {
  const d = drawn(smiles);
  const r = readStereo(d.atoms, d.bonds);
  const wedged = [...new Set(d.bonds.flatMap((b) => (b.wedge ? [b.wedge.narrow] : [])))];
  return {
    centres: [...r.tetra.keys()].map((i) => d.atoms[i].el ?? "C").sort(),
    unread: wedged.filter((c) => !r.tetra.has(c)).map((c) => unreadWhy(d.atoms, d.bonds, c)),
    unsure: unsureStereo(d.atoms, d.bonds).atoms.map((i) => d.atoms[i].el ?? "C"),
  };
};

describe("the reader takes a centre where the core's candidates put one", () => {
  it("a wedge at a d-block metal of four states no configuration, and says it is a metal", () => {
    for (const smiles of ["C[Pt@](Cl)(N)Br", "C[Fe@](Cl)(N)Br"]) {
      const r = read(smiles);
      expect(r.centres, smiles).toEqual([]);
      expect(r.unsure, smiles).toEqual([]);
      for (const why of r.unread) expect(why, smiles).toBe("it is a metal, whose groups are not surely tetrahedral, so a wedge at it states none");
    }
  });

  it("a wedge at an N+ with an H states none: it loses its configuration through the free amine", () => {
    const r = read("C[N@@H+](CC)CCC");
    expect(r.centres).toEqual([]);
    for (const why of r.unread) expect(why).toBe("it is an N+ with an H, which loses its configuration through the free amine (Meno's rule), so a wedge at it states none");
  });

  it("a quaternary ammonium, a phosphonium with an H, a silane, a sulfoxide, a sulfonium, a phosphine and a carbon read as before", () => {
    expect(read("C[N@+](CC)(CCC)Cc1ccccc1").centres).toEqual(["N"]);
    expect(read("C[P@@H+](CC)c1ccccc1").centres).toEqual(["P"]);
    expect(read("C[Si@](Cl)(CC)c1ccccc1").centres).toEqual(["Si"]);
    expect(read("C[S@](=O)c1ccccc1").centres).toEqual(["S"]);
    expect(read("C[S@+](CC)c1ccccc1").centres).toEqual(["S"]);
    expect(read("C[P@](CC)c1ccccc1").centres).toEqual(["P"]);
    expect(read("C[C@H](O)CC").centres).toEqual(["C"]);
  });
});
