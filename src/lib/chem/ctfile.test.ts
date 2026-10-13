import { describe, expect, it } from "vitest";
import { readMolfile, readRxnfile, readSDfile, v30Items } from "./ctfile";

// Files written here to the letter of "CTfile Formats" (BIOVIA, Chemistry
// 2026), field by field: fixed columns where V2000 has them.

const f10 = (v: number) => v.toFixed(4).padStart(10);
const i3 = (n: number | string) => String(n).padStart(3);

/** A V2000 atom line: coordinates, symbol, then dd ccc sss hhh bbb vvv HHH rrr iii mmm nnn eee. */
function atomLine(x: number, y: number, el: string, f: Partial<Record<"dd" | "ccc" | "hhh" | "bbb" | "vvv" | "HHH" | "mmm" | "nnn" | "eee", number>> = {}) {
  const dd = String(f.dd ?? 0).padStart(2);
  const rest = [f.ccc, 0, f.hhh, f.bbb, f.vvv, f.HHH, 0, 0, f.mmm, f.nnn, f.eee].map((v) => i3(v ?? 0)).join("");
  return `${f10(x)}${f10(y)}${f10(0)} ${el.padEnd(3)}${dd}${rest}`;
}
/** A V2000 bond line: 111222tttsssxxxrrrccc. */
const bondLine = (a: number, b: number, t: number, s = 0, topo = 0, rx = 0) =>
  `${i3(a)}${i3(b)}${i3(t)}${i3(s)}${i3(0)}${i3(topo)}${i3(rx)}`;
const counts = (atoms: number, bonds: number, lists = 0, chiral = 0) =>
  `${i3(atoms)}${i3(bonds)}${i3(lists)}${i3(0)}${i3(chiral)}  0  0  0  0  0999 V2000`;

describe("a V2000 molfile", () => {
  it("reads every field of the atom block", () => {
    const mol = readMolfile(
      [
        "fields",
        "  Meno",
        "",
        counts(4, 0),
        atomLine(0, 0, "C", { dd: 1, ccc: 3, hhh: 1, bbb: 1, vvv: 15, mmm: 7, nnn: 1, eee: 1 }),
        atomLine(1, 0, "N", { ccc: 4, hhh: 3, vvv: 4, nnn: 2 }),
        atomLine(2, 0, "O", { ccc: 6, HHH: 1 }),
        atomLine(3, 0, "R#"),
        "M  END",
      ].join("\n"),
    )!;
    expect(mol.name).toBe("fields");
    const [c, n, o, r] = mol.atoms;
    // mass 12 + 1; charge code 3 = +1; H count + 1 = 1: H0; valence 15 = zero
    expect(c).toMatchObject({ symbol: "C", mass: 13, charge: 1, hCount: 0, stereoCare: true, valence: 0, map: 7, invRet: "invert", exactChange: true });
    // 4 a doublet; 3: H2; valence 4; 2 retained
    expect(n).toMatchObject({ radical: "doublet", hCount: 2, valence: 4, invRet: "retain" });
    expect(n.charge).toBeUndefined();
    // 6 = -2; the H0 designator
    expect(o).toMatchObject({ charge: -2, hCount: 0 });
    expect(r.symbol).toBe("R#");
  });

  it("reads every bond type, stereo, topology and reacting centre", () => {
    const mol = readMolfile(
      [
        "bonds",
        "",
        "",
        counts(11, 10),
        ...Array.from({ length: 11 }, (_, i) => atomLine(i, 0, "C")),
        bondLine(1, 2, 1, 1),
        bondLine(2, 3, 1, 6, 1),
        bondLine(3, 4, 1, 4, 2),
        bondLine(4, 5, 2, 3, 0, 4),
        bondLine(5, 6, 2, 0, 0, 12),
        bondLine(6, 7, 5),
        bondLine(7, 8, 6),
        bondLine(8, 9, 7),
        bondLine(9, 10, 8, 0, 0, -1),
        bondLine(10, 11, 4),
        "M  END",
      ].join("\n"),
    )!;
    const b = mol.bonds;
    expect(b[0]).toEqual({ a1: 0, a2: 1, type: 1, stereo: "up" });
    expect(b[1]).toMatchObject({ stereo: "down", topology: "ring" });
    expect(b[2]).toMatchObject({ stereo: "either", topology: "chain" });
    // a double bond's 3: cis or trans, not known
    expect(b[3]).toMatchObject({ type: 2, stereo: "either", reactingCentre: 4 });
    expect(b[4].stereo).toBeUndefined();
    expect(b[4].reactingCentre).toBe(12);
    expect(b.slice(5, 9).map((x) => x.type)).toEqual([5, 6, 7, 8]);
    expect(b[8].reactingCentre).toBe(-1);
    expect(b[9].type).toBe(4);
  });

  it("lets M  CHG and M  RAD supersede the atom block, and M  ISO give the mass", () => {
    const mol = readMolfile(
      [
        "",
        "",
        "",
        counts(3, 0),
        atomLine(0, 0, "N", { ccc: 3 }),
        atomLine(1, 0, "C", { ccc: 4 }),
        atomLine(2, 0, "C", { dd: 1 }),
        "M  CHG  1   1   2",
        "M  ISO  1   3  14",
        "M  END",
      ].join("\n"),
    )!;
    expect(mol.atoms[0].charge).toBe(2);
    // (its radical went with the atom block's charges)
    expect(mol.atoms[1].radical).toBeUndefined();
    expect(mol.atoms[2].mass).toBe(14);
  });

  it("reads aliases, values, atom lists and Rgroup labels", () => {
    const mol = readMolfile(
      [
        "",
        "",
        "",
        counts(4, 3, 1),
        atomLine(0, 0, "C"),
        atomLine(1, 0, "C"),
        atomLine(2, 0, "L"),
        atomLine(3, 0, "R#"),
        bondLine(1, 2, 1),
        bondLine(2, 3, 1),
        bondLine(2, 4, 1),
        // the atom list block: atom 3, a NOT list of N (7) and O (8)
        `${i3(3)} T    2   7   8`,
        "A    1",
        "OTBS",
        "V    2 sp3",
        "M  ALS   3  2 F N   S   ",
        "M  RGP  1   4   2",
        "M  END",
      ].join("\n"),
    )!;
    expect(mol.atoms[0].alias).toBe("OTBS");
    expect(mol.atoms[1].value).toBe("sp3");
    // M  ALS supersedes the atom list block
    expect(mol.atoms[2].list).toEqual({ not: false, symbols: ["N", "S"] });
    expect(mol.atoms[3].rgroups).toEqual([2]);
  });

  it("reads the atom list block where there is no M  ALS", () => {
    const mol = readMolfile(["", "", "", counts(1, 0, 1), atomLine(0, 0, "L"), `${i3(1)} T    2   7   8`, "M  END"].join("\n"))!;
    expect(mol.atoms[0].list).toEqual({ not: true, symbols: ["N", "O"] });
  });

  it("reads Sgroups: an abbreviation, a polymer's brackets, a data field", () => {
    const mol = readMolfile(
      [
        "",
        "",
        "",
        counts(5, 4),
        ...Array.from({ length: 5 }, (_, i) => atomLine(i, 0, i === 1 ? "O" : i === 2 ? "Si" : "C")),
        bondLine(1, 2, 1),
        bondLine(2, 3, 1),
        bondLine(3, 4, 1),
        bondLine(4, 5, 1),
        "M  STY  3   1 SUP   2 SRU   3 DAT",
        "M  SAL   1  2   2   3",
        "M  SBL   1  1   1",
        "M  SMT   1 OTMS",
        "M  SAP   1  1   2   1 Al",
        "M  SDS EXP  1   1",
        "M  SAL   2  1   5",
        "M  SBL   2  1   4",
        "M  SMT   2 n",
        "M  SCN  1   2 HT ",
        "M  SDI   2  4    3.5000   -0.5000    3.5000    0.5000",
        "M  SDI   2  4    4.5000   -0.5000    4.5000    0.5000",
        "M  SBT  1   2   1",
        "M  SAL   3  1   1",
        "M  SDT   3 purity                        N%                             ",
        "M  SDD   3     0.0000   -1.0000    DAU   ALL  0       0",
        "M  SCD   3 " + "x".repeat(69),
        "M  SED   3 99.5",
        "M  END",
      ].join("\n"),
    )!;
    const [sup, sru, dat] = mol.sgroups;
    expect(sup).toMatchObject({ type: "SUP", atoms: [1, 2], bonds: [0], label: "OTMS", expanded: true });
    expect(sup.attachments).toEqual([{ atom: 1, leaving: 0, id: "Al" }]);
    expect(sru).toMatchObject({ type: "SRU", atoms: [4], bonds: [3], label: "n", connect: "HT", bracketStyle: "paren" });
    expect(sru.brackets).toEqual([
      { x1: 3.5, y1: -0.5, x2: 3.5, y2: 0.5 },
      { x1: 4.5, y1: -0.5, x2: 4.5, y2: 0.5 },
    ]);
    expect(dat.field).toMatchObject({ name: "purity", type: "N", units: "%" });
    // SCD lines carry on to their SED
    expect(dat.field!.data).toEqual(["x".repeat(69) + "99.5"]);
  });

  it("reads an old group abbreviation as an abbreviation Sgroup", () => {
    const mol = readMolfile(
      ["", "", "", counts(3, 2), atomLine(0, 0, "C"), atomLine(1, 0, "O"), atomLine(2, 0, "C"), bondLine(1, 2, 1), bondLine(2, 3, 1), "G    3  2", "Me", "M  END"].join("\n"),
    )!;
    expect(mol.sgroups).toEqual([{ type: "SUP", index: 1, atoms: [2], bonds: [1], brackets: [], label: "Me" }]);
  });

  it("reads a number only as the whole of its field - an E exponent's too - and marks a line that does not read damaged", () => {
    const two = (second: string, bond = bondLine(1, 2, 1)) => readMolfile(["", "", "", counts(2, 1), atomLine(0, 0, "C"), second, bond, "M  END"].join("\n"))!;
    expect(two("1.1900E+01  -2.5e-01    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0").atoms[1]).toMatchObject({ x: 11.9, y: -0.25 });
    expect(two(atomLine(1.19, 0, "O")).damaged).toBeUndefined();
    expect(two("  1.19D+01    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0").damaged).toBe("an atom whose place is not a number");
    expect(two("    1.1900    0.0000").damaged).toBe("an atom with no symbol");
    // (a bond to an atom it has not is not kept, nor its record read)
    const far = two(atomLine(1.19, 0, "O"), bondLine(1, 4, 1));
    expect([far.damaged, far.bonds]).toEqual(["a bond to an atom it does not have", []]);
    // (a line that is no atom's where an atom's should be: the block ended - cut short, not damaged)
    const short = readMolfile(["", "", "", counts(2, 0), atomLine(0, 0, "C"), "M  END"].join("\n"))!;
    expect([short.cut, short.damaged]).toEqual([true, undefined]);
  });

  it("skips what S  SKP says to, and keeps the chiral flag", () => {
    const mol = readMolfile(["", "", "", counts(1, 0, 0, 1), atomLine(0, 0, "C"), "S  SKP  1", "M  CHG  1   1   1", "M  END"].join("\n"))!;
    expect(mol.atoms[0].charge).toBeUndefined();
    expect(mol.chiral).toBe(true);
  });
});

describe("a V3000 molfile", () => {
  const v3 = (...body: string[]) =>
    ["v3000", "  Meno", "", "  0  0  0     0  0            999 V3000", ...body.map((l) => `M  V30 ${l}`), "M  END"].join("\n");

  it("reads atoms by their own indices, with every keyword, across continued lines", () => {
    const mol = readMolfile(
      v3(
        "BEGIN CTAB",
        "COUNTS 4 3 0 0 1",
        "BEGIN ATOM",
        "10 C 0 0 0 3 CHG=1 MASS=13 VAL=-1 HCOUNT=-1 -",
        "INVRET=2 EXACHG=1 STBOX=1",
        "20 [N,O] 1.5 0 0 0",
        '30 "NOT [S,Se]" 3 0 0 0 RAD=2',
        "40 R# 4.5 0 0 0 RGROUPS=(2 1 3)",
        "END ATOM",
        "BEGIN BOND",
        "1 2 10 20 CFG=2",
        "2 1 20 30 CFG=3 TOPO=1 RXCTR=8",
        "3 10 30 40 DISP=HBOND2",
        "END BOND",
        "END CTAB",
      ),
    )!;
    expect(mol.version).toBe("V3000");
    expect(mol.chiral).toBe(true);
    expect(mol.atoms[0]).toMatchObject({ symbol: "C", map: 3, charge: 1, mass: 13, valence: 0, hCount: 0, invRet: "retain", exactChange: true, stereoCare: true });
    expect(mol.atoms[1]).toMatchObject({ symbol: "L", list: { not: false, symbols: ["N", "O"] } });
    expect(mol.atoms[2]).toMatchObject({ symbol: "L", list: { not: true, symbols: ["S", "Se"] }, radical: "doublet" });
    expect(mol.atoms[3]).toMatchObject({ symbol: "R#", rgroups: [1, 3] });
    expect(mol.bonds).toEqual([
      { a1: 0, a2: 1, type: 2, stereo: "either" },
      { a1: 1, a2: 2, type: 1, stereo: "down", topology: "ring", reactingCentre: 8 },
      { a1: 2, a2: 3, type: 10, display: "HBOND2" },
    ]);
  });

  it("reads a haptic bond's endpoints", () => {
    const mol = readMolfile(
      v3(
        "BEGIN CTAB",
        "COUNTS 5 4 0 0 0",
        "BEGIN ATOM",
        "1 C 0 0 0 0",
        "2 C 1 0 0 0",
        "3 C 0.5 1 0 0",
        "4 * 0.5 0.4 0 0",
        "5 Fe 0.5 2 0 0",
        "END ATOM",
        "BEGIN BOND",
        "1 1 1 2",
        "2 1 2 3",
        "3 1 3 1",
        "4 9 5 4 ENDPTS=(3 1 2 3) ATTACH=ALL",
        "END BOND",
        "END CTAB",
      ),
    )!;
    expect(mol.bonds[3]).toEqual({ a1: 4, a2: 3, type: 9, endpoints: [0, 1, 2], attach: "all" });
  });

  it("reads Sgroups and collections", () => {
    const mol = readMolfile(
      v3(
        "BEGIN CTAB",
        "COUNTS 3 2 2 0 0",
        "BEGIN ATOM",
        "1 C 0 0 0 0",
        "2 O 1 0 0 0",
        "3 C 2 0 0 0",
        "END ATOM",
        "BEGIN BOND",
        "1 1 1 2",
        "2 1 2 3",
        "END BOND",
        "BEGIN SGROUP",
        "1 SUP 0 ATOMS=(2 2 3) XBONDS=(1 1) LABEL=OMe SAP=(3 2 1 1) CSTATE=(4 1 -1.5 0 0)",
        '2 DAT 0 ATOMS=(1 1) FIELDNAME=note FIELDDISP="    0.0000    0.0000    DA    ALL  0       0" -',
        'FIELDDATA="a ""quoted"" note"',
        "END SGROUP",
        "BEGIN COLLECTION",
        "MDLV30/STEABS ATOMS=(1 1)",
        "MDLV30/STERAC1 ATOMS=(1 3)",
        "MDLV30/STEBREL2 BONDS=(1 2)",
        "END COLLECTION",
        "END CTAB",
      ),
    )!;
    const [sup, dat] = mol.sgroups;
    expect(sup).toMatchObject({ type: "SUP", atoms: [1, 2], bonds: [0], label: "OMe" });
    expect(sup.expanded).toBeUndefined();
    expect(sup.attachments).toEqual([{ atom: 1, leaving: 0, id: "1" }]);
    expect(sup.bondVectors).toEqual([{ bond: 0, x: -1.5, y: 0 }]);
    expect(dat.field).toMatchObject({ name: "note", data: ['a "quoted" note'] });
    expect(mol.collections).toEqual([
      { name: "MDLV30/STEABS", atoms: [0], bonds: [], sgroups: [] },
      { name: "MDLV30/STERAC1", atoms: [2], bonds: [], sgroups: [] },
      { name: "MDLV30/STEBREL2", atoms: [], bonds: [1], sgroups: [] },
    ]);
  });

  it("reads the Rgroups after the root", () => {
    const mol = readMolfile(
      v3(
        "BEGIN CTAB",
        "COUNTS 1 0 0 0 0",
        "BEGIN ATOM",
        "1 R# 0 0 0 0 RGROUPS=(1 1)",
        "END ATOM",
        "END CTAB",
        "BEGIN RGROUP 1",
        "RLOGIC 0 1 1-3",
        "BEGIN CTAB",
        "COUNTS 1 0 0 0 0",
        "BEGIN ATOM",
        "1 Cl 0 0 0 0 ATTCHPT=1",
        "END ATOM",
        "END CTAB",
        "END RGROUP",
      ),
    )!;
    expect(mol.rgroups).toHaveLength(1);
    expect(mol.rgroups[0].logic).toEqual({ then: 0, restH: true, occurrence: "1-3" });
    expect(mol.rgroups[0].members[0].atoms[0]).toMatchObject({ symbol: "Cl", attachPoint: 1 });
  });
});

describe("V3000 entries", () => {
  it("split at blanks, keep quoted strings and lists whole", () => {
    expect(v30Items('1 C 0 0 0 0 CHG=1 ATOMS=(2 1 2) LABEL="a b" X="say ""hi"""')).toEqual([
      "1",
      "C",
      "0",
      "0",
      "0",
      "0",
      "CHG=1",
      "ATOMS=(2 1 2)",
      "LABEL=a b",
      'X=say "hi"',
    ]);
  });
});

describe("an Rxnfile", () => {
  const mol = (name: string, el: string) => [name, "  Meno", "", counts(1, 0), atomLine(0, 0, el), "M  END"];

  it("takes V2000 blocks as reactants, products, then reagents", () => {
    const rxn = readRxnfile(
      ["$RXN", "test", "  Meno", "", "  2  1  1", "$MOL", ...mol("r1", "C"), "$MOL", ...mol("r2", "N"), "$MOL", ...mol("p", "O"), "$MOL", ...mol("g", "S")].join("\n"),
    );
    expect(rxn.name).toBe("test");
    expect(rxn.reactants.map((m) => m.atoms[0].symbol)).toEqual(["C", "N"]);
    expect(rxn.products.map((m) => m.atoms[0].symbol)).toEqual(["O"]);
    expect(rxn.reagents.map((m) => m.atoms[0].symbol)).toEqual(["S"]);
  });

  it("keeps a reactant whose name line is blank", () => {
    const rxn = readRxnfile(["$RXN", "", "", "", "  1  0", "$MOL", ...mol("", "Cl")].join("\n"));
    expect(rxn.reactants[0].atoms[0].symbol).toBe("Cl");
  });

  it("reads a V3000 Rxnfile's blocks of CTABs", () => {
    const ctab = (el: string, extra = "") => [
      "M  V30 BEGIN CTAB",
      `M  V30 COUNTS 1 0 0 0 0${extra}`,
      "M  V30 BEGIN ATOM",
      `M  V30 1 ${el} 0 0 0 1`,
      "M  V30 END ATOM",
      "M  V30 END CTAB",
    ];
    const rxn = readRxnfile(
      [
        "$RXN V3000",
        "v3",
        "  Meno",
        "",
        "M  V30 COUNTS 2 1 1",
        "M  V30 BEGIN REACTANT",
        ...ctab("C"),
        ...ctab("N"),
        "M  V30 END REACTANT",
        "M  V30 BEGIN PRODUCT",
        ...ctab("O"),
        "M  V30 END PRODUCT",
        "M  V30 BEGIN REAGENT",
        ...ctab("Al", " NAME=AlCl3"),
        "M  V30 END REAGENT",
        "M  END",
      ].join("\n"),
    );
    expect(rxn.reactants.map((m) => m.atoms[0].symbol)).toEqual(["C", "N"]);
    expect(rxn.products.map((m) => m.atoms[0].symbol)).toEqual(["O"]);
    expect(rxn.reagents[0].name).toBe("AlCl3");
    expect(rxn.reactants[0].atoms[0].map).toBe(1);
  });
});

describe("an SDfile", () => {
  it("reads each record, V2000 or V3000", () => {
    const v2 = ["a", "", "", counts(1, 0), atomLine(0, 0, "C"), "M  END", "> <id>", "1", ""];
    const v3 = ["b", "", "", "  0  0  0     0  0            999 V3000", "M  V30 BEGIN CTAB", "M  V30 COUNTS 1 0 0 0 0", "M  V30 BEGIN ATOM", "M  V30 1 N 0 0 0 0", "M  V30 END ATOM", "M  V30 END CTAB", "M  END"];
    const mols = readSDfile([...v2, "$$$$", ...v3, "$$$$", ""].join("\n"));
    expect(mols.map((m) => [m.name, m.atoms[0].symbol])).toEqual([
      ["a", "C"],
      ["b", "N"],
    ]);
  });
});
