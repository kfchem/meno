import { describe, expect, it } from "vitest";
import { moleculesToEditorModel, readMoleculesFromText } from "../../utils/importers";
import { ACS_LABEL_SET, buildTextLabels, labelHulls, type Atom, type Bond, type LayoutOptions } from "./layout2d";
import { acsWorldOptions, NOMINAL_BOND_LENGTH } from "./acs";
import { writeMolfile } from "./molWriter";
import { placedAbbreviation } from "./abbreviationPlace";

const L = NOMINAL_BOND_LENGTH;
const opts = (): LayoutOptions => acsWorldOptions([], [], { units: "world" });
const f10 = (v: number) => v.toFixed(4).padStart(10);
const atomLine = (x: number, y: number, el: string) => `${f10(x)}${f10(y)}${f10(0)} ${el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`;
const i3 = (n: number) => String(n).padStart(3);
const molfile = (atoms: [number, number, string][], bonds: [number, number, number][], props: string[] = []) =>
  [
    "",
    "  Meno",
    "",
    `${i3(atoms.length)}${i3(bonds.length)}  0  0  0  0  0  0  0  0999 V2000`,
    ...atoms.map(([x, y, el]) => atomLine(x, y, el)),
    ...bonds.map(([a, b, o]) => `${i3(a)}${i3(b)}${i3(o)}  0  0  0  0`),
    ...props,
    "M  END",
  ].join("\n");
const read = (text: string) => moleculesToEditorModel(readMoleculesFromText(text, "mol")).model;

// ethanol's O as OTMS, an abbreviation Sgroup of four atoms: C1-C2-O3(-Si4(C5)(C6)C7)
const silylEther = molfile(
  [
    [0, 0, "C"],
    [1.3, 0.75, "C"],
    [2.6, 0, "O"],
    [3.9, 0.75, "Si"],
    [5.2, 0, "C"],
    [3.9, 2.25, "C"],
    [5.2, 1.5, "C"],
  ],
  [
    [1, 2, 1],
    [2, 3, 1],
    [3, 4, 1],
    [4, 5, 1],
    [4, 6, 1],
    [4, 7, 1],
  ],
  ["M  STY  1   1 SUP", "M  SAL   1  5   3   4   5   6   7", "M  SBL   1  1   2", "M  SMT   1 OTMS"],
);

describe("an abbreviation from a file", () => {
  it("is one atom labelled with it, holding the atoms it stands for", () => {
    const model = read(silylEther);
    expect(model.atoms.map((a) => a.el)).toEqual(["C", "C", "OTMS"]);
    const otms = model.atoms[2];
    expect(otms.abbrev!.atoms.map((a) => a.el)).toEqual(["O", "Si", "C", "C", "C"]);
    expect(otms.abbrev!.bonds).toHaveLength(4);
    expect(otms.abbrev!.attach).toEqual([0]);
    // its O where the label is, the rest where they were from it
    expect(otms.abbrev!.atoms[0]).toMatchObject({ x: 0, y: 0 });
    // the bond into it ends on the label
    expect(model.bonds).toHaveLength(2);
    expect(model.bonds[1].b).toBe(otms.id);
  });

  it("stays expanded where the file shows it so", () => {
    const model = read(silylEther.replace("M  END", "M  SDS EXP  1   1\nM  END"));
    expect(model.atoms.map((a) => a.el)).toEqual(["C", "C", "O", "Si", "C", "C", "C"]);
  });

  it("is written out again whole, with its Sgroup, and read back the same", () => {
    const model = read(silylEther);
    const text = writeMolfile(model);
    expect(text).toContain("M  STY  1   1 SUP");
    expect(text).toContain("M  SMT   1 OTMS");
    const again = read(text);
    expect(again.atoms.map((a) => a.el)).toEqual(["C", "C", "OTMS"]);
    expect(again.atoms[2].abbrev!.atoms.map((a) => a.el)).toEqual(["O", "Si", "C", "C", "C"]);
  });

  it("reads an alias as the atom's label", () => {
    const model = read(molfile([[0, 0, "C"], [1.3, 0, "C"]], [[1, 2, 1]], ["A    2", "OTBS"]));
    expect(model.atoms[1].el).toBe("OTBS");
  });

  it("reads an alias with its letters' case as written: CO is carbon monoxide, Co cobalt - on a metal and off one", () => {
    // (the alias on a star atom, as Meno writes one, or on a carbon)
    for (const [metal, symbol] of [["Fe", "*"], ["Cr", "C"], ["C", "*"]] as const) {
      const as = (alias: string) => read(molfile([[0, 0, metal], [1.8, 0, symbol]], [[1, 2, 1]], ["A    2", alias])).atoms[1].el;
      expect(as("CO"), metal).toBe("CO");
      expect(as("Co"), metal).toBe("Co");
      // (in small letters only: an element's symbol, as a label typed so is read)
      expect(as("co"), metal).toBe("Co");
    }
    // (nor any other label that is an element's symbol in another case: HO is no holmium, NO no nobelium)
    const as = (alias: string) => read(molfile([[0, 0, "C"], [1.3, 0, "*"]], [[1, 2, 1]], ["A    2", alias])).atoms[1].el;
    expect(["HO", "NO", "CS", "SC"].map(as)).toEqual(["HO", "NO", "CS", "SC"]);
    // (an atom's own symbol, in whatever case a file writes it, is still the element's)
    expect(read(molfile([[0, 0, "C"], [1.3, 0, "CL"]], [[1, 2, 1]])).atoms[1].el).toBe("Cl");
  });

  it("writes CO on a metal and reads it back as CO, not cobalt", () => {
    const text = writeMolfile({
      atoms: [
        { id: 1, x: 0, y: 0, el: "Fe" },
        { id: 2, x: L, y: 0, el: "CO" },
      ],
      bonds: [{ a: 1, b: 2, order: 1 }],
    });
    expect(text).toContain("A    2\nCO\n");
    expect(read(text).atoms.map((a) => a.el)).toEqual(["Fe", "CO"]);
  });
});

describe("a label written", () => {
  const two = (el: string, at: "left" | "right"): { atoms: Atom[]; bonds: Bond[] } => ({
    atoms: [
      { id: 1, x: at === "left" ? L : 0, y: 0, el },
      { id: 2, x: at === "left" ? 0 : L, y: 0, el: "C" },
    ],
    bonds: [{ a1: 0, a2: 1, order: 1 }],
  });

  it("reads outward from a ring at each of its corners: away from the ring on its left side, on along it elsewhere", () => {
    // (a hexagon, point up, its corners from the top clockwise; NFmoc at each in turn)
    const ring = Array.from({ length: 6 }, (_, i) => ({ x: L * Math.cos(Math.PI / 2 - (i * Math.PI) / 3), y: L * Math.sin(Math.PI / 2 - (i * Math.PI) / 3) }));
    const shown = ring.map((_, at) => {
      const atoms: Atom[] = ring.map((p, i) => ({ id: i + 1, x: p.x, y: p.y, el: i === at ? "NFmoc" : "C" }));
      const bonds: Bond[] = ring.map((_, i) => ({ a1: i, a2: (i + 1) % 6, order: 1 }));
      return buildTextLabels(atoms, opts(), bonds)[0].text;
    });
    // (top and foot: bonds either side, read on as written; the right side: bonds to its left; the left side: from the right)
    expect(shown).toEqual(["NFmoc", "NFmoc", "NFmoc", "NFmoc", "FmocN", "FmocN"]);
  });

  it("reads outward from its bond: OTBS with its bond on the left, TBSO on the right", () => {
    const left = two("OTBS", "left");
    const [l] = buildTextLabels(left.atoms, opts(), left.bonds);
    expect(l.text).toBe("OTBS");
    expect(l.runs![l.anchorRun!].text).toBe("O");
    const right = two("OTBS", "right");
    const [r] = buildTextLabels(right.atoms, opts(), right.bonds);
    expect(r.text).toBe("TBSO");
    // the O is what sits on the atom
    expect(r.runs![r.anchorRun!].text).toBe("O");
  });

  it("sets a name of one unit before a bond coming in from the right, its last letter on the atom", () => {
    const left = two("TMS", "left");
    const [l] = buildTextLabels(left.atoms, opts(), left.bonds);
    expect(l.text).toBe("TMS");
    expect(l.runs![l.anchorRun!].text).toBe("TMS");
    const right = two("TMS", "right");
    const [r] = buildTextLabels(right.atoms, opts(), right.bonds);
    expect(r.text).toBe("TMS");
    expect(r.runs!.map((x) => x.text)).toEqual(["TM", "S"]);
    expect(r.runs![r.anchorRun!].text).toBe("S");
  });

  it("reads a ring's substituents named first as written, whichever side its bond is on", () => {
    // on the right of its bond: from the bond, the ring's name last
    const left = two("2,6-diMeBz", "left");
    const [l] = buildTextLabels(left.atoms, opts(), left.bonds);
    expect(l.text).toBe("2,6-diMeBz");
    expect(l.runs![l.anchorRun!].text.startsWith("2")).toBe(true);
    // on its left: the ring at the bond, a formula's by its C6
    const right = two("4-MeOC6H4", "right");
    const [r] = buildTextLabels(right.atoms, opts(), right.bonds);
    expect(r.text).toBe("4-MeOC6H4");
    expect(r.runs![r.anchorRun!].text).toBe("C");
  });

  it("sets the t of t-Bu in italics, on either side", () => {
    const left = two("Ot-Bu", "left");
    const [l] = buildTextLabels(left.atoms, opts(), left.bonds);
    expect(l.runs!.filter((r) => r.italic).map((r) => r.text)).toEqual(["t"]);
    const right = two("Ot-Bu", "right");
    const [r] = buildTextLabels(right.atoms, opts(), right.bonds);
    expect(r.text).toBe("t-BuO");
    expect(r.runs!.filter((x) => x.italic).map((x) => x.text)).toEqual(["t"]);
  });

  it("sets counts as subscripts and takes no hydrogens", () => {
    const right = two("CO2Me", "right");
    const [label] = buildTextLabels(right.atoms, opts(), right.bonds);
    expect(label.text).toBe("MeO2C");
    expect(label.runs).toEqual([{ text: "MeO" }, { text: "2", sub: true }, { text: "C" }]);
  });

  it("writes an Rgroup with its number superscript, and an atom list in brackets", () => {
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "R#", rgroups: [1] },
      { id: 2, x: L, y: 0, el: "C" },
      { id: 3, x: 2 * L, y: 0, el: "L", list: { not: false, symbols: ["N", "O"] } },
    ];
    const labels = buildTextLabels(atoms, opts(), [
      { a1: 0, a2: 1, order: 1 },
      { a1: 1, a2: 2, order: 1 },
    ]);
    expect(labels[0].runs).toEqual([{ text: "R" }, { text: "1", sup: true, part: true }]);
    expect(labels[1].text).toBe("[N,O]");
  });

  it("counts an atom's hydrogens to the valence a file gives it", () => {
    // a carbene: carbon of valence two, bonded once
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C", valence: 2 },
      { id: 2, x: L, y: 0, el: "C" },
    ];
    const [label] = buildTextLabels(atoms, opts(), [{ a1: 0, a2: 1, order: 1 }]);
    expect(label.text).toBe("HC");
  });
});

describe("what a file is written with", () => {
  it("an abbreviation the dictionary knows, written out and placed", () => {
    const text = writeMolfile({
      atoms: [
        { id: 1, x: 0, y: 0, el: "C" },
        { id: 2, x: L, y: 0, el: "OTBS" },
      ],
      bonds: [{ a: 1, b: 2, order: 1 }],
    });
    const atomLines = text.split("\n").slice(4, 13);
    expect(atomLines.map((l) => l.slice(31, 34).trim())).toEqual(["C", "O", "Si", "C", "C", "C", "C", "C", "C"]);
    expect(text).toContain("M  SMT   1 OTBS");
  });

  it("an Ar drawn with a bond as the aryl group's symbol, a label - argon alone as the element", () => {
    const text = writeMolfile({ atoms: [{ id: 1, x: 0, y: 0, el: "C" }, { id: 2, x: L, y: 0, el: "Ar" }, { id: 3, x: 3 * L, y: 0, el: "Ar" }], bonds: [{ a: 1, b: 2, order: 1 }] });
    const lines = text.split("\n");
    // (the bonded one a star with its label; the lone one argon)
    expect(lines[5].slice(31, 34).trim()).toBe("*");
    expect(text).toContain("A    2\nAr\n");
    expect(lines[6].slice(31, 34).trim()).toBe("Ar");
    expect(read(text).atoms.map((a) => a.el)).toEqual(["C", "Ar", "Ar"]);
  });

  // (not Ar, which is argon's symbol as well as aryl's: IUPAC GR-9.2)
  it("any other label as a star atom with an alias; Rgroups, lists, valence and hydrogen counts in their fields", () => {
    const text = writeMolfile({
      atoms: [
        { id: 1, x: 0, y: 0, el: "C", valence: 2, hCount: 0 },
        { id: 2, x: L, y: 0, el: "Nu" },
        { id: 3, x: 2 * L, y: 0, el: "R#", rgroups: [2] },
        { id: 4, x: 3 * L, y: 0, el: "L", list: { not: true, symbols: ["N", "O"] } },
      ],
      bonds: [],
    });
    const lines = text.split("\n");
    expect(lines[4].slice(31, 34).trim()).toBe("C");
    // hhh: one more than the count; vvv: the valence
    expect(lines[4].slice(42, 45).trim()).toBe("1");
    expect(lines[4].slice(48, 51).trim()).toBe("2");
    expect(lines[5].slice(31, 34).trim()).toBe("*");
    expect(text).toContain("A    2\nNu\n");
    expect(text).toContain("M  RGP  1   3   2");
    expect(text).toContain("M  ALS   4  2 T N   O   ");
    // and read back as they were
    const again = read(text);
    expect(again.atoms.map((a) => [a.el, a.valence, a.hCount, a.rgroups, a.list])).toEqual([
      ["C", 2, 0, undefined, undefined],
      ["Nu", undefined, undefined, undefined, undefined],
      ["R#", undefined, undefined, [2], undefined],
      ["L", undefined, undefined, undefined, { not: true, symbols: ["N", "O"] }],
    ]);
  });

  it("in V3000, a label as an abbreviation Sgroup of its one atom, and long lines continued", () => {
    const text = writeMolfile(
      {
        atoms: [
          { id: 1, x: 0, y: 0, el: "Nu" },
          { id: 2, x: L, y: 0, el: "L", list: { not: true, symbols: ["N", "O", "S"] } },
        ],
        bonds: [],
      },
      { version: "V3000" },
    );
    expect(text).toContain('M  V30 2 "NOT [N,O,S]" ');
    expect(text).toMatch(/M {2}V30 1 SUP 0 ATOMS=\(1 1\) LABEL=Nu/);
    expect(text.split("\n").every((l) => l.length <= 80)).toBe(true);
  });
});

describe("a dictionary abbreviation placed", () => {
  it("lies on from the bond into it, a bond length apart", () => {
    // its neighbour to the left: the group runs on to the right
    const s = placedAbbreviation("OMe", { x: -L, y: 0 }, L)!;
    expect(s.atoms[0]).toMatchObject({ el: "O", x: 0, y: 0 });
    expect(Math.hypot(s.atoms[1].x, s.atoms[1].y)).toBeCloseTo(L, 6);
    expect(s.atoms[1].x).toBeGreaterThan(0);
  });
});

describe("an Rgroup's number", () => {
  it("is part of its label: the bonds stop short of it", () => {
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "R#", rgroups: [12] },
      { id: 2, x: L, y: L, el: "C" },
    ];
    const [label] = buildTextLabels(atoms, opts(), [{ a1: 0, a2: 1, order: 1 }]);
    // R, 1 and 2: every glyph in the outline a bond is cut at
    expect(labelHulls(label, 1, ACS_LABEL_SET, false)).toHaveLength(3);
  });
});
