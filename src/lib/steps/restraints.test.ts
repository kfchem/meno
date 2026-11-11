import { describe, expect, it } from "vitest";
import { valueFault, type Entry, type EntryBond, type Restraint } from "../entry";
import { speciesOf } from "../io/writers";
import { EXACT, OWN_NUMBERING, restraintKey, restraintRows, restraintRowsIn, restraintsHeld, restraintsTable, torsionsRestrained, transTorsions, type RestraintRow } from "./restraints";

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
    expect(restraintRowsIn(restraintsTable(rows))).toEqual({ rows });
    // (no strength in a torsion's cell: no row - neither held exactly nor at some strength)
    const t = restraintsTable(rows);
    const k = t.columns.findIndex((c) => c.name === "strength");
    const blank = { ...t, rows: t.rows.map((r, i) => (i === 1 ? r.map((c, j) => (j === k ? "" : c)) : r)) };
    expect(restraintRowsIn(blank)).toEqual({ why: 'Row 2 of the restraints does not read: its strength "" is neither "exact" nor a number above 0 in kcal/mol/rad\u00b2' });
    // (a strength in another kind's unit: not taken for this one's)
    const wrong = { ...t, rows: t.rows.map((r, i) => (i === 1 ? r.map((c, j) => (j === k ? "50 kcal/mol/\u00c5\u00b2" : c)) : r)) };
    expect("why" in restraintRowsIn(wrong)).toBe(true);
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

  it("takes a ring double bond's exocyclic torsions, which are trans, and not its own in the ring, which is cis", () => {
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

describe("Torsion restraints", () => {
  it("holds each torsion trans in the reference and not trans here at 180°, at the step, then the step more each time it is still not", () => {
    const z = butene(false);
    const first = torsionsRestrained(z, butene(true), 50);
    if ("failed" in first) throw new Error(first.failed);
    expect(first.count).toEqual({ trans: 2, wrong: 2, added: 2, raised: 0 });
    expect(valueFault(first.property.value, z)).toBeNull();
    expect(restraintsHeld({ properties: { restraints: first.property } })).toEqual([
      { kind: "dihedral", atoms: [0, 1, 2, 3], value: 180, strength: 50 },
      { kind: "dihedral", atoms: [4, 1, 2, 5], value: 180, strength: 50 },
    ]);
    // (still Z after a round: each raised to 100)
    const second = torsionsRestrained(butene(false, { restraints: first.property }), butene(true), 50);
    if ("failed" in second) throw new Error(second.failed);
    expect(second.count).toEqual({ trans: 2, wrong: 2, added: 0, raised: 2 });
    expect(restraintsHeld({ properties: { restraints: second.property } }).map((r) => r.strength)).toEqual([100, 100]);
  });

  it("keeps a torsion held that is trans now at the strength it reached, and what else the entry holds, as it was", () => {
    const held = {
      value: {
        restraints: [
          { kind: "distance" as const, atoms: [0, 3], value: 3.9, strength: 1000 },
          { kind: "dihedral" as const, atoms: [3, 2, 1, 0], value: 180, strength: 150 },
        ],
      },
      unit: "none" as const,
      status: "computed" as const,
    };
    const r = torsionsRestrained(butene(true, { restraints: held }), butene(true), 50);
    if ("failed" in r) throw new Error(r.failed);
    expect(r.count).toEqual({ trans: 2, wrong: 0, added: 0, raised: 0 });
    expect(r.property.value).toEqual(held.value);
  });

  it("fails, with the reason, for another numbering, or no 3D places", () => {
    const other = { ...butene(true), structure: { ...butene(true).structure, atoms: butene(true).structure.atoms.map((a, i) => (i === 4 ? { el: "F" } : a)) } };
    expect(torsionsRestrained(butene(false), other, 50)).toEqual({ failed: "Atom 5 is H here and F in the reference: both must hold the same atoms in one numbering." });
    expect(torsionsRestrained({ ...butene(false), geometry: { kind: "none" } }, butene(true), 50)).toEqual({ failed: "It has no 3D places to compare torsions in." });
    expect(torsionsRestrained(butene(false), { ...butene(true), geometry: { kind: "none" } }, 50)).toEqual({ failed: "The reference has no 3D places, so which torsions are trans in it is not known." });
  });
});
