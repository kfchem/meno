// Held beside atomMapStep.test.ts: an Atom map's side of several structures is placed where the map sets them and keeps none of its parts' measures - they were of the parts' own places.
import { describe, expect, it } from "vitest";
import { geometryKey } from "../../../../lib/entry";
import type { Molecule } from "../../../../lib/chem/molecule";
import { sn2 } from "../../../../lib/chem/reactionMap.fixtures";
import type { SetEntry } from "./entries";
import { runMenoPair } from "./meno";

const entryOf = (m: Molecule, compound: number, extra: Partial<SetEntry> = {}): SetEntry =>
  ({ compound, number: 1, atoms: m.atoms, bonds: m.bonds, xyz: m.atoms.flatMap((a) => [a.x, a.y, a.z]), ...extra }) as SetEntry;

describe("Atom map, a side of several structures", () => {
  it("takes none of its parts' measures: each was of the part's own places, not of the places the map sets", () => {
    const { reactant, product } = sn2();
    const br = product.atoms.findIndex((a) => a.el === "Br");
    const keep = (idx: number[]): Molecule => ({
      atoms: idx.map((i) => product.atoms[i]),
      bonds: product.bonds.filter((b) => idx.includes(b.a1) && idx.includes(b.a2)).map((b) => ({ ...b, a1: idx.indexOf(b.a1), a2: idx.indexOf(b.a2) })),
    });
    const methyl = keep(product.atoms.map((_, i) => i).filter((i) => i !== br));
    const xyz = methyl.atoms.flatMap((a) => [a.x, a.y, a.z]);
    const measure = { "distance 1-2": { value: 1.78, unit: "\u00c5", at: { geometry: geometryKey(xyz) }, status: "computed" } };
    const parts = [entryOf(methyl, 0, { name: "chloromethane", properties: measure } as Partial<SetEntry>), entryOf(keep([br]), 1, { name: "bromide" } as Partial<SetEntry>)];
    const o = runMenoPair("atom-map", { entries: parts, holds: "molecules" }, { entries: [entryOf(reactant, 0)], holds: "molecules" }, { moleculesAre: "together", referenceIs: "each", bonds: "change" });
    if (!o.ok) throw new Error(o.said);
    expect(o.kept).toHaveLength(1);
    expect(Object.keys(o.kept[0].properties ?? {}).filter((n) => /^(distance|angle|dihedral) /.test(n))).toEqual([]);
  });
});
