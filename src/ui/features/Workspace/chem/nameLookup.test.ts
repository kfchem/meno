import { describe, expect, it } from "vitest";
import type { PythonPlugin } from "../../../../lib/calc/catalog";
import type { Model } from "../store/types";
import { addedName, formulaOfDrawn, formulaRead, formulaWritten, foundNotes, foundOf, lookupConsentOf, lookupPurpose, MOST_NAMED, NOT_READ, notDrawnWhy, type NamedStructure } from "./nameLookup";

// (every record here is hand-written in the answer's shape, its values set by hand: no answer fetched from any service)
const HOST = "names.example.org";
const aspirin: NamedStructure = {
  id: "ID 2244",
  page: `https://${HOST}/compound/2244`,
  title: "aspirin",
  smiles: "CC(=O)OC1=CC=CC=C1C(=O)O",
  formula: "C9H8O4",
  charge: 0,
  centres: { defined: 0, undefined: 0 },
  doubleBonds: { defined: 0, undefined: 0 },
  parts: 1,
};

/** A drawing of atoms by their elements and charges, bonded in a chain by the orders given: enough for its formula. */
function chain(els: string[], orders: number[] = [], charges: Record<number, number> = {}): Model {
  return {
    atoms: els.map((el, i) => ({ id: i + 1, x: i, y: 0, r: 0.9, el, ...(charges[i] ? { charge: charges[i] } : {}) })),
    bonds: orders.map((order, i) => ({ id: 100 + i, a: i + 1, b: i + 2, order })),
  } as unknown as Model;
}

describe("a structure found by its name", () => {
  it("is asked for once, by where it goes and that nothing else does - its own purpose, its hosts in order", () => {
    const p = { id: "finder", name: "Names Service", roleHosts: { names: ["b.example.org", "a.example.org"] } } as unknown as PythonPlugin;
    expect(lookupConsentOf(p)).toEqual({
      purpose: "lookup:finder@a.example.org,b.example.org",
      title: "Look names up at b.example.org and a.example.org, for Names Service?",
      detail: "Each name you choose to look up goes there. Nothing else does.",
      sources: ["Names Service: b.example.org, a.example.org"],
      hosts: ["b.example.org", "a.example.org"],
    });
    // (a yes for its hosts as they are: the plugin updated to name another is asked of again)
    expect(lookupPurpose("finder", ["a.example.org"])).not.toBe(lookupPurpose("finder", ["a.example.org", "c.example.org"]));
    expect(MOST_NAMED).toBe(8);
  });

  it("reads a plugin's answer strictly: whole, at most as many as asked, each page at a host it names - else refused whole", () => {
    expect(foundOf({ found: [aspirin], more: 0 }, 8, [HOST])).toEqual({ found: [aspirin], more: 0 });
    expect(foundOf({ found: [aspirin, { ...aspirin, id: "ID 1" }], more: 5 }, 8, [HOST])).toMatchObject({ more: 5 });
    expect(foundOf({ none: true }, 8, [HOST])).toEqual({ none: true });
    expect(foundOf({ error: "The service is busy" }, 8, [HOST])).toEqual({ error: "The service is busy" });
    const bad: unknown[] = [
      null,
      [],
      "aspirin",
      { found: [aspirin] },
      { found: [aspirin], more: -1 },
      { found: [], more: 0 },
      { found: [aspirin], more: 0, extra: 1 },
      { none: false },
      { error: "" },
      { found: Array.from({ length: 9 }, (_, i) => ({ ...aspirin, id: `ID ${i}` })), more: 0 },
      { found: [aspirin, aspirin], more: 0 },
      ...(
        [
          { page: `http://${HOST}/compound/2244` },
          { page: `https://other.example.net/compound/2244` },
          { page: `https://${HOST}:8443/compound/2244` },
          { page: `https://someone@${HOST}/` },
          { page: "not a page" },
          { title: "x".repeat(301) },
          { smiles: "C".repeat(4001) },
          { smiles: 3 },
          { title: " " },
          { charge: 0.5 },
          { centres: { defined: 1 } },
          { doubleBonds: { defined: -1, undefined: 0 } },
          { parts: 0 },
          { formula: undefined },
        ] as Partial<Record<keyof NamedStructure, unknown>>[]
      ).map((amiss) => ({ found: [{ ...aspirin, ...amiss }], more: 0 })),
    ];
    for (const raw of bad) expect(() => foundOf(raw, 8, [HOST]), JSON.stringify(raw)).toThrow(NOT_READ);
    // (one more than asked for: refused, never cut down)
    expect(() => foundOf({ found: [aspirin, { ...aspirin, id: "ID 1" }], more: 0 }, 1, [HOST])).toThrow(NOT_READ);
  });

  it("reads a formula as counts and a charge, never as text - D and T as hydrogen, an unreadable one as none", () => {
    const read = (f: string) => {
      const r = formulaRead(f);
      return r && { counts: Object.fromEntries(r.counts), charge: r.charge };
    };
    expect(read("C9H8O4")).toEqual({ counts: { C: 9, H: 8, O: 4 }, charge: 0 });
    expect(read("C2H3O2-")).toEqual({ counts: { C: 2, H: 3, O: 2 }, charge: -1 });
    expect(read("O4S-2")).toEqual({ counts: { O: 4, S: 1 }, charge: -2 });
    expect(read("Fe+3")).toEqual({ counts: { Fe: 1 }, charge: 3 });
    expect(read("C2H3NaO2")).toEqual({ counts: { C: 2, H: 3, Na: 1, O: 2 }, charge: 0 });
    expect(read("C2H3O2.Na")).toEqual({ counts: { C: 2, H: 3, O: 2, Na: 1 }, charge: 0 });
    expect(read("CuO4S.5H2O")).toEqual({ counts: { Cu: 1, O: 9, S: 1, H: 10 }, charge: 0 });
    expect(read("CDCl3")).toEqual({ counts: { C: 1, H: 1, Cl: 3 }, charge: 0 });
    expect(read("C2H5T")).toEqual({ counts: { C: 2, H: 6 }, charge: 0 });
    for (const f of ["", "c9h8o4", "C9H8O4 ", "C9(H8)O4", "Xx2", "C0H4", "0H2O", "C9H8O4..", "[2H]Cl", "13CH4", "2H2O"]) expect(read(f), f).toBeNull();
    // (a count stands before a part after a dot alone)
    expect(read("CH4.2H2O")).toEqual({ counts: { C: 1, H: 8, O: 2 }, charge: 0 });
    expect(formulaWritten({ counts: new Map([["O", 2], ["H", 3], ["C", 2]]), charge: -1 })).toBe("C2H3O2-");
    expect(formulaWritten({ counts: new Map([["S", 1], ["O", 4]]), charge: -2 })).toBe("O4S-2");
    expect(formulaWritten({ counts: new Map([["Na", 1]]), charge: 1 })).toBe("Na+");
  });

  it("is drawn only where Meno reads its SMILES as the service's formula and charge - in words that blame neither", () => {
    // (ethanol as drawn: C-C-O, hydrogens by valence)
    const ethanol = chain(["C", "C", "O"], [1, 1]);
    expect(formulaOfDrawn(ethanol) && formulaWritten(formulaOfDrawn(ethanol)!)).toBe("C2H6O");
    const found = { ...aspirin, title: "ethanol", formula: "C2H6O" };
    expect(notDrawnWhy(ethanol, found, "Names Service")).toBeNull();
    // (its SMILES read another way than its formula: refused, saying what each is)
    expect(notDrawnWhy(ethanol, { ...found, formula: "C2H4O" }, "Names Service")).toBe("Meno reads Names Service's structure for ethanol as C2H6O; Names Service's formula is C2H4O. Not drawn.");
    // (aspirin's formula, given with a SMILES of eight carbons: refused)
    expect(notDrawnWhy(chain(["C", "C", "C", "C", "C", "C", "C", "C"], [1, 1, 1, 1, 1, 1, 1]), aspirin, "Names Service")).toMatch(/^Meno reads Names Service's structure for aspirin as C8H18; Names Service's formula is C9H8O4\. Not drawn\.$/);
    // (an ion: acetate's charge, drawn and given, alike; drawn neutral, unlike)
    const acetate = chain(["C", "C", "O"], [1, 1], { 2: -1 });
    expect(notDrawnWhy(acetate, { ...aspirin, title: "ethoxide", formula: "C2H5O-", charge: -1 }, "S")).toBeNull();
    expect(notDrawnWhy(ethanol, { ...aspirin, title: "ethoxide", formula: "C2H5O-", charge: -1 }, "S")).toBe("Meno reads S's structure for ethoxide as C2H6O; S's formula is C2H5O-. Not drawn.");
    // ("Fe2+", as some write an ion: two irons and +1 - unlike a record of +2, refused, both said)
    expect(notDrawnWhy(chain(["Fe"], [], { 0: 2 }), { ...aspirin, title: "iron(2+)", formula: "Fe2+", charge: 2 }, "S")).toBe("S gives iron(2+) the formula Fe2+ and the charge +2: not drawn.");
    // (a formula that writes one charge for a record of another: refused, both said)
    expect(notDrawnWhy(acetate, { ...aspirin, title: "ethoxide", formula: "C2H5O-", charge: 0 }, "S")).toBe("S gives ethoxide the formula C2H5O- and the charge 0: not drawn.");
    // (their formula quoted as they wrote it, never as Meno writes one: a hydrate, and a charge the formula leaves out said beside it)
    expect(notDrawnWhy(ethanol, { ...found, formula: "CuO4S.5H2O" }, "S")).toBe("Meno reads S's structure for ethanol as C2H6O; S's formula is CuO4S.5H2O. Not drawn.");
    expect(notDrawnWhy(ethanol, { ...found, formula: "C2H5O", charge: -1 }, "S")).toBe("Meno reads S's structure for ethanol as C2H6O; S's formula is C2H5O, charge \u22121. Not drawn.");
    // (spaces about it: taken off, as quoted; "13CH4" not read, never a count of the whole)
    expect(notDrawnWhy(ethanol, { ...found, formula: " C2H6O " }, "S")).toBeNull();
    expect(notDrawnWhy(ethanol, { ...found, formula: " 13CH4 " }, "S")).toBe("Meno does not read S's formula for ethanol, 13CH4: not drawn.");
    // (a formula Meno does not read: said so, never "unlike")
    expect(notDrawnWhy(ethanol, { ...found, formula: "C2H6O(?)" }, "S")).toBe("Meno does not read S's formula for ethanol, C2H6O(?): not drawn.");
    // (a deuterated one: D counted as hydrogen on both sides)
    expect(notDrawnWhy(chain(["Cl", "C", "Cl"], [1, 1]), { ...aspirin, title: "dichloromethane-d2", formula: "CD2Cl2" }, "S")).toBeNull();
  });

  it("says what is not plain about a compound found, and names its undo step by its title and id", () => {
    expect(foundNotes(aspirin)).toEqual([]);
    expect(foundNotes({ ...aspirin, centres: { defined: 2, undefined: 1 } })).toEqual(["1 of 3 stereocentres not defined"]);
    expect(foundNotes({ ...aspirin, centres: { defined: 0, undefined: 1 } })).toEqual(["1 of 1 stereocentre not defined"]);
    expect(foundNotes({ ...aspirin, doubleBonds: { defined: 1, undefined: 1 }, parts: 2, charge: 0 })).toEqual(["1 of 2 stereo double bonds not defined", "2 parts"]);
    expect(foundNotes({ ...aspirin, charge: -1 })).toEqual(["charge −1"]);
    expect(addedName(aspirin)).toBe("Add aspirin (ID 2244)");
  });
});
