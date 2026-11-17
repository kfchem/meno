import { describe, expect, it } from "vitest";
import type { ChemClient, Conformers } from "../../../../lib/roles/client";
import { MOST_CONFORMERS } from "../../../../lib/chem/conformersSought";
import type { Model } from "../store/types";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { blocksOf, conformersGrowing } from "./make3d";

// Two parts alike as drawn - two butan-2-ols, no wedge - whose stereoisomers the page makes: R,R and R,S. Each part is searched as its own
// configuration says: the second in R,S is the mirror of the first, and the first's conformers copied for it would be the wrong hand.

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

/** A butan-2-ol's conformers as a search of it alone gives them: C C(O) C C, no hydrogens, one frame. */
const butanol: Conformers = {
  atoms: ["C", "C", "O", "C", "C"].map((el) => ({ el, charge: 0 })),
  bonds: [[0, 1], [1, 2], [1, 3], [3, 4]].map(([a1, a2]) => ({ a1, a2, order: 1 as const })),
  frames: [[0, 0, 0, 1.5, 0, 0, 2.1, 1.1, 0, 2.1, -1.2, 0, 3.6, -1.2, 0]],
  energies: [-0.05],
  field: "MMFF94",
  cip: { atoms: {}, bonds: {} },
  chosen: { atoms: {}, bonds: {} },
  smiles: "CC(O)CC",
};

describe("each part of a structure of several parts alike as drawn is searched as its own configuration says", () => {
  it("R,S: the second part's asking carries its own sense; R,R: the second part is the first's, asked for once", async () => {
    const whole = together(drawnFromSmiles("CC(O)CC"), drawnFromSmiles("CC(O)CC"));
    const [block] = blocksOf(whole, [whole.atoms[0].id]);
    // (the plugin that finds stereoisomers: each part's centre, atom 1 of the part - 1 and 6 of the whole - open)
    const centre = (atom: number, sense: 1 | -1) => ({ atom, neighbours: [atom - 1, atom + 1, atom + 2], sense });
    const asked: { centres: { atom: number; sense: number }[] }[] = [];
    const stereo = {
      request: async (op: string) => {
        if (op === "stereo_elements") return { read: true, elements: [1, 6].map((at) => ({ kind: "centre", at, state: "unspecified" })) };
        if (op === "stereoisomers") {
          return {
            free: false,
            isomers: [
              { configured: { centres: [centre(1, 1), centre(6, 1)], doubles: [] }, smiles: "RR" },
              { configured: { centres: [centre(1, 1), centre(6, -1)], doubles: [] }, smiles: "RS" },
            ],
          };
        }
        throw new Error(`no ${op} here`);
      },
    } as unknown as ChemClient;
    const chem = {
      request: async (_op: string, args: { isomers: { centres: { atom: number; sense: number }[] }[] }) => (asked.push(args.isomers[0]), { isomers: [butanol] }),
    } as unknown as ChemClient;
    const growth = await conformersGrowing(chem, stereo, block, "all", {}, { calculations: {} }, { window: 5, first: 10, most: MOST_CONFORMERS }, () => false);
    await growth.rest(() => {});
    const senses = (r: { centres: { atom: number; sense: number }[] }) => r.centres.map((c) => c.sense).join();
    // (R,R: only the first part asked; R,S: the first, and the second with its own sense - the mirror - asked of its own)
    expect(asked.some((r) => senses(r) === "-1")).toBe(true);
    expect(asked.filter((r) => senses(r) === "1").length).toBeGreaterThan(0);
    // (the second isomer says its second part was searched, not taken as the first's)
    const how = growth.first[1].how!;
    expect(how.find((r) => r.label === "Part 2")?.text ?? how.find((r) => r.label.startsWith("Part 2"))?.text).not.toMatch(/alike/);
    expect(growth.first[0].how!.find((r) => r.label === "Part 2")?.text).toMatch(/as part 1: alike/);
  });
});
