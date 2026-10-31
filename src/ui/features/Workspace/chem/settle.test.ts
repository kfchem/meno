import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { settleEquivalents } from "./settle";

type Atom = { el: string; charge: number };
type Bond = { a1: number; a2: number; order: number };
/** Geometries RDKit embedded, and atoms that, moved to each other's places, swap equivalent ones (scripts/conformers/made_by_rdkit.py). */
const MADE = JSON.parse(readFileSync(resolve(__dirname, "testdata/conformers.rdkit.json"), "utf8")) as {
  settle: { name: string; smiles: string; atoms: Atom[]; bonds: Bond[]; frame: number[]; moves: Record<string, number> }[];
};

/** The geometry with each atom of `moves` where the atom it names was. */
const moved = (frame: readonly number[], moves: Record<string, number>) => {
  const out = [...frame];
  for (const [a, b] of Object.entries(moves)) for (let d = 0; d < 3; d++) out[3 * Number(a) + d] = frame[3 * b + d];
  return out;
};
const farthest = (a: readonly number[], b: readonly number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

describe("equivalent atoms settled", () => {
  it.each(MADE.settle.map((c) => [c.name, c] as const))("puts back %s, where the first has them", (_, c) => {
    const swapped = moved(c.frame, c.moves);
    expect(farthest(swapped, c.frame)).toBeGreaterThan(0.5);
    const [first, second] = settleEquivalents(c.atoms, c.bonds, [c.frame, swapped]);
    expect(first).toEqual(c.frame);
    expect(farthest(second, c.frame)).toBeLessThan(1e-9);
  });

  it("never moves an atom that is not of a whole branch swapped: a CH2's carbon stays, its hydrogens change places", () => {
    const c = MADE.settle.find((x) => x.name === "a CH2's two hydrogens")!;
    const [, second] = settleEquivalents(c.atoms, c.bonds, [c.frame, moved(c.frame, c.moves)]);
    c.atoms.forEach((a, i) => {
      if (a.el !== "H") expect(second.slice(3 * i, 3 * i + 3)).toEqual(c.frame.slice(3 * i, 3 * i + 3));
    });
  });

  it("leaves a geometry alone where nothing is swapped, and one geometry as it is", () => {
    const c = MADE.settle.find((x) => x.name === "an isopropyl's methyls beside a stereocentre")!;
    expect(settleEquivalents(c.atoms, c.bonds, [c.frame, c.frame])[1]).toEqual(c.frame);
    expect(settleEquivalents(c.atoms, c.bonds, [c.frame])).toEqual([c.frame]);
  });

  it("tells a planar CH2's hydrogens apart by their places alone: which way round three bonds go is no way round there", () => {
    // (ethene, flat: the triple products at its carbons are nought, and a hair's noise must not decide its hydrogens)
    const atoms = [{ el: "C" }, { el: "C" }, { el: "H" }, { el: "H" }, { el: "H" }, { el: "H" }];
    const bonds = [{ a1: 0, a2: 1, order: 2 }, ...[2, 3].map((h) => ({ a1: 0, a2: h, order: 1 })), ...[4, 5].map((h) => ({ a1: 1, a2: h, order: 1 }))];
    const flat = [0, 0, 0, 1.33, 0, 0, -0.56, 0.92, 0, -0.56, -0.92, 0, 1.89, 0.92, 0, 1.89, -0.92, 0];
    for (const tilt of [1e-4, -1e-4]) {
      const swapped = moved(flat, { 2: 3, 3: 2 }).map((v, i) => (i === 3 * 2 + 2 ? tilt : v));
      const [, second] = settleEquivalents(atoms, bonds, [flat, swapped]);
      expect(farthest(second, flat)).toBeLessThan(1e-3);
    }
  });
});
