import { describe, expect, it } from "vitest";
import { convergedAt } from "./converged";
import { geometryKey, type Entry } from "../../../../lib/entry";
import { structureKey } from "../../../../lib/steps/restructure";
import { rebonded } from "../../../../lib/steps/rebond";
import { withSpecies } from "../../../../lib/steps/species";
import { entryOfSet, MENO_OWN, setEntryOfEntry, type SetEntry } from "./entries";

/** Hydroxide-or-water-like: O and two H as a step's entry, with all a calculation leaves on it. */
const held = (extra: Partial<SetEntry> = {}): SetEntry =>
  ({
    compound: 0,
    number: 1,
    atoms: [{ el: "O" }, { el: "H" }, { el: "H" }],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    xyz: [0, 0, 0, 0.96, 0, 0, -0.24, 0.93, 0],
    energy: -76.4,
    charge: 0,
    multiplicity: 1,
    imaginary: [-120],
    degeneracy: 2,
    calc: { program: "a program", readers: ["a-plugin 1.0"], results: [] },
    from: 7,
    frame: 1,
    name: "w",
    ...extra,
  }) as SetEntry;

const tagged = (e: Entry): Entry => ({ ...e, properties: { ...e.properties, start: { value: "start-1", unit: "none", status: "computed" } } });

describe("an entry record as a step's entry again", () => {
  it("keeps all a step's entry held where it is that entry still - only a label added, as a Tag adds one", () => {
    const was = held();
    const back = setEntryOfEntry(tagged(entryOfSet(was, "x")), { compound: 0, number: 1 }, was)!;
    expect(back).toEqual({ ...was, properties: { start: { value: "start-1", unit: "none", status: "computed" } } });
  });

  it("drops what was worked out at the old structure - calculation, energy, marks - and keeps its molecule; its properties as the step left them", () => {
    const was = held();
    const geometry = tagged(entryOfSet(was, "g"));
    geometry.properties.mw = { value: 18.02, unit: "g/mol", of: structureKey(geometry), status: "computed" };
    geometry.properties.dipole = { value: 1.85, unit: "none", at: { geometry: geometryKey(was.xyz) }, status: "computed" };
    // (the bonding: one O-H bond less - the same atoms, in one numbering)
    const bonding: Entry = { ...entryOfSet(was, "b"), structure: { ...geometry.structure, bonds: [{ a1: 0, a2: 1, order: 1 }] }, properties: {} };
    const r = rebonded(geometry, bonding, "e");
    if ("failed" in r) throw new Error(r.failed);
    const back = setEntryOfEntry(r.entry, { compound: 3, number: 1 }, was)!;
    for (const gone of ["energy", "imaginary", "degeneracy", "calc", "mirror", "stereo", "marksUnread", "failed"] as const) expect(back[gone], gone).toBeUndefined();
    expect(back.bonds).toEqual([{ a1: 0, a2: 1, order: 1 }]);
    expect(back.xyz).toEqual(was.xyz);
    expect([back.from, back.frame, back.compound]).toEqual([7, 1, 3]);
    // (a value of a geometry naming it; a label; a value of the structure before, marked - and none of Meno's own carried as properties)
    expect(back.properties?.dipole.at?.geometry).toBe(geometryKey(was.xyz));
    expect(back.properties?.start.value).toBe("start-1");
    expect(back.properties?.mw.status).toEqual({ notApplicable: "worked out on the structure before Re-bond" });
    expect(Object.keys(back.properties ?? {}).sort()).toEqual(["dipole", "mw", "start"]);
  });

  it("drops the energy where only the charge and spin changed, the places the same: it was worked out for another state", () => {
    const was = held();
    const back = setEntryOfEntry(withSpecies(entryOfSet(was, "x"), { charge: 1, multiplicity: 2 }), { compound: 0, number: 1 }, was)!;
    expect([back.charge, back.multiplicity, back.energy, back.calc]).toEqual([1, 2, undefined, undefined]);
  });

  it("keeps all where the charge and spin given are those it had as its atoms said them - the same species, now given", () => {
    const plain = held({ charge: undefined, multiplicity: undefined });
    const back = setEntryOfEntry(withSpecies(entryOfSet(plain, "x"), { charge: 0 }), { compound: 0, number: 1 }, plain)!;
    expect(back).toEqual({ ...plain, charge: 0 });
  });

  it("holds a charge and spin only where they were given, not where its atoms alone say them", () => {
    const plain = held({ charge: undefined, multiplicity: undefined, energy: undefined, calc: undefined, imaginary: undefined, degeneracy: undefined });
    const back = setEntryOfEntry(entryOfSet(plain, "x"), { compound: 0, number: 1 }, plain)!;
    expect([back.charge, back.multiplicity]).toEqual([undefined, undefined]);
    const given = setEntryOfEntry(withSpecies(entryOfSet(plain, "x"), { charge: -1 }), { compound: 0, number: 1 }, plain)!;
    // (the charge given; the multiplicity its electrons take - its atoms', not given)
    expect([given.charge, given.multiplicity]).toEqual([-1, undefined]);
  });

  it("carries none of the properties Meno reads of an entry as its own, every one it gives held to that list", () => {
    // (an entry holding all Meno reads of one: energy, thermochemistry, vibrations and modes, degeneracy, mirror image, imaginary frequencies, name, where a run converged - and its group, number and state, and why it failed)
    const reading = (id: string, value: number) => ({ id, on: "molecule", group: "Thermochemistry", label: id, value, quantity: "energy" });
    const vibrations = { id: "vibrations", on: "list", group: "Vibrations", label: "Vibrations", columns: [{ label: "Frequency", quantity: "wavenumber" }], rows: [{ cells: [-120], move: Array(9).fill(0.1) }] };
    const calc = { readers: ["a-plugin 1.0"], results: [...["thermo.free-energy", "thermo.enthalpy", "thermo.zpve", "thermo.g-correction"].map((id) => reading(id, -76)), vibrations] };
    // (and that a run ended converged at it - or, out of a Failed exit, why it failed: one entry never both, a failed one
    //  standing on no converged run - so the two together give every name)
    const converged = held({ calc: calc as never, mirror: [0, 1, 2], imaginary: [-120, -35], converged: convergedAt("optimisation", held().xyz) });
    const failed = held({ calc: calc as never, mirror: [0, 1, 2], imaginary: [-120, -35], failed: { kind: "failed", why: "SCF has not converged" }, converged: convergedAt("optimisation", held().xyz) });
    const records = [converged, failed].map((e) => entryOfSet(e, "x"));
    expect(Object.keys(records[1].properties)).not.toContain("converged");
    expect([...new Set(records.flatMap((r) => Object.keys(r.properties)))].sort()).toEqual([...MENO_OWN].sort());
    records.forEach((r, i) => expect(setEntryOfEntry(r, { compound: 0, number: 1 }, [converged, failed][i])!.properties).toBeUndefined());
  });

  it("gives none of an entry without one geometry in 3D", () => {
    const e = entryOfSet(held(), "x");
    expect(setEntryOfEntry({ ...e, geometry: { kind: "frames", frames: [] } }, { compound: 0, number: 1 })).toBeNull();
    expect(setEntryOfEntry({ ...e, geometry: { kind: "2d", xy: [0, 0, 1, 0, 0, 1] } }, { compound: 0, number: 1 })).toBeNull();
  });
});
