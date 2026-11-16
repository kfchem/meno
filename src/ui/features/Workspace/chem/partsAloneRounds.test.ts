import { describe, expect, it } from "vitest";
import type { ChemClient, Conformers } from "../../../../lib/roles/client";
import { conformersSoughtOf, MOST_CONFORMERS } from "../../../../lib/chem/conformersSought";
import { readMolfile } from "../../../../lib/chem/ctfile";
import type { Model } from "../store/types";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { blocksOf, conformersGrowing, pageRounds, partRounds, type PageRounds } from "./make3d";
import { partsAlone } from "./partsAlone";

// Each part of a structure of several parts is searched in rounds of its own: its first round, where the chemist has chosen none, the
// part's own - as the page asks it of the part drawn alone - not the whole's. Found in the chemistry check.

/** The drawings put down as one structure of several parts, each moved right of the one before, their ids apart. */
const together = (...drawn: Model[]): Model => {
  const atoms: Model["atoms"] = [];
  const bonds: Model["bonds"] = [];
  drawn.forEach((m, k) => {
    const id = (n: number) => n + 1000 * (k + 1);
    for (const a of m.atoms) atoms.push({ ...a, id: id(a.id), x: a.x + 10 * k, joined: 1 });
    for (const b of m.bonds) bonds.push({ ...b, id: id(b.id), a: id(b.a), b: id(b.b) });
  });
  return { atoms, bonds } as Model;
};

/** A stand-in for the plugin: one conformer of whatever it is asked about, each atom on a line; each first ask's count kept. */
const standIn = (firsts: Map<string, number>) =>
  ({
    request: async (_op: string, args: { molblock: string; count: number; draw: number }) => {
      if (!firsts.has(args.molblock)) firsts.set(args.molblock, args.count);
      const ct = readMolfile(args.molblock)!;
      const c: Conformers = {
        atoms: ct.atoms.map((a) => ({ el: a.symbol, charge: a.charge ?? 0 })),
        bonds: ct.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: 1 as const })),
        frames: [ct.atoms.flatMap((_, i) => [1.5 * i, 0, 0])],
        energies: [0],
        field: "MMFF94",
        cip: { atoms: {}, bonds: {} },
        chosen: { atoms: {}, bonds: {} },
        smiles: "X",
      };
      return { isomers: [c] };
    },
  }) as unknown as ChemClient;
const noStereo = {
  request: async (op: string) => {
    if (op === "stereo_elements") return { read: true, elements: [] };
    if (op === "stereoisomers") return { free: false, isomers: [{ configured: { centres: [], doubles: [] }, smiles: "" }] };
    throw new Error(`no ${op} here`);
  },
} as unknown as ChemClient;

const DIOL = "OCCCCCCCCO";
const ACID = "CC(=O)O";

describe("a part is searched in rounds of its own", () => {
  const whole = together(drawnFromSmiles(DIOL), drawnFromSmiles(ACID));
  const [block] = blocksOf(whole, [whole.atoms[0].id]);
  const parts = partsAlone(block.part, block)!;
  const own = parts.map((p) => conformersSoughtOf(p.block.molblock)!);

  it("a small part beside a large one: its own first round is not the whole's (else the test tells nothing)", () => {
    const first = (pageRounds(block, {}, true) as PageRounds).first;
    expect(own[1]).toBeLessThan(first);
    expect(new Set(own).size).toBe(2);
  });
  it("pageRounds says when the first round is the chemist's own", () => {
    expect(pageRounds(block, {}, true)).not.toHaveProperty("firstChosen");
    expect(pageRounds(block, { first3d: 120 }, true)).toMatchObject({ first: 120, firstChosen: true });
    expect(pageRounds(block, { first3d: 0 }, true)).not.toHaveProperty("firstChosen");
  });
  it("partRounds: the part's own first, the whole's window and most; a chosen first kept as chosen", () => {
    const rounds = { window: 2.5, first: 200, most: 1000 };
    expect(parts.map((p) => partRounds(rounds, p.block))).toEqual(own.map((first) => ({ window: 2.5, first: Math.min(first, 1000), most: 1000 })));
    expect(partRounds({ ...rounds, most: 3 }, parts[0].block).first).toBeLessThanOrEqual(3);
    expect(partRounds({ ...rounds, firstChosen: true }, parts[0].block)).toEqual({ ...rounds, firstChosen: true });
  });
  it("conformersGrowing asks each part's first round as that part drawn alone would be asked", async () => {
    const firsts = new Map<string, number>();
    const rounds = pageRounds(block, {}, true) as PageRounds;
    const growth = await conformersGrowing(standIn(firsts), noStereo, block, "one", {}, { calculations: {} }, rounds, () => false);
    await growth.rest(() => {});
    expect(parts.map((p) => firsts.get(p.block.molblock))).toEqual(parts.map((p) => (pageRounds(p.block, {}, true) as PageRounds).first));
    expect(firsts.has(block.molblock)).toBe(false);
  });
  it("conformersGrowing asks every part's first round as the chemist chose it", async () => {
    const firsts = new Map<string, number>();
    const rounds = pageRounds(block, { first3d: 120 }, true) as PageRounds;
    const growth = await conformersGrowing(standIn(firsts), noStereo, block, "one", {}, { calculations: {} }, rounds, () => false);
    await growth.rest(() => {});
    expect(parts.map((p) => firsts.get(p.block.molblock))).toEqual([120, 120]);
  });
  it("a structure of one part is asked as before, by the whole's rounds", async () => {
    const one = drawnFromSmiles(DIOL);
    const [b] = blocksOf(one, [one.atoms[0].id]);
    const firsts = new Map<string, number>();
    const rounds = { window: 3, first: 10, most: MOST_CONFORMERS };
    const growth = await conformersGrowing(standIn(firsts), noStereo, b, "one", {}, { calculations: {} }, rounds, () => false);
    await growth.rest(() => {});
    expect([...firsts.values()]).toEqual([10]);
  });
});
