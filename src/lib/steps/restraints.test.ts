import { describe, expect, it } from "vitest";
import { valueFault, type Entry, type EntryBond, type Restraint } from "../entry";
import { speciesOf } from "../io/writers";
import { angleIn, EXACT, isTrans, linearBy, OWN_NUMBERING, restraintKey, restraintRows, NONE_FOUND, NOTHING_KIND, restraintRowsIn, restraintsTable, torsionRowsFromReference, torsionRowsTyped, torsionsUnlike, torsionUnlikeText, transTorsions, type RestraintRow } from "./restraints";

/** Restraints from entries whose distances and dihedrals are set by hand, and radii as published. */

const entry = (atoms: [string, number, number, number][], bonds: EntryBond[], properties: Entry["properties"] = {}): Entry => ({
  id: "e",
  from: [],
  structure: { atoms: atoms.map(([el]) => ({ el })), bonds },
  geometry: { kind: "3d", xyz: atoms.flatMap(([, x, y, z]) => [x, y, z]) },
  species: speciesOf({ atoms: [], bonds: [] }),
  properties,
  status: "done",
});
const rowsOf = (e: Entry, r: ReturnType<typeof restraintRows>): Restraint[] => {
  if ("failed" in r) throw new Error(r.failed);
  const rows = r.rows.map((x) => x.restraint);
  expect(valueFault({ restraints: rows }, e)).toBeNull();
  return rows;
};

// H3N->BH3, its B-N bond a coordination bond
const borane = entry(
  [
    ["B", 0, 0, 0],
    ["N", 1.65, 0, 0],
    ["H", -0.4, 1.0, 0],
    ["H", 2.05, 1.0, 0],
  ],
  [
    { a1: 0, a2: 1, order: 1, coordination: true },
    { a1: 0, a2: 2, order: 1 },
    { a1: 1, a2: 3, order: 1 },
  ],
);

/** But-2-ene, its methyls as carbons alone, a hydrogen on each end of its double bond: E (`trans`) or Z. */
const butene = (trans: boolean, properties: Entry["properties"] = {}) =>
  entry(
    [
      ["C", -0.75, 1.299, 0],
      ["C", 0, 0, 0],
      ["C", 1.34, 0, 0],
      ["C", 2.09, trans ? -1.299 : 1.299, 0],
      ["H", -0.54, -0.935, 0],
      ["H", 1.88, trans ? 0.935 : -0.935, 0],
    ],
    [
      { a1: 0, a2: 1, order: 1 },
      { a1: 1, a2: 2, order: 2 },
      { a1: 2, a2: 3, order: 1 },
      { a1: 1, a2: 4, order: 1 },
      { a1: 2, a2: 5, order: 1 },
    ],
    properties,
  );

// Cu-N, a coordination bond, the copper's other ligand an ammonia's N: as CHEM's worked row
const copper = entry(
  [
    ["Cu", 0, 0, 0],
    ["N", 2.0, 0, 0],
    ["H", 2.4, 0.95, 0],
  ],
  [
    { a1: 0, a2: 1, order: 1, coordination: true },
    { a1: 1, a2: 2, order: 1 },
  ],
);

describe("Restraints", () => {
  it("keeps a coordination bond at the factor given of the van der Waals radii together, Alvarez's B (1.91 Å) and N (1.66 Å), at the strength given", () => {
    const rows = rowsOf(borane, restraintRows(borane, { coordination: 0.9, strength: 1000 }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "distance", atoms: [0, 1], strength: 1000 });
    expect(rows[0].value).toBeCloseTo(0.9 * (1.91 + 1.66), 12);
    expect(rowsOf(borane, restraintRows(borane, { coordination: 1, strength: 5 }))[0].value).toBeCloseTo(3.57, 12);
    // (none asked: none held)
    expect(rowsOf(borane, restraintRows(borane, {}))).toEqual([]);
  });

  it("holds Cu-N in contact: 0.9 × (2.38 + 1.66) = 3.636 Å at 500 kcal/mol/Å², and says so - not a bond's length", () => {
    const r = restraintRows(copper, { coordination: 0.9, strength: 500 });
    if ("failed" in r) throw new Error(r.failed);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].restraint).toEqual({ kind: "distance", atoms: [0, 1], value: expect.closeTo(3.636, 12), strength: 500 });
    expect(r.rows[0].why).toBe("coordination bond in contact, 0.9 \u00d7 vdW (Alvarez)");
  });

  it("keeps listed pairs at their distance in the entry, and fixes listed atoms with neither value nor strength", () => {
    const t = entry(
      [
        ["C", 0, 0, 0],
        ["C", 3, 0, 0],
        ["C", 0, 4, 0],
      ],
      [],
    );
    expect(rowsOf(t, restraintRows(t, { distances: [[1, 2]], fixed: [0, 0], strength: 200 }))).toEqual([
      { kind: "distance", atoms: [1, 2], value: 5, strength: 200 },
      { kind: "fixed", atoms: [0] },
    ]);
  });

  it("makes its rows from the entry alone: whatever it carried is no row of its", () => {
    const held = { value: { restraints: [{ kind: "dihedral" as const, atoms: [0, 1, 2, 3], value: 180, strength: 150 }] }, unit: "none" as const, status: "computed" as const };
    expect(rowsOf(butene(false), restraintRows(butene(false, { restraints: held }), { fixed: [0] }))).toEqual([{ kind: "fixed", atoms: [0] }]);
  });

  it("fails, with the reason: an atom the entry has not, an element with no radius, no strength for a distance, no 3D places", () => {
    expect(restraintRows(borane, { fixed: [4] })).toEqual({ failed: "It has no atom 5: its atoms are 1 to 4." });
    const pm = entry(
      [
        ["Pm", 0, 0, 0],
        ["O", 2.3, 0, 0],
      ],
      [{ a1: 0, a2: 1, order: 1, coordination: true }],
    );
    expect(restraintRows(pm, { coordination: 0.9, strength: 1000 })).toEqual({ failed: "No van der Waals radius is known for Pm, so its coordination bond cannot be kept." });
    expect(restraintRows(borane, { coordination: 0.9 })).toEqual({ failed: "A distance held needs a strength above 0." });
    expect(restraintRows({ ...borane, geometry: { kind: "none" } }, {})).toEqual({ failed: "It has no 3D places to take restraints from." });
    expect(restraintRows({ ...borane, geometry: { kind: "frames", frames: [] } }, {})).toEqual({ failed: "It holds frames: take one frame first (Take frames)." });
  });
});

describe("a restraints table", () => {
  const made = (restraint: Restraint, why = "typed"): RestraintRow => ({ restraint, why, for: "p1", on: "start", numbering: OWN_NUMBERING });
  const rows: RestraintRow[] = [
    made({ kind: "distance", atoms: [0, 1], value: 0.9 * (2.38 + 1.66), strength: 500 }, "coordination bond in contact, 0.9 \u00d7 vdW (Alvarez)"),
    made({ kind: "dihedral", atoms: [0, 1, 2, 3], value: 180, strength: 50 }),
    made({ kind: "dihedral", atoms: [4, 1, 2, 5], value: 180, exact: true }),
    made({ kind: "fixed", atoms: [6, 3] }),
  ];

  it("says each row as a chemist reads it: what it is for, its kind, atoms from 1, its target in its unit, its strength with its unit - or exact", () => {
    const t = restraintsTable(rows);
    const at = (name: string) => t.columns.findIndex((c) => c.name === name);
    expect(t.columns.find((c) => c.name === "target distance")).toMatchObject({ kind: "number", unit: "\u00c5" });
    expect(t.columns.find((c) => c.name === "target angle")).toMatchObject({ kind: "number", unit: "\u00b0" });
    expect(t.rows.map((r) => [r[at("for")], r[at("on")], r[at("kind")], r[at("atoms")], r[at("strength")]])).toEqual([
      ["p1", "start", "distance", "1-2", "500 kcal/mol/\u00c5\u00b2"],
      ["p1", "start", "torsion", "1-2-3-4", "50 kcal/mol/rad\u00b2"],
      ["p1", "start", "torsion", "5-2-3-6", EXACT],
      ["p1", "start", "atoms fixed", "7, 4", "fixed where they stand"],
    ]);
    // (a target is always a number: in its kind's column, the other blank)
    expect(t.rows[0][at("target distance")]).toBeCloseTo(3.636, 12);
    expect(t.rows[1][at("target angle")]).toBe(180);
    expect(t.rows[1][at("target distance")]).toBeNull();
  });

  it("reads back as it was made, exact said - never read from a strength left out", () => {
    expect(restraintRowsIn(restraintsTable(rows))).toEqual({ rows, nothing: [] });
    // (a molecule found to have nothing to hold: a row of its own, after the rest, read back apart)
    const nothing = [{ for: "p7", on: "start", numbering: OWN_NUMBERING, why: NONE_FOUND }];
    const both = restraintsTable(rows, nothing);
    expect(both.rows[rows.length].slice(0, 2)).toEqual([NOTHING_KIND, ""]);
    expect(restraintRowsIn(both)).toEqual({ rows, nothing });
    // (one that names no molecule does not read)
    const nobody = { ...both, rows: both.rows.map((r, i) => (i === rows.length ? r.map((c, j) => (both.columns[j].name === "for" ? "" : c)) : r)) };
    expect(restraintRowsIn(nobody)).toEqual({ why: `Row ${rows.length + 1} of the restraints does not read: it does not say which molecule it is for` });
    // (no strength in a torsion's cell: no row - neither held exactly nor at some strength)
    const t = restraintsTable(rows);
    const k = t.columns.findIndex((c) => c.name === "strength");
    const blank = { ...t, rows: t.rows.map((r, i) => (i === 1 ? r.map((c, j) => (j === k ? "" : c)) : r)) };
    expect(restraintRowsIn(blank)).toEqual({ why: 'Row 2 of the restraints does not read: its strength "" is neither "exact" nor a number above 0 in kcal/mol/rad\u00b2' });
    // (a strength in another kind's unit: not taken for this one's)
    const wrong = { ...t, rows: t.rows.map((r, i) => (i === 1 ? r.map((c, j) => (j === k ? "50 kcal/mol/\u00c5\u00b2" : c)) : r)) };
    expect("why" in restraintRowsIn(wrong)).toBe(true);
  });

  it("is refused, the row named, where a row's strength is not above 0, an atom is named twice, or atoms fixed say a strength", () => {
    const t = restraintsTable(rows);
    const at = (name: string) => t.columns.findIndex((c) => c.name === name);
    const cell = (r: number, name: string, v: string) => ({ ...t, rows: t.rows.map((x, i) => (i === r ? x.map((c, j) => (j === at(name) ? v : c)) : x)) });
    expect(restraintRowsIn(cell(1, "strength", "0 kcal/mol/rad\u00b2"))).toEqual({ why: 'Row 2 of the restraints does not read: its strength "0 kcal/mol/rad\u00b2" is neither "exact" nor a number above 0 in kcal/mol/rad\u00b2' });
    expect(restraintRowsIn(cell(1, "strength", "-50 kcal/mol/rad\u00b2"))).toMatchObject({ why: expect.stringContaining("Row 2") });
    expect(restraintRowsIn(cell(0, "atoms", "1-1"))).toEqual({ why: 'Row 1 of the restraints does not read: its atoms "1-1" are not 2 different atoms from 1' });
    expect(restraintRowsIn(cell(3, "strength", "500 kcal/mol/\u00c5\u00b2"))).toEqual({ why: 'Row 4 of the restraints does not read: atoms fixed have no strength, not "500 kcal/mol/\u00c5\u00b2"' });
  });

  it("is refused, saying why, where it is no restraints table: a column missing, a target in another unit", () => {
    const t = restraintsTable(rows);
    expect(restraintRowsIn({ ...t, columns: t.columns.filter((c) => c.name !== "numbering") })).toEqual({ why: 'It is no table of restraints: it has no column "numbering"' });
    expect(restraintRowsIn({ ...t, columns: t.columns.map((c) => (c.name === "target distance" ? { ...c, unit: "nm" as const } : c)) })).toEqual({ why: 'Its column "target distance" is not in \u00c5' });
  });

  it("knows two rows hold the same atoms as the same kind, either way round", () => {
    expect(restraintKey({ kind: "dihedral", atoms: [0, 1, 2, 3], value: 0, strength: 1 })).toBe(restraintKey({ kind: "dihedral", atoms: [3, 2, 1, 0], value: 180, exact: true }));
    expect(restraintKey({ kind: "distance", atoms: [0, 1], value: 0, strength: 1 })).not.toBe(restraintKey({ kind: "dihedral", atoms: [0, 1, 2, 3], value: 0, strength: 1 }));
  });
});

describe("a restraint held exactly", () => {
  it("says so, with no strength; one with neither strength nor exact is no restraint", () => {
    const e = butene(true);
    expect(valueFault({ restraints: [{ kind: "dihedral", atoms: [0, 1, 2, 3], value: 180, exact: true }] }, e)).toBeNull();
    expect(valueFault({ restraints: [{ kind: "dihedral", atoms: [0, 1, 2, 3], value: 180 }] }, e)).toBe("Restraint 1 has a strength of undefined");
    expect(valueFault({ restraints: [{ kind: "dihedral", atoms: [0, 1, 2, 3], value: 180, strength: 5, exact: true }] }, e)).toBe("Restraint 1 is held exactly, so it has no strength");
    expect(valueFault({ restraints: [{ kind: "fixed", atoms: [0], exact: true }] }, e)).toBe("Restraint 1 fixes atoms, so it has neither value nor strength");
  });
});

describe("the torsions trans across a reference's double bonds", () => {
  it("takes each pair of the ends' neighbours, hydrogens among them, whose dihedral is over 90°, and no cis one", () => {
    // (E: methyl to methyl and H to H trans; methyl to H cis)
    expect(transTorsions(butene(true))).toEqual([
      [0, 1, 2, 3],
      [4, 1, 2, 5],
    ]);
    // (Z: methyl to H, both ways, trans)
    expect(transTorsions(butene(false))).toEqual([
      [0, 1, 2, 5],
      [4, 1, 2, 3],
    ]);
  });

  it("takes a flat cyclobutene's two ring C-C=C-H torsions, which are trans - not its ring's own C4-C1=C2-C3 nor its H-C1=C2-H, which are cis", () => {
    // (cyclobutene, flat: C1=C2 in the ring, a hydrogen on each)
    const ring = entry(
      [
        ["C", 0, 0, 0],
        ["C", 1.35, 0, 0],
        ["C", 1.35, 1.55, 0],
        ["C", 0, 1.55, 0],
        ["H", -0.9, -0.6, 0],
        ["H", 2.25, -0.6, 0],
      ],
      [
        { a1: 0, a2: 1, order: 2 },
        { a1: 1, a2: 2, order: 1 },
        { a1: 2, a2: 3, order: 1 },
        { a1: 3, a2: 0, order: 1 },
        { a1: 0, a2: 4, order: 1 },
        { a1: 1, a2: 5, order: 1 },
      ],
    );
    expect(transTorsions(ring)).toEqual([
      [3, 0, 1, 5],
      [4, 0, 1, 2],
    ]);
  });

  it("takes none across an aromatic ring's bonds, which are double in its Kekulé structure alone", () => {
    const ring = Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3), Math.sin((i * Math.PI) / 3)]);
    const benzene = entry(
      [...ring.map(([x, y]): [string, number, number, number] => ["C", 1.39 * x, 1.39 * y, 0]), ...ring.map(([x, y]): [string, number, number, number] => ["H", 2.47 * x, 2.47 * y, 0])],
      [...ring.map((_, i) => ({ a1: i, a2: (i + 1) % 6, order: (i % 2 ? 1 : 2) as 1 | 2 })), ...ring.map((_, i) => ({ a1: i, a2: i + 6, order: 1 as const }))],
    );
    expect(transTorsions(benzene)).toEqual([]);
  });
});

/** C1-C2=C3-C4, its double bond C2=C3 along x, C1 in the xy plane, C4 turned about the bond by `phi` from it: its torsion `phi`. */
const fourAt = (phi: number, els = ["C", "C", "C", "C"]) => {
  const r = (phi * Math.PI) / 180;
  return entry(
    [
      [els[0], -0.75, 1.299, 0],
      [els[1], 0, 0, 0],
      [els[2], 1.34, 0, 0],
      [els[3], 2.09, 1.299 * Math.cos(r), 1.299 * Math.sin(r)],
    ],
    [
      { a1: 0, a2: 1, order: 1 },
      { a1: 1, a2: 2, order: 2 },
      { a1: 2, a2: 3, order: 1 },
    ],
  );
};

describe("trans and cis (Klyne and Prelog)", () => {
  it("is trans more than 90° either way, cis at 90° and within: 90.0° cis, 90.1° and -179.9° trans; -180° is 180°", () => {
    expect([90, 90.1, -90, -90.1, -179.9, 0].map(isTrans)).toEqual([false, true, false, true, true, false]);
    expect([-180, 540, -190, 190].map(angleIn)).toEqual([180, 180, 170, -170]);
  });
});

describe("Compare torsions' rule", () => {
  it("counts each torsion trans in the reference and cis here: (Z)- against (E)-but-2-ene, 2 - Me-Me and H-H - named with their angles", () => {
    const z = butene(false);
    const u = torsionsUnlike(z, butene(true));
    if ("failed" in u) throw new Error(u.failed);
    expect(u.unlike.map((x) => x.atoms)).toEqual([
      [0, 1, 2, 3],
      [4, 1, 2, 5],
    ]);
    expect(u.unlike.map((x) => torsionUnlikeText(z, x))).toEqual(["C1-C2=C3-C4: 0.0\u00b0 (reference 180.0\u00b0)", "H5-C2=C3-H6: 0.0\u00b0 (reference 180.0\u00b0)"]);
    expect(u.cisOnly).toBe(0);
    // (E against E: none)
    expect(torsionsUnlike(butene(true), butene(true))).toEqual({ unlike: [], cisOnly: 0 });
  });

  it("judges the side alone: 95° against 180° is alike; 90° is cis, so unlike", () => {
    expect(torsionsUnlike(fourAt(95), fourAt(180))).toEqual({ unlike: [], cisOnly: 0 });
    expect(torsionsUnlike(fourAt(90), fourAt(180))).toMatchObject({ unlike: [{ atoms: [0, 1, 2, 3], transThere: true }] });
  });

  it("checks a double bond with no trans torsion in the reference by its cis one: (E)- against (Z)-azobenzene's N=N, 1 (each N's phenyl as its one carbon)", () => {
    const azo = (phi: number) => fourAt(phi, ["C", "N", "N", "C"]);
    expect(torsionsUnlike(azo(180), azo(0))).toMatchObject({ unlike: [{ atoms: [0, 1, 2, 3], transThere: false }], cisOnly: 1 });
    expect(torsionsUnlike(azo(0), azo(0))).toEqual({ unlike: [], cisOnly: 1 });
  });

  it("fails, with the reason, for another numbering, or no 3D places", () => {
    const other = { ...butene(true), structure: { ...butene(true).structure, atoms: butene(true).structure.atoms.map((a, i) => (i === 4 ? { el: "F" } : a)) } };
    expect(torsionsUnlike(butene(false), other)).toEqual({ failed: "Atom 5 is H here and F in the reference: both must hold the same atoms in one numbering." });
    expect(torsionsUnlike({ ...butene(false), geometry: { kind: "none" } }, butene(true))).toEqual({ failed: "It has no 3D places to compare torsions in." });
    expect(torsionsUnlike(butene(false), { ...butene(true), geometry: { kind: "none" } })).toEqual({ failed: "The reference has no 3D places, so which torsions are trans in it is not known." });
  });
});

describe("Torsion restraints", () => {
  it("holds the torsions typed at the angle typed, by a strength or exactly, -180° written 180°", () => {
    const z = butene(false);
    expect(torsionRowsTyped(z, [[0, 1, 2, 3]], 180, { strength: 50 })).toEqual({ rows: [{ restraint: { kind: "dihedral", atoms: [0, 1, 2, 3], value: 180, strength: 50 }, why: "typed: held at 180\u00b0" }] });
    expect(torsionRowsTyped(z, [[0, 1, 2, 3]], -180, { exact: true })).toEqual({ rows: [{ restraint: { kind: "dihedral", atoms: [0, 1, 2, 3], value: 180, exact: true }, why: "typed: held at 180\u00b0" }] });
    const rows = torsionRowsTyped(z, [[0, 1, 2, 3]], 180, { exact: true });
    if ("failed" in rows) throw new Error(rows.failed);
    expect(valueFault({ restraints: rows.rows.map((r) => r.restraint) }, z)).toBeNull();
  });

  it("refuses a torsion over an atom linear by its bonds - but-2-yne, even bent to 178.5°; propyne's H-C1-C2#C3 - three atoms on a line, and an atom the entry has not", () => {
    // (but-2-yne: C1-C2#C3-C4, bent at C2 to `at` degrees)
    const yne = (at: number) => {
      const r = ((180 - at) * Math.PI) / 180;
      return entry(
        [
          ["C", -1.46 * Math.cos(r), 1.46 * Math.sin(r), 0],
          ["C", 0, 0, 0],
          ["C", 1.2, 0, 0],
          ["C", 2.66, 0, 0],
          ["H", -1.46 * Math.cos(r) - 0.5, 1.46 * Math.sin(r) + 0.9, 0],
        ],
        [
          { a1: 0, a2: 1, order: 1 },
          { a1: 1, a2: 2, order: 3 },
          { a1: 2, a2: 3, order: 1 },
          { a1: 0, a2: 4, order: 1 },
        ],
      );
    };
    expect(torsionRowsTyped(yne(180), [[0, 1, 2, 3]], 180, { strength: 50 })).toEqual({ failed: "C2 is linear by its bonds (a triple bond): the torsion 1-2-3-4 has no angle to hold." });
    expect(torsionRowsTyped(yne(178.5), [[0, 1, 2, 3]], 180, { strength: 50 })).toEqual({ failed: "C2 is linear by its bonds (a triple bond): the torsion 1-2-3-4 has no angle to hold." });
    // (H-C1-C2#C3: its third atom is the alkyne's)
    expect(torsionRowsTyped(yne(178.5), [[4, 0, 1, 2]], 180, { strength: 50 })).toEqual({ failed: "C2 is linear by its bonds (a triple bond): the torsion 5-1-2-3 has no angle to hold." });
    // (a cumulene's centre: two double bonds)
    const allene = entry(
      [
        ["H", -0.9, 0.5, 0],
        ["C", 0, 0, 0],
        ["C", 1.31, 0, 0],
        ["C", 2.62, 0, 0],
      ],
      [
        { a1: 0, a2: 1, order: 1 },
        { a1: 1, a2: 2, order: 2 },
        { a1: 2, a2: 3, order: 2 },
      ],
    );
    expect(torsionRowsTyped(allene, [[0, 1, 2, 3]], 90, { strength: 50 })).toEqual({ failed: "C3 is linear by its bonds (two double bonds): the torsion 1-2-3-4 has no angle to hold." });
    // (a sulfone's S, two S=O and tetrahedral: dimethyl sulfone's H-C-S-C is a torsion to hold)
    const sulfone = entry(
      [
        ["H", -0.5, 0.9, 0.4],
        ["C", 0, 0, 0],
        ["S", 1.78, 0, 0],
        ["C", 2.38, 1.69, 0],
        ["O", 2.25, -0.7, 1.2],
        ["O", 2.25, -0.7, -1.2],
      ],
      [
        { a1: 0, a2: 1, order: 1 },
        { a1: 1, a2: 2, order: 1 },
        { a1: 2, a2: 3, order: 1 },
        { a1: 2, a2: 4, order: 2 },
        { a1: 2, a2: 5, order: 2 },
      ],
    );
    expect(torsionRowsTyped(sulfone, [[0, 1, 2, 3]], 180, { strength: 50 })).toMatchObject({ rows: [{ restraint: { kind: "dihedral", atoms: [0, 1, 2, 3] } }] });
    // (three single-bonded atoms within 1° of a line: Meno's numerical guard)
    const flat = entry(
      [
        ["C", -1.5, 0.01, 0],
        ["C", 0, 0, 0],
        ["C", 1.5, 0.01, 0],
        ["C", 2.5, 1.2, 0],
      ],
      [
        { a1: 0, a2: 1, order: 1 },
        { a1: 1, a2: 2, order: 1 },
        { a1: 2, a2: 3, order: 1 },
      ],
    );
    expect(torsionRowsTyped(flat, [[0, 1, 2, 3]], 180, { strength: 50 })).toEqual({ failed: "Atoms 1, 2, 3 lie on a line here, within 1\u00b0: the torsion 1-2-3-4 has no angle to hold." });
    expect(torsionRowsTyped(yne(180), [[0, 1, 2, 7]], 180, { strength: 50 })).toEqual({ failed: "It has no atom 8: its atoms are 1 to 5." });
  });

  it("takes an N of charge +1 with two double bonds as linear by its bonds - an azide's central N, nitronium - but not a neutral one (NO2, bent), nor SO2's S (bent by its lone pair)", () => {
    // (hydrogen azide, H-N1=N2(+)=N3(-), its N-N-N bent to 171°: refused all the same, by its bonds)
    const bend = (171 * Math.PI) / 180;
    const azide = entry(
      [
        ["H", -0.31, 0.97, 0],
        ["N", 0, 0, 0],
        ["N", 1.24, 0, 0],
        ["N", 1.24 - 1.13 * Math.cos(bend), -1.13 * Math.sin(bend), 0],
      ],
      [
        { a1: 0, a2: 1, order: 1 },
        { a1: 1, a2: 2, order: 2 },
        { a1: 2, a2: 3, order: 2 },
      ],
    );
    azide.structure.atoms[2] = { el: "N", charge: 1 };
    azide.structure.atoms[3] = { el: "N", charge: -1 };
    expect(linearBy(azide, 2)).toBe("two double bonds");
    expect(torsionRowsTyped(azide, [[0, 1, 2, 3]], 180, { strength: 50 })).toEqual({ failed: "N3 is linear by its bonds (two double bonds): the torsion 1-2-3-4 has no angle to hold." });
    // (O=N=O: nitronium, N of charge +1, linear; nitrogen dioxide, neutral, bent at about 134°; SO2, its S bent by its lone pair)
    const triatomic = (el: string, charge: number | undefined, at: number) => {
      const half = ((at / 2) * Math.PI) / 180;
      const e = entry(
        [
          [el, 0, 0, 0],
          ["O", 1.2 * Math.cos(half), 1.2 * Math.sin(half), 0],
          ["O", 1.2 * Math.cos(half), -1.2 * Math.sin(half), 0],
        ],
        [
          { a1: 0, a2: 1, order: 2 },
          { a1: 0, a2: 2, order: 2 },
        ],
      );
      if (charge != null) e.structure.atoms[0] = { el, charge };
      return e;
    };
    expect(linearBy(triatomic("N", 1, 180), 0)).toBe("two double bonds");
    expect(linearBy(triatomic("N", undefined, 134), 0)).toBeNull();
    expect(linearBy(triatomic("S", undefined, 119), 0)).toBeNull();
    expect(linearBy(triatomic("O", undefined, 119), 1)).toBeNull();
  });

  it("refuses a torsion whose three atoms fold back within 1° of 0°, as within 1° of 180°", () => {
    // (C1 and C3 seen from C2 within 0.6° of one another)
    const folded = entry(
      [
        ["C", 3.0, 0.03, 0],
        ["C", 0, 0, 0],
        ["C", 1.5, 0, 0],
        ["C", 2.0, 1.4, 0],
      ],
      [
        { a1: 0, a2: 1, order: 1 },
        { a1: 1, a2: 2, order: 1 },
        { a1: 2, a2: 3, order: 1 },
      ],
    );
    expect(torsionRowsTyped(folded, [[0, 1, 2, 3]], 180, { strength: 50 })).toEqual({ failed: "Atoms 1, 2, 3 lie on a line here, within 1\u00b0: the torsion 1-2-3-4 has no angle to hold." });
  });

  it("from the reference, 180° where trans: rows only for the torsions trans there and cis here - (Z)- against (E)-but-2-ene's two", () => {
    const r = torsionRowsFromReference(butene(false), butene(true), "trans", { strength: 50 });
    if ("failed" in r) throw new Error(r.failed);
    expect(r.rows.map((x) => x.restraint)).toEqual([
      { kind: "dihedral", atoms: [0, 1, 2, 3], value: 180, strength: 50 },
      { kind: "dihedral", atoms: [4, 1, 2, 5], value: 180, strength: 50 },
    ]);
    expect(r.rows[0].why).toBe("trans across C2=C3 of the reference (180.0\u00b0); here 0.0\u00b0");
    expect(r.notHeld).toBe(0);
    // (E against E: none to hold)
    expect(torsionRowsFromReference(butene(true), butene(true), "trans", { strength: 50 })).toEqual({ rows: [], notHeld: 0 });
  });

  it("counts a double bond not held once, however many of its torsions are unlike", () => {
    // (ethene, flat here; in the reference each end's hydrogens drawn to one side, every torsion cis: two trans here and cis there, across one bond)
    const ethene = (hs: [number, number, number][]) =>
      entry(
        [["C", 0, 0, 0], ["C", 1.33, 0, 0], ...hs.map(([x, y, z]): [string, number, number, number] => ["H", x, y, z])],
        [
          { a1: 0, a2: 1, order: 2 },
          { a1: 0, a2: 2, order: 1 },
          { a1: 0, a2: 3, order: 1 },
          { a1: 1, a2: 4, order: 1 },
          { a1: 1, a2: 5, order: 1 },
        ],
      );
    const flat = ethene([[-0.54, 0.935, 0], [-0.54, -0.935, 0], [1.87, 0.935, 0], [1.87, -0.935, 0]]);
    const oneSide = ethene([[-0.54, 0.9, 0.25], [-0.54, 0.9, -0.25], [1.87, 0.9, 0.25], [1.87, 0.9, -0.25]]);
    expect(torsionsUnlike(flat, oneSide)).toMatchObject({ unlike: [{ transThere: false }, { transThere: false }], cisOnly: 1 });
    expect(torsionRowsFromReference(flat, oneSide, "trans", { strength: 50 })).toEqual({ rows: [], notHeld: 1 });
  });

  it("cannot hold at 180° a double bond with no trans torsion in its reference, and says so; at the reference's own angle, it does", () => {
    const azo = (phi: number) => fourAt(phi, ["C", "N", "N", "C"]);
    expect(torsionRowsFromReference(azo(180), azo(0), "trans", { strength: 50 })).toEqual({ rows: [], notHeld: 1 });
    const own = torsionRowsFromReference(azo(180), azo(0), "own", { exact: true });
    if ("failed" in own) throw new Error(own.failed);
    expect(own.rows.map((x) => x.restraint)).toEqual([{ kind: "dihedral", atoms: [0, 1, 2, 3], value: expect.closeTo(0, 9), exact: true }]);
    expect(own.notHeld).toBe(0);
  });
});
