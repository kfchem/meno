import { describe, expect, it } from "vitest";
import { moleculesToEditorModel, readMoleculesFromText } from "../../utils/importers";
import { bondKind, layoutMolecule, type Atom, type Bond, type LayoutOptions } from "./layout2d";
import { acsWorldOptions, NOMINAL_BOND_LENGTH } from "./acs";
import { writeMolfile } from "./molWriter";
import { emptyWorkspaceDocument, appendModel } from "../../ui/features/Workspace/document";

const L = NOMINAL_BOND_LENGTH;
const opts = (): LayoutOptions => acsWorldOptions([], [], { units: "world" });
const read = (text: string) => moleculesToEditorModel(readMoleculesFromText(text, "mol")).model;
const v3 = (...body: string[]) =>
  ["", "  Meno", "", "  0  0  0     0  0            999 V3000", ...body.map((l) => `M  V30 ${l}`), "M  END"].join("\n");

// polyethylene's repeating unit between two end methyls: C1-[C2-C3]n-C4, and a data field on C1
const polymer = v3(
  "BEGIN CTAB",
  "COUNTS 4 3 2 0 0",
  "BEGIN ATOM",
  "1 C 0 0 0 0",
  "2 C 1.5 0 0 0",
  "3 C 3 0 0 0",
  "4 C 4.5 0 0 0",
  "END ATOM",
  "BEGIN BOND",
  "1 1 1 2",
  "2 1 2 3",
  "3 1 3 4",
  "END BOND",
  "BEGIN SGROUP",
  "1 SRU 0 ATOMS=(2 2 3) XBONDS=(2 1 3) LABEL=n CONNECT=HT",
  "2 DAT 0 ATOMS=(1 1) FIELDNAME=end FIELDDATA=capped",
  "END SGROUP",
  "END CTAB",
);

describe("a file's Sgroups", () => {
  it("are marks on their atoms, the same on each", () => {
    const model = read(polymer);
    const [c1, c2, c3, c4] = model.atoms;
    expect(c2.sgroups).toEqual([{ id: expect.any(Number), type: "SRU", label: "n", connect: "HT" }]);
    expect(c3.sgroups).toEqual(c2.sgroups);
    expect(c4.sgroups).toBeUndefined();
    expect(c1.sgroups).toEqual([{ id: expect.any(Number), type: "DAT", field: { name: "end", data: ["capped"] } }]);
    expect(c1.sgroups![0].id).not.toBe(c2.sgroups![0].id);
  });

  it("are drawn: brackets across the bonds out, their ends turned in, n and ht by the last; the data beneath", () => {
    const model = read(polymer);
    const atoms: Atom[] = model.atoms.map((a) => ({ ...a }));
    const index = new Map(model.atoms.map((a, i) => [a.id, i]));
    const bonds: Bond[] = model.bonds.map((b) => ({ a1: index.get(b.a)!, a2: index.get(b.b)!, order: b.order }));
    const layout = layoutMolecule(atoms, bonds, opts(), 40);
    // three bonds, and two brackets of three strokes each
    expect(layout.lines.length).toBe(3 + 6);
    const texts = layout.texts.map((t) => t.text);
    expect(texts).toEqual(expect.arrayContaining(["n", "ht", "capped"]));
    // n by the right bracket's lower end
    const n = layout.texts.find((t) => t.text === "n")!;
    expect(n.x).toBeGreaterThan(atoms[2].x);
    expect(n.y).toBeLessThan(0);
  });

  it("with no bond out, are bracketed either side", () => {
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C", sgroups: [{ id: 9, type: "MIX" }] },
      { id: 2, x: L, y: 0, el: "O", sgroups: [{ id: 9, type: "MIX" }] },
    ];
    const layout = layoutMolecule(atoms, [{ a1: 0, a2: 1, order: 2 }], opts(), 40);
    const brackets = layout.lines.filter((l) => Math.abs(l.x1 - l.x2) < 1e-9);
    // two upright strokes, beyond the atoms either side
    expect(brackets.some((l) => l.x1 < 0)).toBe(true);
    expect(brackets.some((l) => l.x1 > L)).toBe(true);
    expect(layout.texts.map((t) => t.text)).toContain("mix");
  });

  it("are written back and read again the same", () => {
    const model = read(polymer);
    for (const version of ["V2000", "V3000"] as const) {
      const text = writeMolfile(model, { version });
      const again = read(text);
      expect(again.atoms[1].sgroups).toEqual([{ id: expect.any(Number), type: "SRU", label: "n", connect: "HT" }]);
      expect(again.atoms[0].sgroups![0]).toMatchObject({ type: "DAT", field: { name: "end", data: ["capped"] } });
    }
  });

  it("keep an abbreviation shown expanded, and a multiple group, through a file", () => {
    const atoms = [
      { id: 1, x: 0, y: 0, el: "O", sgroups: [{ id: 7, type: "SUP", label: "OMe" }] },
      { id: 2, x: L, y: 0, el: "C", sgroups: [{ id: 7, type: "SUP", label: "OMe" }] },
      { id: 3, x: 2 * L, y: 0, el: "C", sgroups: [{ id: 8, type: "MUL", multiplier: 2, paradigm: true }] },
      { id: 4, x: 3 * L, y: 0, el: "C", sgroups: [{ id: 8, type: "MUL", multiplier: 2 }] },
    ];
    const bonds = [
      { a: 1, b: 2, order: 1 as const },
      { a: 2, b: 3, order: 1 as const },
      { a: 3, b: 4, order: 1 as const },
    ];
    const text = writeMolfile({ atoms, bonds });
    expect(text).toContain("M  SDS EXP  1   1");
    expect(text).toContain("M  SPA   2  1   3");
    const again = read(text);
    expect(again.atoms.map((a) => a.el)).toEqual(["O", "C", "C", "C"]);
    expect(again.atoms[0].sgroups![0]).toMatchObject({ type: "SUP", label: "OMe" });
    expect(again.atoms[2].sgroups![0]).toMatchObject({ type: "MUL", multiplier: 2, paradigm: true });
    expect(again.atoms[3].sgroups![0].paradigm).toBeUndefined();
  });

  it("are their own when a structure is added twice", () => {
    const model = read(polymer);
    let doc = appendModel(emptyWorkspaceDocument(), model);
    doc = appendModel(doc, model);
    const ids = new Set(doc.model.atoms.flatMap((a) => (a.sgroups ?? []).map((g) => g.id)));
    expect(ids.size).toBe(4);
  });
});

describe("a haptic bond", () => {
  // a metal bonded to a three-membered ring's centre
  const haptic = v3(
    "BEGIN CTAB",
    "COUNTS 5 4 0 0 0",
    "BEGIN ATOM",
    "1 C 0 0 0 0",
    "2 C 1.5 0 0 0",
    "3 C 0.75 1.3 0 0",
    "4 * 0.75 0.43 0 0",
    "5 Fe 0.75 -1.5 0 0",
    "END ATOM",
    "BEGIN BOND",
    "1 1 1 2",
    "2 1 2 3",
    "3 1 3 1",
    "4 9 5 4 ENDPTS=(3 1 2 3) ATTACH=ALL",
    "END BOND",
    "END CTAB",
  );

  it("reaches the pi system's centre by a plain line, the centre drawn as nothing", () => {
    const model = read(haptic);
    const bond = model.bonds[3];
    expect(bond.endpoints).toEqual([1, 2, 3]);
    expect(bond.attach).toBe("all");
    const index = new Map(model.atoms.map((a, i) => [a.id, i]));
    const atoms: Atom[] = model.atoms.map((a) => ({ ...a }));
    const bonds: Bond[] = model.bonds.map((b) => ({ a1: index.get(b.a)!, a2: index.get(b.b)!, order: b.order, ...(b.dative ? { dative: true } : {}), ...(b.endpoints ? { endpoints: b.endpoints } : {}) }));
    const layout = layoutMolecule(atoms, bonds, opts(), 40);
    expect(layout.texts.map((t) => t.text)).toEqual(["Fe"]);
    // the line reaching the centre itself, not stopped short as at a label
    const star = model.atoms[3];
    expect(layout.lines.some((l) => Math.hypot(l.x2 - star.x, l.y2 - star.y) < 1e-6 || Math.hypot(l.x1 - star.x, l.y1 - star.y) < 1e-6)).toBe(true);
    // a plain line, though a coordination bond is otherwise a dative arrow
    expect(bondKind(bonds[3])).toBe("lines");
    expect(bondKind({ ...bonds[3], endpoints: undefined })).toBe("dative");
  });

  it("is written with its endpoints, in V3000", () => {
    const text = writeMolfile(read(haptic));
    expect(text).toContain("V3000");
    expect(text).toMatch(/ENDPTS=\(3 1 2 3\) ATTACH=ALL/);
  });
});
