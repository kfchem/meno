import { describe, expect, it } from "vitest";
import type { Conformers } from "../../../../lib/roles/client";
import { chemMolblock } from "../../../../lib/roles/molblock";
import type { Model } from "../store/types";
import { etaBound } from "./etaBound";
import { blocksOf, moleculeOf } from "./make3d";

const L = 1.5;

/** Ferrocene drawn by hand: Fe 1, a bond from it to each of the ten carbons of two Kekule rings (11-15, 21-25). */
function ferroceneByHand(): Model {
  const atoms: Model["atoms"] = [{ id: 1, x: 0, y: 0, r: 0.9, el: "Fe" }];
  const bonds: Model["bonds"] = [];
  let id = 100;
  for (const [base, y] of [
    [11, L],
    [21, -L],
  ]) {
    for (let i = 0; i < 5; i++) atoms.push({ id: base + i, x: L * Math.cos((2 * Math.PI * i) / 5), y: y + 0.3 * L * Math.sin((2 * Math.PI * i) / 5), r: 0.9, el: "C" });
    for (let i = 0; i < 5; i++) bonds.push({ id: id++, a: base + i, b: base + ((i + 1) % 5), order: i === 0 || i === 2 ? 2 : 1 });
    for (let i = 0; i < 5; i++) bonds.push({ id: id++, a: 1, b: base + i, order: 1 });
  }
  return { atoms, bonds };
}

/** A metal with labels on it, each bonded to it. */
function withLabels(metal: string, labels: string[]): Model {
  return {
    atoms: [{ id: 1, x: 0, y: 0, r: 0.9, el: metal }, ...labels.map((el, k) => ({ id: 2 + k, x: L * Math.cos(k), y: L * Math.sin(k), r: 0.9, el }))],
    bonds: labels.map((_, k) => ({ id: 50 + k, a: 1, b: 2 + k, order: 1 as const })),
  };
}

describe("a ring bound to a metal through all its atoms, as the plugin is asked about it", () => {
  it("writes a hand-drawn ring's bonds to the metal as one multi-centre bond, its star after the drawing's atoms", () => {
    const drawn = ferroceneByHand();
    const asked = etaBound(drawn);
    // (the drawing's atoms first, in their order; a star for each ring after them)
    expect(asked.atoms.slice(0, drawn.atoms.length).map((a) => a.id)).toEqual(drawn.atoms.map((a) => a.id));
    expect(asked.atoms.slice(drawn.atoms.length).map((a) => a.el)).toEqual(["*", "*"]);
    // (no bond from the iron to a carbon is left; two to the stars, each over its ring)
    expect(asked.bonds.filter((b) => b.a === 1 || b.b === 1).every((b) => b.endpoints?.length === 5 && b.attach === "all")).toBe(true);
    expect(asked.bonds.filter((b) => b.endpoints).map((b) => [...b.endpoints!].sort((p, q) => p - q))).toEqual([
      [11, 12, 13, 14, 15],
      [21, 22, 23, 24, 25],
    ]);
    const block = chemMolblock(asked as never);
    expect(block).toContain("ENDPTS=(5 2 3 4 5 6) ATTACH=ALL");
    expect(block).toContain("ENDPTS=(5 7 8 9 10 11) ATTACH=ALL");
  });

  it("writes a Cp label on a metal as the ring bound through all its atoms, not as cyclopentadienyl bound by one", () => {
    const block = chemMolblock(etaBound(withLabels("Fe", ["Cp", "Cp"])) as never);
    expect(block.match(/ENDPTS=\(5 /g)?.length).toBe(2);
    // (and as a group, off a metal, still by one carbon: Cp-CH3)
    const methyl = etaBound({ atoms: [{ id: 1, x: 0, y: 0, r: 0.9, el: "C" }, { id: 2, x: L, y: 0, r: 0.9, el: "Cp" }], bonds: [{ id: 5, a: 1, b: 2, order: 1 }] });
    expect(chemMolblock(methyl as never)).not.toContain("ENDPTS");
  });

  it("writes a ligand named only in a complex (CO) on a metal as that ligand, its bond from the donor", () => {
    const asked = etaBound(withLabels("Cr", ["CO"]));
    expect(asked.atoms[1].abbrev).toBeTruthy();
    expect(asked.bonds[0]).toMatchObject({ a: 2, b: 1 });
    const block = chemMolblock(asked as never);
    // (the carbon as the dictionary has it, C- triply bonded to O+, its bond to Cr a coordination bond from it)
    expect(block).toMatch(/ C [-\d. ]+ CHG=-1/);
    expect(block).toMatch(/ O [-\d. ]+ CHG=1/);
    expect(block).toMatch(/M {2}V30 \d+ 9 2 1/);
  });

  it("leaves a structure with no such ring or label as it is", () => {
    const plain: Model = { atoms: [{ id: 1, x: 0, y: 0, r: 0.9, el: "Pd" }, { id: 2, x: L, y: 0, r: 0.9, el: "Cl" }], bonds: [{ id: 3, a: 1, b: 2, order: 1 }] };
    expect(etaBound(plain)).toEqual(plain);
  });
});

describe("a molecule in 3D made of one with a multi-centre bond", () => {
  it("leaves the stars out and numbers the rest on: atoms, bonds, frames and R or S", () => {
    const drawn = ferroceneByHand();
    const [block] = blocksOf(drawn, [1]);
    // (the drawing's own atoms tie it; the stars are not among them)
    expect(block.atoms).toEqual(drawn.atoms.map((a) => a.id));
    // what the plugin answers: the eleven atoms, two stars (11, 12), one hydrogen; a bond to each star
    const atoms = [{ el: "Fe", charge: 2 }, ...Array.from({ length: 10 }, () => ({ el: "C", charge: 0 })), { el: "*", charge: 0 }, { el: "*", charge: 0 }, { el: "H", charge: 0 }];
    const place = (i: number) => [i, 2 * i, 3 * i];
    const answer: Conformers = {
      atoms,
      bonds: [
        { a1: 0, a2: 11, order: 1 },
        { a1: 1, a2: 2, order: 1 },
        { a1: 0, a2: 12, order: 1 },
        { a1: 1, a2: 13, order: 1 },
      ],
      frames: [atoms.flatMap((_, i) => place(i))],
      stars: [11, 12],
      field: "UFF",
      smiles: "",
      cip: { atoms: { 13: "R" }, bonds: { 3: "Z" } },
      chosen: { atoms: {}, bonds: {} },
    };
    const m = moleculeOf(answer, block);
    expect(m.atoms.map((a) => a.el)).toEqual(["Fe", ...Array(10).fill("C"), "H"]);
    expect(m.atoms[11]).toMatchObject({ x: 13, y: 26, z: 39 });
    expect(m.bonds).toEqual([
      { a1: 1, a2: 2, order: 1 },
      { a1: 1, a2: 11, order: 1 },
    ]);
    expect(m.drawnFrom).toEqual([...drawn.atoms.map((a) => a.id), null]);
    expect(m.stereo).toEqual({ atoms: { 11: "R" }, bonds: { 1: "Z" } });
  });
});
