import { describe, expect, it } from "vitest";
import { layout2D, measureLaidOut } from "./engine";
import { perceive } from "./perceive";
import { drawnRingSets } from "./ringSets";
import { closedFaces, schlegelFaces } from "./schlegel";
import { c60, dodecahedrane } from "./testdata/polyhedra";
import { fromSmiles } from "./testdata/fromSmiles";

describe("a ring system that closes on itself", () => {
  it("has its faces found: C60's twelve pentagons and twenty hexagons, the last the one its smallest rings leave out", () => {
    const mol = perceive(c60());
    expect(mol.n).toBe(60);
    const faces = closedFaces(mol, mol.systems[0])!;
    expect(faces).toHaveLength(32);
    expect(faces.filter((f) => f.length === 5)).toHaveLength(12);
    expect(faces.filter((f) => f.length === 6)).toHaveLength(20);
    // (round each face in order: each atom bonded to the next)
    for (const f of faces) f.forEach((a, i) => expect(mol.neighbours[a]).toContain(f[(i + 1) % f.length]));
  });

  it("is no closed surface where its rings are fused flat, and is drawn as a cage at twenty atoms or fewer", () => {
    // (naphthalene's edge round both rings is the face they leave out, ten long; and two of its atoms have three bonds)
    for (const smiles of ["c1ccc2ccccc2c1", "c1ccc2cc3ccccc3cc2c1", "C1CC2CCC1C2"]) {
      const m = perceive(fromSmiles(smiles));
      expect(closedFaces(m, m.systems[0]), smiles).toBeNull();
    }
    const cubane = perceive(fromSmiles("C12C3C4C1C5C2C3C45"));
    expect(closedFaces(cubane, cubane.systems[0])).not.toBeNull();
    expect(schlegelFaces(cubane, cubane.systems[0])).toBeNull();
    const d = perceive(dodecahedrane());
    expect(d.n).toBe(20);
    expect(closedFaces(d, d.systems[0])).toHaveLength(12);
    expect(schlegelFaces(d, d.systems[0])).toBeNull();
  });

  it("draws C60 as its Schlegel diagram: no bond crossing another, no atom on another or on a bond", () => {
    const input = c60();
    const m = measureLaidOut(input, layout2D(input));
    expect(m.crossings).toBe(0);
    expect(m.overlaps).toBe(0);
    expect(m.clashes).toBe(0);
  });

  it("is not tried flat with each of its smallest sets of rings, all of them alike seen through a face", () => {
    const mol = perceive(c60());
    let flat = 0;
    expect(drawnRingSets(mol, () => (flat++, { pos: new Map() }))).toBe(mol);
    expect(flat).toBe(0);
  });
});
