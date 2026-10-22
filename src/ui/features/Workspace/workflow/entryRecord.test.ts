import { describe, expect, it } from "vitest";
import { geometryKey } from "../../../../lib/entry";
import { entryOfSet, type SetEntry } from "./entries";
import { constitutionOf, runMeno } from "./meno";
import { speciesKept } from "./run";
import type { StepKind } from "./kinds";

/** Water as a step's entry: conformer `number` of compound 0, its H opened out by `k`, its energy `e` (hartrees). */
function water(number: number, k: number, e?: number, extra: Partial<SetEntry> = {}): SetEntry {
  return {
    compound: 0,
    number,
    atoms: [{ el: "O" }, { el: "H" }, { el: "H" }],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    xyz: [0, 0, 0, 0.96, 0, 0, -0.24, 0.93 + k, 0],
    ...(e != null ? { energy: e } : {}),
    ...extra,
  } as SetEntry;
}

describe("a step's entry read as Meno's entry record", () => {
  it("keeps its energy as a property in hartrees, at its geometry; its species by the one rule; its molecule as its lineage", () => {
    const e = water(2, 0.1, -76.4, { charge: -1, multiplicity: 2, degeneracy: 3, name: "w", from: 7, frame: 1 });
    const entry = entryOfSet(e, "x");
    expect(entry.properties.energy).toEqual({ value: -76.4, unit: "Eh", at: { geometry: geometryKey(e.xyz) }, status: "computed" });
    expect(entry.properties.degeneracy.value).toBe(3);
    expect(entry.properties.group.value).toBe("a");
    expect(entry.properties.number.value).toBe(2);
    expect(entry.species).toMatchObject({ charge: -1, multiplicity: 2, from: { charge: "given", multiplicity: "given" } });
    expect(entry.from).toEqual(["molecule:7#1"]);
    expect(entry.structure.atoms.map((a) => a.el)).toEqual(["O", "H", "H"]);
  });
});

describe("the fixed numbering, on the steps there are", () => {
  // (docs/WORKFLOWS-FOUNDATION.md, *The numbering is fixed*: no step renumbers an entry's atoms. Each perceived
  //  first, as a run asks it - water, no stereo - for the steps that need to know which stereoisomer it is)
  const stereo = { perceived: true as const, elements: [], key: "O", by: { plugin: "rdkit", version: "0.1.7" } };
  const set = [water(1, 0, -76.40, { stereo }), water(2, 0.3, -76.399, { stereo }), water(3, 0.6, -76.39, { stereo })];
  const kinds: StepKind[] = ["as-conformers", "energy-window", "duplicates", "populations", "choose"];
  for (const kind of kinds) {
    it(`${kind} hands on every entry's atoms and bonds in the order they came in`, () => {
      const out = runMeno(kind, set, "conformers");
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      for (const e of [...out.kept, ...out.aside]) {
        expect(e.atoms).toEqual(set[0].atoms);
        expect(e.bonds).toEqual(set[0].bonds);
      }
    });
  }
});

describe("a molecule's species through Meno's own steps", () => {
  it("tells an anion read from a calculation from its neutral, though its atoms carry no charge", () => {
    expect(constitutionOf(water(1, 0, undefined, { charge: -1, multiplicity: 2 }))).not.toBe(constitutionOf(water(1, 0)));
    const out = runMeno("duplicates", [water(1, 0, -76.4, { charge: -1, multiplicity: 2 }), water(2, 0, -76.4)], "molecules");
    expect(out.ok && out.kept.length).toBe(2);
  });

  it("keeps the charge and spin a calculation said, where a step of Meno's own hands the entry on", () => {
    expect(speciesKept(water(1, 0, undefined, { charge: -1, multiplicity: 2 }))).toEqual({ calc: { readers: [], charge: -1, multiplicity: 2 } });
    expect(speciesKept(water(1, 0))).toEqual({});
  });
});
