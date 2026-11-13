import { describe, expect, it } from "vitest";
import type { Conformers } from "../../../../lib/roles/client";
import type { Model } from "../store/types";
import { blocksOf } from "./make3d";
import { configurationIn, lone, partsAlone, SUMMED, wholeOf, type PartAlone } from "./partsAlone";

/** A structure of several parts, each searched alone (chem/partsAlone): what each part is, and the whole put together of them. */

/** Sodium acetate drawn as one structure of two parts: CH3-C(=O)O- and Na+, the acetate first. */
const acetate: Model = {
  atoms: [
    { id: 1, x: 0, y: 0, r: 0.9, el: "C", joined: 1 },
    { id: 2, x: 1.3, y: 0.75, r: 0.9, el: "C", joined: 1 },
    { id: 3, x: 1.3, y: 2.25, r: 0.9, el: "O", joined: 1 },
    { id: 4, x: 2.6, y: 0, r: 0.9, el: "O", charge: -1, joined: 1 },
    { id: 5, x: 5, y: 0, r: 0.9, el: "Na", charge: 1, joined: 1 },
  ],
  bonds: [
    { id: 1, a: 1, b: 2, order: 1 },
    { id: 2, a: 2, b: 3, order: 2 },
    { id: 3, a: 2, b: 4, order: 1 },
  ],
} as Model;

/** Two methanols drawn as one structure, each drawn alike: C then O. */
const methanols: Model = {
  atoms: [
    { id: 1, x: 0, y: 0, r: 0.9, el: "C", joined: 2 },
    { id: 2, x: 1.3, y: 0.75, r: 0.9, el: "O", joined: 2 },
    { id: 3, x: 4, y: 0, r: 0.9, el: "C", joined: 2 },
    { id: 4, x: 5.3, y: 0.75, r: 0.9, el: "O", joined: 2 },
  ],
  bonds: [
    { id: 1, a: 1, b: 2, order: 1 },
    { id: 2, a: 3, b: 4, order: 1 },
  ],
} as Model;

/** A part's search's answer: its atoms - its drawn ones, then hydrogens - its frames and energies. */
const answer = (atoms: string[], bonds: [number, number][], frames: number[][], energies: number[]): Conformers => ({
  atoms: atoms.map((el) => ({ el, charge: 0 })),
  bonds: bonds.map(([a1, a2]) => ({ a1, a2, order: 1 as const })),
  frames,
  energies,
  field: "MMFF94",
  how: [{ label: "Rounds", text: "2 rounds, 20 tried: the last brought no new conformer within 5 kcal/mol of the lowest" }],
  cip: { atoms: { "0": "R" }, bonds: {} },
  chosen: { atoms: {}, bonds: {} },
  smiles: "x",
});
const at = (n: number, k: number) => Array.from({ length: 3 * n }, (_, i) => i + 100 * k);

describe("a structure's parts, each searched alone", () => {
  it("are its fragments, largest first, each written as the plugin is asked about it, its atoms and bonds by their places in the whole", () => {
    const [block] = blocksOf(acetate, [1]);
    const parts = partsAlone(block.part, block)!;
    expect(parts.map((p) => p.block.atoms)).toEqual([[1, 2, 3, 4], [5]]);
    expect(parts.map((p) => p.atoms)).toEqual([[0, 1, 2, 3], [4]]);
    expect(parts.map((p) => p.bonds)).toEqual([[0, 1, 2], []]);
    expect(parts.map((p) => p.block.part.atoms.map((a) => `${a.el}${a.charge ?? ""}`))).toEqual([["C", "C", "O", "O-1"], ["Na1"]]);
    // (one part: searched whole, as before)
    const [single] = blocksOf({ atoms: acetate.atoms.slice(0, 4).map((a) => ({ ...a, joined: undefined })), bonds: acetate.bonds } as Model, [1]);
    expect(partsAlone(single.part, single)).toBeNull();
  });

  it("are alike where they are written alike, atom for atom: searched once", () => {
    const [block] = blocksOf(methanols, [1]);
    expect(partsAlone(block.part, block)!.map((p) => p.alike)).toEqual([undefined, 0]);
  });

  it("each take the whole's configuration of what is theirs, by their own places", () => {
    const part = { atoms: [4, 5, 6, 7], bonds: [3, 4] };
    const c = { centres: [{ atom: 5, neighbours: [4, 6, 7], sense: 1 as const }, { atom: 1, neighbours: [0, 2, 3], sense: -1 as const }], doubles: [{ bond: 4, ends: [4, 7] as [number, number], cis: true }] };
    expect(configurationIn(c, part)).toEqual({ centres: [{ atom: 1, neighbours: [0, 2, 3], sense: 1 }], doubles: [{ bond: 1, ends: [0, 3], cis: true }] });
  });
});

describe("the whole, put together of its parts", () => {
  const [block] = blocksOf(acetate, [1]);
  const parts = partsAlone(block.part, block)!;

  it("is every part at its lowest first, then each other conformer of each part, the rest at their lowest - its energies its parts', summed", () => {
    // (acetate: its four drawn atoms and three hydrogens, two conformers; Na+: one atom, no search)
    const ac = answer(["C", "C", "O", "O", "H", "H", "H"], [[0, 1], [1, 2], [1, 3], [0, 4], [0, 5], [0, 6]], [at(7, 0), at(7, 1)], [-0.1, -0.09]);
    const na = lone(parts[1]);
    const whole = wholeOf(block, [{ part: parts[0], c: ac }, { part: parts[1], c: na }]);
    // (its drawn atoms where the drawing has them - Na+ fifth - then the acetate's hydrogens)
    expect(whole.atoms.map((a) => a.el)).toEqual(["C", "C", "O", "O", "Na", "H", "H", "H"]);
    expect(whole.bonds.slice(0, 3)).toEqual([{ a1: 0, a2: 1, order: 1 }, { a1: 1, a2: 2, order: 1 }, { a1: 1, a2: 3, order: 1 }]);
    expect(whole.bonds.slice(3)).toEqual([{ a1: 0, a2: 5, order: 1 }, { a1: 0, a2: 6, order: 1 }, { a1: 0, a2: 7, order: 1 }]);
    expect(whole.frames).toHaveLength(2);
    // (the second: the acetate's second conformer, Na+ where it stands)
    expect(whole.frames[1].slice(0, 12)).toEqual(at(7, 1).slice(0, 12));
    expect(whole.frames[1].slice(12, 15)).toEqual([0, 0, 0]);
    expect(whole.frames[1].slice(15)).toEqual(at(7, 1).slice(12));
    expect(whole.energies).toEqual([-0.1, -0.09]);
    expect(whole.cip.atoms).toEqual({ "0": "R" });
    expect(whole.how).toEqual([
      { label: "Searched", text: "each of its 2 parts alone" },
      { label: "Part 1: Rounds", text: "2 rounds, 20 tried: the last brought no new conformer within 5 kcal/mol of the lowest" },
      { label: "Part 2", text: "Na+: one atom, no search" },
      SUMMED,
    ]);
  });

  it("varies one of two alike parts alone: the other varied would be the same conformers, the parts exchanged", () => {
    const [w] = blocksOf(methanols, [1]);
    const [a, b] = partsAlone(w.part, w)! as [PartAlone, PartAlone];
    // (two flexible alike parts, three conformers each - its drawn C and O, a hydrogen after)
    const c = answer(["C", "O", "H"], [[0, 1], [1, 2]], [at(3, 0), at(3, 1), at(3, 2)], [0, 0.001, 0.002]);
    const whole = wholeOf(w, [{ part: a, c }, { part: b, c }]);
    expect(whole.frames).toHaveLength(3);
    expect(whole.how?.[2]).toEqual({ label: "Part 2", text: "as part 1: alike, searched once" });
    expect(whole.energies).toEqual([0, 0.001, 0.002]);
  });
});
