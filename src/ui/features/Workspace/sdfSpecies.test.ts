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
