import { describe, expect, it } from "vitest";
import { moleculesToEditorModel, readMoleculesFromText } from "../../utils/importers";
import { layoutMolecule, type Atom, type Bond, type LayoutOptions } from "./layout2d";
import { acsWorldOptions, NOMINAL_BOND_LENGTH } from "./acs";
import { writeMolfile } from "./molWriter";

const L = NOMINAL_BOND_LENGTH;
const opts = (): LayoutOptions => acsWorldOptions([], [], { units: "world" });
const read = (text: string) => moleculesToEditorModel(readMoleculesFromText(text, "mol")).model;
const v3 = (...body: string[]) =>
  ["", "  Meno", "", "  0  0  0     0  0            999 V3000", ...body.map((l) => `M  V30 ${l}`), "M  END"].join("\n");

// butan-2-ol's C2 and C3 both stereocentres: C1-C2(O5)-C3(C6)-C4
const zig = (extra: Partial<Atom>[] = []): Atom[] =>
  [
    { id: 1, x: 0, y: 0, el: "C" },
    { id: 2, x: L * 0.866, y: L / 2, el: "C" },
    { id: 3, x: L * 1.732, y: 0, el: "C" },
    { id: 4, x: L * 2.598, y: L / 2, el: "C" },
    { id: 5, x: L * 0.866, y: L * 1.5, el: "O" },
    { id: 6, x: L * 1.732, y: -L, el: "C" },
  ].map((a, i) => ({ ...a, ...(extra[i] ?? {}) }));
const zigBonds: Bond[] = [
  { a1: 0, a2: 1, order: 1 },
  { a1: 1, a2: 2, order: 1 },
  { a1: 2, a2: 3, order: 1 },
  { a1: 1, a2: 4, order: 1, stereo: "up" },
  { a1: 2, a2: 5, order: 1, stereo: "down" },
];
const texts = (atoms: Atom[], bonds: Bond[]) => layoutMolecule(atoms, bonds, opts(), 40).texts.map((t) => t.text);

describe("reaction properties", () => {
  it("are read from a V3000 file and carried into the editor", () => {
    const model = read(
      v3(
        "BEGIN CTAB",
        "COUNTS 2 1 0 0 0",
        "BEGIN ATOM",
        "1 C 0 0 0 3 INVRET=1",
        "2 O 1.5 0 0 4 EXACHG=1",
        "END ATOM",
        "BEGIN BOND",
        "1 1 1 2 RXCTR=12",
        "END BOND",
        "END CTAB",
      ),
    );
    expect(model.atoms.map((a) => [a.map, a.invRet, a.exactChange])).toEqual([
      [3, "invert", undefined],
      [4, undefined, true],
    ]);
    expect(model.bonds[0].reactingCentre).toBe(12);
  });

  it("show a mapping number as its IUPAC locant where it has one: 4a for 9, and 3a with a superscript 1 (foundation part 16)", () => {
    const atoms = zig([{ map: 9, mapText: { base: "4a" } }, { map: 16, mapText: { base: "3a", sup: "1" } }, { map: 3 }]);
    const items = layoutMolecule(atoms, zigBonds, opts(), 40).texts;
    const t = items.map((x) => x.text);
    expect(t).toContain("4a");
    expect(t).not.toContain("9");
    expect(t).toContain("3");
    const sup = items.find((x) => x.runs?.[0]?.text === "3a")!;
    expect(sup.runs!.map((r) => [r.text, !!r.sup])).toEqual([["3a", false], ["1", true]]);
  });

  it("are said small beside each atom: its mapping number, inv or ret, exact", () => {
    const atoms = zig([{ map: 1 }, { map: 2, invRet: "invert" }, { exactChange: true }]);
    const t = texts(atoms, zigBonds);
    expect(t).toEqual(expect.arrayContaining(["1", "2 inv", "exact"]));
  });

  it("mark a reacting centre across its bond: one stroke, two, three, or a cross", () => {
    const strokes = (c: number) => {
      const atoms: Atom[] = [
        { id: 1, x: 0, y: 0, el: "C" },
        { id: 2, x: L, y: 0, el: "C" },
      ];
      const layout = layoutMolecule(atoms, [{ a1: 0, a2: 1, order: 1, reactingCentre: c }], opts(), 40);
      // the bond's own line, and the strokes across it
      return layout.lines.filter((l) => Math.abs(l.x1 - l.x2) < L * 0.5).length;
    };
    expect(strokes(8)).toBe(1);
    expect(strokes(4)).toBe(2);
    expect(strokes(12)).toBe(3);
    expect(strokes(13)).toBe(3);
    expect(strokes(-1)).toBe(2);
    // a centre with nothing said of how: tagged
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: L, y: 0, el: "C" },
    ];
    expect(texts(atoms, [{ a1: 0, a2: 1, order: 1, reactingCentre: 1 }])).toContain("rc");
  });
});

describe("enhanced stereo", () => {
  it("is read from V3000 collections, and the chiral flag of a file without them", () => {
    const model = read(
      v3(
        "BEGIN CTAB",
        "COUNTS 3 2 0 0 0",
        "BEGIN ATOM",
        "1 C 0 0 0 0",
        "2 C 1.5 0 0 0",
        "3 C 3 0 0 0",
        "END ATOM",
        "BEGIN BOND",
        "1 1 1 2 CFG=1",
        "2 1 2 3",
        "END BOND",
        "BEGIN COLLECTION",
        "MDLV30/STERAC2 ATOMS=(1 1)",
        "MDLV30/STEABS ATOMS=(1 3)",
        "END COLLECTION",
        "END CTAB",
      ),
    );
    expect(model.atoms.map((a) => a.stereoGroup)).toEqual([{ kind: "and", n: 2 }, undefined, { kind: "abs" }]);
    const flagged = read(
      ["", "", "", "  2  1  0  0  1  0  0  0  0  0999 V2000", "    0.0000    0.0000    0.0000 C   0  0", "    1.5000    0.0000    0.0000 O   0  0", "  1  2  1  1", "M  END"].join("\n"),
    );
    expect(flagged.atoms[0].stereoGroup).toEqual({ kind: "abs" });
  });

  it("taking in all a structure's centres, is said once beneath it (IUPAC ST-6.3)", () => {
    const and = zig([{}, { stereoGroup: { kind: "and", n: 1 } }, { stereoGroup: { kind: "and", n: 1 } }]);
    const layout = layoutMolecule(and, zigBonds, opts(), 40);
    const note = layout.texts.find((t) => t.text === "and enantiomer")!;
    expect(note).toBeTruthy();
    // beneath the structure, half a bond and more
    expect(note.y).toBeLessThan(-L - L * 0.5);
    const or = zig([{}, { stereoGroup: { kind: "or", n: 1 } }, { stereoGroup: { kind: "or", n: 1 } }]);
    expect(texts(or, zigBonds)).toContain("or enantiomer");
    // and nothing for an absolute one
    const abs = zig([{}, { stereoGroup: { kind: "abs" } }, { stereoGroup: { kind: "abs" } }]);
    expect(texts(abs, zigBonds).filter((t) => /abs|enantiomer/.test(t))).toEqual([]);
  });

  it("beside plain atoms with no wedge, a group of all the centres is still said once beneath: a CH2 or a methyl counts for nothing", () => {
    // (the group on the two wedged centres; atom 0 a plain CH2 with a methyl on it, its bonds plain - more bonds than the methyl, so
    //  the narrow end a plain bond would have, were it a wedge)
    const atoms = [...zig([{}, { stereoGroup: { kind: "and", n: 1 } }, { stereoGroup: { kind: "and", n: 1 } }]), { id: 7, x: -L * 0.866, y: L / 2, el: "C" }];
    const t = texts(atoms, [...zigBonds, { a1: 0, a2: 6, order: 1 }]);
    expect(t).toContain("and enantiomer");
    expect(t.filter((x) => x === "and1")).toEqual([]);
  });

  it("beside a centre drawn with a wedge and in no group, is said at each of its centres: its forms are no enantiomers", () => {
    // (and1 on two centres, a third wedged as drawn: as an (S) side chain beside a racemic ring - diastereomers, not an enantiomer)
    const wedged: Bond[] = zigBonds.map((b, k) => (k === 0 ? { ...b, stereo: "up" as const, narrow: 0 } : b));
    const t = texts(zig([{}, { stereoGroup: { kind: "and", n: 1 } }, { stereoGroup: { kind: "and", n: 1 } }]), wedged);
    expect(t.filter((x) => x === "and1")).toHaveLength(2);
    expect(t.some((x) => /enantiomer/.test(x))).toBe(false);
  });

  it("in more than one group, is said at each centre", () => {
    const mixed = zig([{}, { stereoGroup: { kind: "abs" } }, { stereoGroup: { kind: "and", n: 1 } }]);
    const t = texts(mixed, zigBonds);
    expect(t).toEqual(expect.arrayContaining(["abs", "and1"]));
    expect(t.some((x) => /enantiomer/.test(x))).toBe(false);
  });
});

describe("written", () => {
  it("mapping, inversion and exact change, reacting centres and the chiral flag in V2000's fields", () => {
    const text = writeMolfile({
      atoms: [
        { id: 1, x: 0, y: 0, el: "C", map: 5, invRet: "retain", stereoGroup: { kind: "abs" } },
        { id: 2, x: L, y: 0, el: "O", exactChange: true },
      ],
      bonds: [{ a: 1, b: 2, order: 1, stereo: "up", reactingCentre: 4 }],
    });
    const lines = text.split("\n");
    // the chiral flag
    expect(lines[3].slice(12, 15).trim()).toBe("1");
    expect(lines[4].slice(60, 63).trim()).toBe("5");
    expect(lines[4].slice(63, 66).trim()).toBe("2");
    expect(lines[5].slice(66, 69).trim()).toBe("1");
    expect(lines[6].slice(18, 21).trim()).toBe("4");
    const again = read(text);
    expect(again.atoms[0]).toMatchObject({ map: 5, invRet: "retain", stereoGroup: { kind: "abs" } });
    expect(again.bonds[0].reactingCentre).toBe(4);
  });

  it("racemic and relative groups in V3000 collections", () => {
    const text = writeMolfile({
      atoms: [
        { id: 1, x: 0, y: 0, el: "C", stereoGroup: { kind: "and", n: 1 } },
        { id: 2, x: L, y: 0, el: "C", stereoGroup: { kind: "or", n: 2 } },
        { id: 3, x: 2 * L, y: 0, el: "C", stereoGroup: { kind: "and", n: 1 } },
      ],
      bonds: [
        { a: 1, b: 2, order: 1 },
        { a: 2, b: 3, order: 1 },
      ],
    });
    expect(text).toContain("V3000");
    expect(text).toContain("M  V30 MDLV30/STERAC1 ATOMS=(2 1 3)");
    expect(text).toContain("M  V30 MDLV30/STEREL2 ATOMS=(1 2)");
    expect(read(text).atoms.map((a) => a.stereoGroup)).toEqual([
      { kind: "and", n: 1 },
      { kind: "or", n: 2 },
      { kind: "and", n: 1 },
    ]);
  });
});
