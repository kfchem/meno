import { describe, expect, it } from "vitest";
import type { FactAtom, StructureFacts } from "../../../../lib/roles/client";
import { checked, partFormula, type Check } from "./checkStructures";

const atom = (el: string, z: number, more: Partial<FactAtom> = {}): FactAtom => ({ el, z, charge: 0, valence: 4, most: 4, radicals: 0, part: 0, ...more });
const read = (atoms: FactAtom[], problem?: string): StructureFacts => ({ read: true, atoms, ...(problem ? { problem } : {}) });
const none = new Set<Check>();

describe("Check structures, Meno's", () => {
  it("keeps as drawn a structure with nothing to find", () => {
    expect(checked(read([atom("C", 6), atom("O", 8, { valence: 2, most: 2 })]), 1, none, "RDKit")).toEqual({ as: "drawn" });
  });

  it("finds, in turn, more than one part, an atom with too many bonds, a part with no electrons, a radical", () => {
    const salt = read([atom("Na", 11, { charge: 1, valence: 0, most: undefined }), atom("Cl", 17, { charge: -1, valence: 0, most: 0, part: 1 })]);
    expect(checked(salt, 2, none, "RDKit")).toEqual({ aside: "2 parts (a salt, or a mixture)", kind: "parts" });
    const five = read([atom("C", 6, { valence: 5 }), atom("N", 7, { valence: 4, most: 3 })], "SANITIZE_PROPERTIES");
    expect(checked(five, 1, none, "RDKit")).toEqual({ aside: "an atom with more bonds than it can have (C, N)", kind: "valence" });
    const proton = read([atom("H", 1, { charge: 1, valence: 0, most: 0 })]);
    expect(checked(proton, 1, none, "RDKit")).toEqual({ aside: "a part with no electrons (H+)", kind: "no electrons" });
    const methyl = read([atom("C", 6, { valence: 3, radicals: 1 })]);
    expect(checked(methyl, 1, none, "RDKit")).toEqual({ aside: "a radical: unpaired electrons on C", kind: "radical" });
    // (the first found: a salt with a radical in it, a salt)
    expect(checked(read([atom("C", 6, { radicals: 1 }), atom("Na", 11, { charge: 1, part: 1 })]), 2, none, "RDKit")).toMatchObject({ aside: "2 parts (a salt, or a mixture)" });
  });

  it("says in the toolkit's words only what the toolkit alone found: what it could not make sense of, or read", () => {
    expect(checked(read([atom("C", 6)], "SANITIZE_KEKULIZE"), 1, none, "RDKit")).toEqual({ aside: "RDKit could not read it (SANITIZE_KEKULIZE)", kind: "valence" });
    expect(checked({ read: false }, 1, none, "RDKit")).toEqual({ aside: "RDKit could not read it", kind: "unreadable" });
  });

  it("looks for none of what its options keep", () => {
    const all = read([atom("C", 6, { valence: 5, radicals: 1 }), atom("H", 1, { charge: 1, valence: 0, most: 0, part: 1 })]);
    expect(checked(all, 2, new Set<Check>(["parts", "valence", "electrons", "radicals"]), "RDKit")).toEqual({ as: "drawn" });
    expect(checked(all, 2, new Set<Check>(["parts", "valence", "electrons"]), "RDKit")).toMatchObject({ aside: "a radical: unpaired electrons on C" });
    expect(checked(all, 2, new Set<Check>(["parts", "valence"]), "RDKit")).toMatchObject({ aside: "a part with no electrons (H+)" });
  });

  it("writes a part as its formula: its elements in the order met, how many, and its charge", () => {
    expect(partFormula([{ el: "H", charge: 1 }])).toBe("H+");
    expect(partFormula([{ el: "He", charge: 2 }])).toBe("He2+");
    expect(partFormula([{ el: "C", charge: 0 }, { el: "H", charge: 0 }, { el: "H", charge: 0 }, { el: "O", charge: -1 }])).toBe("CH2O-");
  });
});
