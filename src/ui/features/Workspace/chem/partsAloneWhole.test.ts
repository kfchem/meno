import { describe, expect, it } from "vitest";
import type { Conformers } from "../../../../lib/roles/client";
import type { Model } from "../store/types";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { blocksOf } from "./make3d";
import { partsAlone, wholeOf } from "./partsAlone";

// The whole put together of two different parts, each searched: its energies the parts' summed, its field and method the searched parts', its labels and SMILES the parts' each on its own places.

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

describe("the whole of two different parts, each searched", () => {
  const whole = together(drawnFromSmiles("CC(=O)O"), drawnFromSmiles("CCO"));
  const [block] = blocksOf(whole, [whole.atoms[0].id]);
  const parts = partsAlone(block.part, block)!;
  /** What a search of one part gives: its drawn atoms as they are, `frames` frames, the energies given, cip labels on its atom 0 and its bond 1. */
  const searched = (k: number, energies: number[] | undefined, more: Partial<Conformers> = {}): Conformers => {
    const own = parts[k].block.part;
    const index = new Map(own.atoms.map((a, i) => [a.id, i]));
    return {
      atoms: own.atoms.map((a) => ({ el: a.el, charge: 0 })),
      bonds: own.bonds.map((b) => ({ a1: index.get(b.a)!, a2: index.get(b.b)!, order: 1 as const })),
      frames: (energies ?? [0, 0]).map((_, n) => own.atoms.flatMap((_a, i) => [i + 100 * n, 0, 0])),
      ...(energies ? { energies } : {}),
      field: "MMFF94",
      cip: { atoms: { "0": `a${k}` }, bonds: { "1": `b${k}` } },
      chosen: { atoms: { "0": `a${k}` }, bonds: {} },
      smiles: `s${k}`,
      ...more,
    };
  };

  it("has its energies the parts' summed, whatever the parts' lowest are", () => {
    const w = wholeOf(block, [{ part: parts[0], c: searched(0, [-0.1, -0.09]) }, { part: parts[1], c: searched(1, [-0.05, -0.04]) }]);
    expect(w.frames).toHaveLength(3);
    expect(w.energies!.map((e) => Math.round(e * 1e6) / 1e6)).toEqual([-0.15, -0.14, -0.14]);
  });

  it("has no energies where a part has none, and does not fail on it", () => {
    const w = wholeOf(block, [{ part: parts[0], c: searched(0, [-0.1, -0.09]) }, { part: parts[1], c: searched(1, undefined) }]);
    expect(w.energies).toBeUndefined();
  });

  it("has the field and the method of a searched part", () => {
    const w = wholeOf(block, [{ part: parts[0], c: searched(0, [-0.1], { method: "ETKDG" }) }, { part: parts[1], c: searched(1, [-0.05]) }]);
    expect([w.field, w.method]).toEqual(["MMFF94", "ETKDG"]);
  });

  it("has each part's labels and SMILES on the whole's places: the second part's atom 0 and bond 1 where they stand in the whole", () => {
    const w = wholeOf(block, [{ part: parts[0], c: searched(0, [-0.1]) }, { part: parts[1], c: searched(1, [-0.05]) }]);
    expect(w.cip.atoms).toEqual({ [String(parts[0].atoms[0])]: "a0", [String(parts[1].atoms[0])]: "a1" });
    expect(w.cip.bonds).toEqual({ [String(parts[0].bonds[1])]: "b0", [String(parts[1].bonds[1])]: "b1" });
    expect(w.smiles).toBe("s0.s1");
  });
});
