/**
 * A molecule in 3D written to an SD file and read back (docs/FILE-IO.md):
 * its charge and spin multiplicity as data items beside its energy - those
 * every step is told - taken back as given, its atom block as it is; its
 * imaginary frequencies, where its calculation judged them; a charge or a
 * multiplicity that is no whole number named and not taken.
 */
import { describe, expect, it } from "vitest";
import { calcOf } from "../../../lib/calc/output";
import { checkedStructures, readStructures } from "../../../lib/io/structures";
import { addMolecule3d, emptyWorkspaceDocument } from "./document";
import { structureFileText } from "./fileActions";
import type { Drawn, Molecule3D } from "./store/types";
import { itemsNotTakenSaid } from "./utils/io";
import { entryOfSet, setEntries } from "./workflow/entries";

const ATOMS = [
  { el: "O", x: 0, y: 0, z: 0 },
  { el: "H", x: 0.99, y: 0, z: 0 },
  { el: "H", x: -0.25, y: 0.96, z: 0 },
];
const BONDS = [
  { a1: 0, a2: 1, order: 1 },
  { a1: 0, a2: 2, order: 1 },
];
/** Water's radical cation as a calculation gives it: charge +1, a doublet - its atoms say neither. */
const cation = (extra: Partial<Molecule3D> = {}): Omit<Molecule3D, "id"> => ({
  at: { x: 0, y: 0 },
  atoms: ATOMS,
  bonds: BONDS,
  energies: [-75.9],
  calc: calcOf({ atoms: ATOMS.map((a) => a.el), frames: [ATOMS.flatMap((a) => [a.x, a.y, a.z])], program: "a program", method: "a method", charge: 1, multiplicity: 2 }, ["a reader"]),
  ...extra,
});
const sdf = (...ms: Omit<Molecule3D, "id">[]) => structureFileText({ atoms: [], bonds: [], arrows: [], pluses: [], molecules3d: ms } as unknown as Drawn, "/x/w.sdf", { frames: "all" });
/** What each step is told of the first molecule an SD file's text opens with. */
const speciesRead = (text: string) => {
  const read = checkedStructures(readStructures("sdf", "w.sdf", text), "w.sdf");
  const doc = addMolecule3d(emptyWorkspaceDocument(), { ...read.molecules3d![0], at: { x: 0, y: 0 } });
  return { species: entryOfSet(setEntries(doc.molecules3d!, "molecules")[0], "x").species, read };
};
const item = (name: string, data: string) => `> <${name}>\n${data}\n\n`;

describe("a molecule in 3D's species, written to an SD file and read back", () => {
  it("writes the charge and multiplicity each step is told beside its energy, and reads them back as given: a radical cation stays one", () => {
    const text = sdf(cation());
    expect(text).toContain(item("Charge", "1") + item("Multiplicity", "2"));
    // (its atom block as it was: no atom given the charge)
    expect(text).not.toContain("M  CHG");
    const { species, read } = speciesRead(text);
    expect(species).toEqual({ charge: 1, multiplicity: 2, from: { charge: "given", multiplicity: "given" } });
    expect(read.itemsNotTaken).toBeUndefined();
  });

  it("writes what its atoms say where it was given none - and reads as its atoms say a file with none written", () => {
    expect(sdf(cation({ calc: undefined }))).toContain(item("Charge", "0") + item("Multiplicity", "1"));
    const bare = sdf(cation({ calc: undefined })).replace(item("Charge", "0") + item("Multiplicity", "1"), "");
    expect(speciesRead(bare).species?.from).toEqual({ charge: "atoms", multiplicity: "atoms" });
  });

  it("names a charge or a multiplicity that is no whole number, and takes neither guess: the molecule as its atoms say", () => {
    const text = sdf(cation()).replace(item("Charge", "1"), item("Charge", "+1.5")).replace(item("Multiplicity", "2"), item("Multiplicity", "0"));
    const { species, read } = speciesRead(text);
    expect(species?.from).toEqual({ charge: "atoms", multiplicity: "atoms" });
    expect(read.itemsNotTaken).toEqual([
      { record: 1, item: "Charge", why: '"+1.5" is not a whole number' },
      { record: 1, item: "Multiplicity", why: '"0" is not a whole number of one or more' },
    ]);
    expect(itemsNotTakenSaid("w.sdf", read.itemsNotTaken!)).toBe(
      "Record 1's Charge: \"+1.5\" is not a whole number, so it was not taken. Record 1's Multiplicity: \"0\" is not a whole number of one or more, so it was not taken. The rest of w.sdf opened.",
    );
  });
});

describe("a molecule in 3D's species read from an SD file, taken only where nothing speaks against it", () => {
  /** Ammonium as its atom block has it: the nitrogen's +1 carried there. */
  const ammonium = (): Omit<Molecule3D, "id"> => ({
    at: { x: 0, y: 0 },
    atoms: [
      { el: "N", x: 0, y: 0, z: 0, charge: 1 },
      { el: "H", x: 0.6, y: 0.6, z: 0.6 },
      { el: "H", x: -0.6, y: -0.6, z: 0.6 },
      { el: "H", x: -0.6, y: 0.6, z: -0.6 },
      { el: "H", x: 0.6, y: -0.6, z: -0.6 },
    ],
    bonds: [1, 2, 3, 4].map((h) => ({ a1: 0, a2: h, order: 1 })),
  });

  it("takes no charge other than the one its atoms carry, naming it - the atoms' stands", () => {
    const text = sdf(ammonium());
    expect(text).toContain(item("Charge", "1") + item("Multiplicity", "1"));
    const { species, read } = speciesRead(text.replace(item("Charge", "1"), item("Charge", "0")));
    expect([species?.charge, species?.from.charge]).toEqual([1, "atoms"]);
    expect(read.itemsNotTaken).toEqual([{ record: 1, item: "Charge", why: "0 differs from the +1 its atoms carry" }]);
    // (the same charge as its atoms': taken)
    expect(speciesRead(text).read.itemsNotTaken).toBeUndefined();
  });

  it("takes neither where the electrons cannot have the multiplicity, naming both: ammonium a doublet", () => {
    const { species, read } = speciesRead(sdf(ammonium()).replace(item("Multiplicity", "1"), item("Multiplicity", "2")));
    expect(species?.from).toEqual({ charge: "atoms", multiplicity: "atoms" });
    expect(read.itemsNotTaken).toEqual([
      { record: 1, item: "Charge", why: "10 electrons cannot have multiplicity 2: an even count takes an odd multiplicity" },
      { record: 1, item: "Multiplicity", why: "10 electrons cannot have multiplicity 2: an even count takes an odd multiplicity" },
    ]);
  });

  it("takes no multiplicity alone the electrons cannot have: water a doublet", () => {
    const bare = sdf(cation({ calc: undefined })).replace(item("Charge", "0") + item("Multiplicity", "1"), item("Multiplicity", "2"));
    const { species, read } = speciesRead(bare);
    expect(species).toEqual({ charge: 0, multiplicity: 1, from: { charge: "atoms", multiplicity: "atoms" } });
    expect(read.itemsNotTaken).toEqual([{ record: 1, item: "Multiplicity", why: "10 electrons cannot have multiplicity 2: an even count takes an odd multiplicity" }]);
  });

  it("takes neither of an item given twice, naming it", () => {
    const { species, read } = speciesRead(sdf(cation()).replace(item("Charge", "1"), item("Charge", "1") + item("Charge", "-1")));
    // (and the multiplicity, given once, then meets the atoms' charge: water's 10 electrons no doublet - not taken either)
    expect(species).toEqual({ charge: 0, multiplicity: 1, from: { charge: "atoms", multiplicity: "atoms" } });
    expect(read.itemsNotTaken).toEqual([
      { record: 1, item: "Charge", why: "it is given 2 times" },
      { record: 1, item: "Multiplicity", why: "10 electrons cannot have multiplicity 2: an even count takes an odd multiplicity" },
    ]);
    // (given twice alike, still neither)
    expect(speciesRead(sdf(cation()).replace(item("Multiplicity", "2"), item("Multiplicity", "2") + item("Multiplicity", "2"))).read.itemsNotTaken).toEqual([
      { record: 1, item: "Multiplicity", why: "it is given 2 times" },
    ]);
  });
});

describe("a molecule in 3D's imaginary frequencies, written to an SD file", () => {
  it("writes each a saddle point was judged to have, in cm-1 as given", () => {
    const text = sdf(cation({ calc: { ...cation().calc!, imaginary: [-300.2, -45.1] } }));
    expect(text).toContain(item("Imaginary frequencies (cm-1)", "-300.2 -45.1"));
  });

  it("writes each conformer's own, by its frame - and none where its vibrations were not worked out", () => {
    const text = sdf(cation({ frames: [ATOMS.flatMap((a) => [a.x, a.y, a.z + 0.01])], energies: [-75.9, -75.8], conformerSet: true, imaginary: [null, [-120.5]] }));
    const [first, second] = text.split("$$$$\n");
    expect(first).not.toContain("Imaginary");
    expect(second).toContain(item("Imaginary frequencies (cm-1)", "-120.5"));
  });

  it("writes none where its vibrations were worked out and it has none, and leaves the item out where they were not", () => {
    const vibrations = { on: "list" as const, id: "vibrations", name: "Vibrations", columns: [], rows: [] };
    expect(sdf(cation({ calc: { ...cation().calc!, results: [vibrations as never] } }))).toContain(item("Imaginary frequencies (cm-1)", "none"));
    expect(sdf(cation())).not.toContain("Imaginary");
  });
});

describe("a molecule in 3D's properties, written to an SD file", () => {
  const p = (v: number) => ({ nll: { value: v, unit: "none" as const, status: "computed" as const } });
  const two = cation({ frames: [ATOMS.flatMap((a) => [a.x, a.y + 0.01, a.z])], energies: [-75.9, -75.8], properties: [p(1), p(2)] });

  it("writes each frame's own, after what Meno says of it", () => {
    const [first, second] = sdf(two).split("$$$$\n");
    expect(first).toContain(item("Multiplicity", "2") + item("nll", "1"));
    expect(second).toContain(item("nll", "2"));
    // (the frame shown alone: its own)
    const shown = structureFileText({ atoms: [], bonds: [], arrows: [], pluses: [], molecules3d: [{ ...two, frame: 1 }] } as unknown as Drawn, "/x/w.sdf");
    expect(shown).toContain(item("nll", "2"));
    expect(shown).not.toContain(item("nll", "1"));
  });

  it("writes none where they are not one for each frame: never one frame's beside another's", () => {
    expect(sdf({ ...two, properties: [p(1)] })).not.toContain("> <nll>");
  });
});
