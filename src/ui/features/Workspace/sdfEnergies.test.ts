/**
 * An SD file's records read back (docs/FILE-IO.md): each record's energy
 * from its `Energy (Eh)` data item - the item Meno writes it under - in
 * hartrees, taken only where it is one number; and each record's title, its
 * first line, its molecule's name, the file's name where the line is empty.
 * Every name and value here is made up.
 */
import { describe, expect, it } from "vitest";
import { checkedStructures, readStructures } from "../../../lib/io/structures";
import { addMolecule3d, emptyWorkspaceDocument } from "./document";
import { structureFileText } from "./fileActions";
import type { Drawn, Molecule3D } from "./store/types";
import { itemsNotTakenSaid } from "./utils/io";
import { entryOfSet, nameOf, setEntries } from "./workflow/entries";
import { tableRows } from "./workflow/setTable";

const ATOMS = [
  { el: "O", x: 0, y: 0, z: 0 },
  { el: "H", x: 0.96, y: 0, z: 0.1 },
  { el: "H", x: -0.24, y: 0.93, z: -0.1 },
];
const BONDS = [
  { a1: 0, a2: 1, order: 1 },
  { a1: 0, a2: 2, order: 1 },
];

/** A molecule in 3D as the page holds it: water, with `extra`. */
const water = (extra: Partial<Molecule3D> = {}): Omit<Molecule3D, "id"> => ({ at: { x: 0, y: 0 }, atoms: ATOMS, bonds: BONDS, ...extra });
/** What Meno writes of molecules `ms` as an SD file `w.sdf`, each in every frame. */
const written = (...ms: Omit<Molecule3D, "id">[]) => structureFileText({ atoms: [], bonds: [], arrows: [], pluses: [], molecules3d: ms } as unknown as Drawn, "/x/w.sdf", { frames: "all" });
/** An SD file's text read as file `name`, checked as the page checks any reader's answer. */
const read = (text: string, name = "made-up.sdf") => checkedStructures(readStructures("sdf", name, text), name);

const f4 = (v: number) => v.toFixed(4).padStart(10);
/** A record written by hand, as another program might: water titled `title` (its molfile's first line), with data items `items`. */
const record = (title: string, items: string[] = []) =>
  [
    title,
    "  Invented01012612003D",
    "",
    "  3  2  0  0  0  0  0  0  0  0999 V2000",
    ...ATOMS.map((a) => `${f4(a.x)}${f4(a.y)}${f4(a.z)} ${a.el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`),
    "  1  2  1  0  0  0  0",
    "  1  3  1  0  0  0  0",
    "M  END",
    ...items.flatMap((it) => [it, ""]),
    "$$$$",
    "",
  ].join("\n");
const item = (name: string, data: string) => `> <${name}>\n${data}`;

describe("an SD file's energies, read back", () => {
  it("reads back the energies Meno wrote, a record each, the same numbers in hartrees", () => {
    const energies = [-76.4089123456789, -76.40123, -76.39];
    const text = written(water({ frames: [ATOMS.flatMap((a) => [a.x, a.y, a.z + 0.01]), ATOMS.flatMap((a) => [a.x, a.y, a.z - 0.01])], energies }));
    expect(text).toContain(item("Energy (Eh)", "-76.4089123456789"));
    const back = read(text, "w.sdf");
    expect(back.molecules3d!.map((m) => m.energies)).toEqual([[-76.4089123456789], [-76.40123], [-76.39]]);
    expect(back.itemsNotTaken).toBeUndefined();
  });

  it("reads a hand-written record's title as its name and its energy item as its energy", () => {
    const back = read(record("water, made up", [item("Energy (Eh)", "-76.026"), item("Charge", "0")]));
    expect(back.molecules3d).toHaveLength(1);
    const m = back.molecules3d![0];
    expect(m.energies).toEqual([-76.026]);
    expect(nameOf(m)).toBe("water, made up");
  });

  it("gives a record with no energy item none", () => {
    expect(read(record("no energy", [item("Charge", "0")])).molecules3d![0].energies).toBeUndefined();
  });

  it("does not take an energy that is not one number, nor one given twice - and names each, as it names a charge not taken", () => {
    const back = read(
      record("in kcal", [item("Energy (Eh)", "-47700 kcal/mol")]) +
        record("two", [item("Energy (Eh)", "-76.1\n-76.2")]) +
        record("twice", [item("Energy (Eh)", "-76.1"), item("Energy (Eh)", "-76.2")]) +
        record("not a number", [item("Energy (Eh)", "low")]),
    );
    expect(back.molecules3d!.map((m) => m.energies)).toEqual([undefined, undefined, undefined, undefined]);
    expect(back.itemsNotTaken).toEqual([
      { record: 1, item: "Energy (Eh)", why: '"-47700 kcal/mol" is not a number' },
      { record: 2, item: "Energy (Eh)", why: '"-76.1 -76.2" is not a number' },
      { record: 3, item: "Energy (Eh)", why: "it is given 2 times" },
      { record: 4, item: "Energy (Eh)", why: '"low" is not a number' },
    ]);
    expect(itemsNotTakenSaid("made-up.sdf", back.itemsNotTaken!.slice(3))).toBe('Record 4\'s Energy (Eh): "low" is not a number, so it was not taken. The rest of made-up.sdf opened.');
  });

  it("reads no other item for an energy, and converts no unit", () => {
    const back = read(record("other names", [item("Energy", "-76.0"), item("Energy (kcal/mol)", "-47700"), item("energy (eh)", "-76.0")]));
    expect(back.molecules3d![0].energies).toBeUndefined();
    expect(back.itemsNotTaken).toBeUndefined();
  });

  it("takes an energy written with an exponent as the number it is", () => {
    expect(read(record("exponent", [item("Energy (Eh)", "-7.6026E+01")])).molecules3d![0].energies).toEqual([-76.026]);
  });
});

describe("an SD file's records' titles, their molecules' names", () => {
  it("keeps each record's own title as its name, and gives a record with an empty title line the file's name", () => {
    const back = read(record("alpha") + record("") + record("  gamma  "), "three.sdf");
    expect(back.molecules3d!.map(nameOf)).toEqual(["alpha", "three.sdf", "gamma"]);
  });

  it("writes a molecule's name back as its record's title, and reads it back as the name", () => {
    const back = read(record("delta", [item("Energy (Eh)", "-76.5")]), "first.sdf");
    const again = read(written({ ...back.molecules3d![0], at: { x: 0, y: 0 } }), "w.sdf");
    expect(again.molecules3d!.map(nameOf)).toEqual(["delta 1"]);
    expect(again.molecules3d![0].energies).toEqual([-76.5]);
  });

  it("names each record's entry, and each row of a set of them, by its title", () => {
    const back = read(record("epsilon", [item("Energy (Eh)", "-76.1")]) + record("zeta", [item("Energy (Eh)", "-76.2")]), "two.sdf");
    let doc = emptyWorkspaceDocument();
    for (const m of back.molecules3d!) doc = addMolecule3d(doc, { ...m, at: { x: 0, y: 0 } });
    const entries = setEntries(doc.molecules3d!, "molecules");
    expect(entries.map((e) => [e.name, e.energy])).toEqual([
      ["epsilon", -76.1],
      ["zeta", -76.2],
    ]);
    expect(entries.map((e) => entryOfSet(e, "x").properties.name?.value)).toEqual(["epsilon", "zeta"]);
    expect(tableRows(doc.molecules3d!, "molecules").map((r) => [r.name, r.energy])).toEqual([
      ["epsilon", -76.1],
      ["zeta", -76.2],
    ]);
  });
});
