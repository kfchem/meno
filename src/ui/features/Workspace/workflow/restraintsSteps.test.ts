import { describe, expect, it } from "vitest";
import type { SetEntry } from "./entries";
import { kindInfo, ONE_EXIT } from "./kinds";
import { NUMBERING, restraintRowsIn } from "../../../../lib/steps/restraints";
import { runMeno, runMenoPair } from "./meno";
import { torsionsSet, TORSIONS_UNLIKE, TORSIONS_UNLIKE_COUNT } from "./structureSteps";
import { menoFileBytes, readMenoFile } from "../../../../lib/doc/menoFile";
import { addMolecule3d, createWorkspaceDocument, emptyWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Molecule3D } from "../store/types";
import { readWorkspace, workspaceText } from "../utils/workspace";

/** Restraints and Torsion restraints as a workflow runs them, on entries whose places are set by hand. */

/** A step's entry of `els` at the places given, bonded as `bonds` says ([a1, a2, order], a fourth `true` for a coordination bond). */
const entry = (els: string[], xyz: number[], bonds: [number, number, number, true?][], properties: SetEntry["properties"] = {}): SetEntry =>
  ({
    compound: 0,
    number: 1,
    atoms: els.map((el) => ({ el })),
    bonds: bonds.map(([a1, a2, order, coordination]) => ({ a1, a2, order, ...(coordination ? { coordination } : {}) })),
    xyz,
    properties,
  }) as unknown as SetEntry;

/** 1,2-Dichloroethene: C1=C2 along x, 1.33 Å, each carbon's Cl (1.73 Å) and H (1.08 Å) 120° from the double bond - the chlorines cis, or trans. */
const dce = (cis: boolean, properties: SetEntry["properties"] = {}) => {
  const s = cis ? 1 : -1;
  return entry(
    ["C", "C", "Cl", "Cl", "H", "H"],
    [0, 0, 0, 1.33, 0, 0, -0.5 * 1.73, 0.866 * 1.73, 0, 1.33 + 0.5 * 1.73, s * 0.866 * 1.73, 0, -0.5 * 1.08, -0.866 * 1.08, 0, 1.33 + 0.5 * 1.08, -s * 0.866 * 1.08, 0],
    [
      [0, 1, 2],
      [0, 2, 1],
      [1, 3, 1],
      [0, 4, 1],
      [1, 5, 1],
    ],
    properties,
  );
};

/** C-N=N-C, azobenzene with each N's phenyl as its one carbon: the C-N=N-C torsion at `phi` (0° cis, 180° trans). */
const azo = (phi: number) => {
  const r = (phi * Math.PI) / 180;
  return entry(["C", "N", "N", "C"], [-0.7, 1.2, 0, 0, 0, 0, 1.25, 0, 0, 1.95, 1.2 * Math.cos(r), 1.2 * Math.sin(r)], [
    [0, 1, 1],
    [1, 2, 2],
    [2, 3, 1],
  ]);
};

/** H3N->BH3. */
const borane = entry(["B", "N", "H", "H"], [0, 0, 0, 1.65, 0, 0, -0.4, 1, 0, 2.05, 1, 0], [[0, 1, 1], [0, 2, 1], [1, 3, 1]]);

const tagged = (e: SetEntry, name: string, value: string): SetEntry => ({ ...e, properties: { ...e.properties, [name]: { value, unit: "none", status: "computed" } } });

/** The rows of the table a Restraints step gave. */
const rowsGiven = (o: ReturnType<typeof runMeno>) => {
  if (!o.ok) throw new Error(o.said);
  const t = o.tables?.[ONE_EXIT];
  if (!t) throw new Error("no table");
  const read = restraintRowsIn(t);
  if ("why" in read) throw new Error(read.why);
  return read.rows;
};

describe("Restraints, as a step", () => {
  it("gives a table of the pairs typed at their distance in each entry, at the strength typed, each row for its entry by its ID - and passes no molecule on", () => {
    const o = runMeno("restraints", [tagged(dce(true), "start", "p1"), tagged(dce(false), "start", "p2")], "molecules", { on: "start", factor: "0.9", distances: "3-4", strength: "1000" });
    const cl = (cis: boolean) => (cis ? 1.33 + 1.73 : Math.hypot(1.33 + 1.73, 2 * 0.866 * 1.73));
    const rows = rowsGiven(o);
    expect(rows.map((r) => [r.for, r.on, r.numbering, r.restraint.kind, r.restraint.atoms, r.restraint.strength, r.why])).toEqual([
      ["p1", "start", "its own", "distance", [2, 3], 1000, "typed: kept at its distance here"],
      ["p2", "start", "its own", "distance", [2, 3], 1000, "typed: kept at its distance here"],
    ]);
    expect(rows[0].restraint.value).toBeCloseTo(cl(true), 9);
    expect(rows[1].restraint.value).toBeCloseTo(cl(false), 9);
    expect(o.ok && o.kept).toEqual([]);
    // (coordination bonds asked, none marked: said, not passed over)
    expect(o.ok && o.said).toBe("2 rows for 2 entries \u00b7 no coordination bonds \u00b7 2 pairs at their distance");
  });

  it("has no factor of its own, and a strength measured to hold: it says what it needs, and runs on nothing until it has them", () => {
    const needs = kindInfo("restraints").needs!;
    expect(needs({})).toBe("Name the property each row is for (an ID a Tag wrote)");
    expect(needs({ on: "start" })).toBe("Set the factor");
    // (the strength 500 kcal/mol/Å² unless set - DISTANCE_STRENGTH's basis - and asked for where it is cleared)
    expect(needs({ on: "start", factor: "0.9" })).toBeUndefined();
    expect(needs({ on: "start", factor: "0.9", strength: "" })).toBe("Set the strength");
    expect(needs({ on: "start", factor: "-1", strength: "1000" })).toBe("The factor must be a number above 0");
    expect(needs({ on: "start", coordination: false })).toBe("Nothing to hold yet");
    // (atoms fixed need no strength: they are fixed)
    expect(needs({ on: "start", coordination: false, fixed: "1-2" })).toBeUndefined();
    expect(needs({ on: "start", coordination: false, distances: "1-2-3", strength: "5" })).toBe('"1-2-3" is not a pair of atoms');
    expect(runMeno("restraints", [borane], "molecules", { on: "start" })).toEqual({ ok: false, said: "Set the factor" });
    expect(kindInfo("restraints").how?.({ on: "start", factor: "0.9", strength: "1000", fixed: "1" })).toBe("Coordination bonds at 0.9 × van der Waals (Alvarez 2013); 1 atom fixed; 1000 kcal/mol/Å²; for each start");
    // (the default strength unsaid)
    expect(kindInfo("restraints").how?.({ on: "start", factor: "0.9", strength: "500" })).toBe("Coordination bonds at 0.9 × van der Waals (Alvarez 2013); for each start");
  });

  it("sets aside, saying why, an entry that has not the atom typed, no ID, or an ID another has too", () => {
    const o = runMeno(
      "restraints",
      [tagged(borane, "start", "b"), tagged(entry(["He"], [0, 0, 0], []), "start", "he"), borane, tagged(dce(true), "start", "x"), tagged(dce(false), "start", "x")],
      "molecules",
      { on: "start", coordination: false, fixed: "2" },
    );
    if (!o.ok) throw new Error(o.said);
    expect(rowsGiven(o).map((r) => [r.for, r.restraint])).toEqual([["b", { kind: "fixed", atoms: [1] }]]);
    expect(o.aside.map((e) => e.failed?.why)).toEqual([
      "It has no atom 2: its atoms are 1 to 1.",
      "It has no start to make its rows for: give it one (Tag)",
      "Its start, x, is another entry's here too: rows made for it would be both's",
      "Its start, x, is another entry's here too: rows made for it would be both's",
    ]);
    expect(o.said).toBe("1 row for 1 entry \u00b7 1 atom fixed \u00b7 4 failed");
  });

  it("writes in each row the numbering its entry is in: one Atom map numbered anew, by that map", () => {
    const mapped = { ...tagged(borane, "start", "b"), properties: { ...tagged(borane, "start", "b").properties, [NUMBERING]: { value: "as a #1 (x)", unit: "none" as const, status: "computed" as const, label: true as const } } };
    expect(rowsGiven(runMeno("restraints", [mapped], "molecules", { on: "start", coordination: false, fixed: "1" }))[0].numbering).toBe("as a #1 (x)");
  });
});

/** The Torsion restraints step's options, as its card would hold them: rows for each "start". */
const TORSIONS = { on: "start" };

describe("Torsion restraints, as a step", () => {
  it("gives a table of the torsions typed, each for its entry, at the angle typed - by a strength, or exactly", () => {
    const o = torsionsSet([tagged(dce(true), "start", "p1")], null, "molecules", { ...TORSIONS, torsions: "typed", atoms: "3-1-2-4", target: "-180", hold: "strength", strength: "50" });
    expect(rowsGiven(o).map((r) => [r.for, r.restraint])).toEqual([["p1", { kind: "dihedral", atoms: [2, 0, 1, 3], value: 180, strength: 50 }]]);
    expect(o.ok && o.said).toBe("1 row for 1 entry");
    const exact = torsionsSet([tagged(dce(true), "start", "p1")], null, "molecules", { ...TORSIONS, torsions: "typed", atoms: "3-1-2-4\n5 1 2 6", target: "180", hold: "exact" });
    expect(rowsGiven(exact).map((r) => r.restraint)).toEqual([
      { kind: "dihedral", atoms: [2, 0, 1, 3], value: 180, exact: true },
      { kind: "dihedral", atoms: [4, 0, 1, 5], value: 180, exact: true },
    ]);
  });

  it("from the reference, at 180° where trans: rows only for the torsions trans there and cis here, none for one already trans", () => {
    // (trans-1,2-dichloroethene holds Cl3-C1=C2-Cl4 and H5-C1=C2-H6 trans; the cis isomer neither)
    const o = torsionsSet([tagged(dce(true), "start", "p1"), tagged(dce(false), "start", "p2")], [dce(false)], "molecules", { ...TORSIONS, torsions: "reference", at: "trans", strength: "50" });
    expect(rowsGiven(o).map((r) => [r.for, r.restraint])).toEqual([
      ["p1", { kind: "dihedral", atoms: [2, 0, 1, 3], value: 180, strength: 50 }],
      ["p1", { kind: "dihedral", atoms: [4, 0, 1, 5], value: 180, strength: 50 }],
    ]);
    expect(o.ok && o.said).toBe("2 rows for 2 entries \u00b7 1 entry with none to hold");
  });

  it("matches each entry with its reference on a property; one it cannot, or one with no ID, out of Failed with why", () => {
    const refs = [tagged(dce(false), "product", "p-1"), tagged(dce(true), "product", "p-2")];
    const both = (e: SetEntry, product: string, start?: string) => (start ? tagged(tagged(e, "product", product), "start", start) : tagged(e, "product", product));
    const o = torsionsSet([both(dce(true), "p-1", "a"), both(dce(true), "p-3", "b"), both(dce(true), "p-1")], refs, "molecules", { ...TORSIONS, torsions: "reference", reference: "property", property: "product" });
    expect(rowsGiven(o).map((r) => r.for)).toEqual(["a", "a"]);
    expect(o.ok && o.aside.map((e) => e.failed?.why)).toEqual(["No entry of Reference has its product, p-3", "It has no start to make its rows for: give it one (Tag)"]);
    expect(torsionsSet([tagged(dce(true), "start", "a")], refs, "molecules", { ...TORSIONS, torsions: "reference" })).toEqual({ ok: false, said: "Against the one reference, but 2 came into Reference: match them on a property" });
  });

  it("refuses a reference wired with torsions typed, and torsions from a reference with none wired", () => {
    expect(torsionsSet([dce(true)], [dce(false)], "molecules", { ...TORSIONS, torsions: "typed", atoms: "3-1-2-4", target: "180" })).toEqual({
      ok: false,
      said: "A reference is wired, and the torsions are typed: choose From the reference, or take its wire away",
    });
    expect(torsionsSet([dce(true)], null, "molecules", { ...TORSIONS, torsions: "reference" })).toEqual({ ok: false, said: "Nothing comes into Reference: wire the reference, or type the torsions" });
  });

  it("sets aside, saying why, two entries with one ID; and writes in each row the numbering its entry is in", () => {
    const o = torsionsSet([tagged(dce(true), "start", "x"), tagged(dce(false), "start", "x"), tagged(dce(true), "start", "y")], null, "molecules", { ...TORSIONS, torsions: "typed", atoms: "3-1-2-4", target: "180" });
    if (!o.ok) throw new Error(o.said);
    expect(rowsGiven(o).map((r) => [r.for, r.numbering])).toEqual([["y", "its own"]]);
    expect(o.aside.map((e) => e.failed?.why)).toEqual(["Its start, x, is another entry's here too: rows made for it would be both's", "Its start, x, is another entry's here too: rows made for it would be both's"]);
    const mapped = { ...tagged(dce(true), "start", "p1"), properties: { ...tagged(dce(true), "start", "p1").properties, [NUMBERING]: { value: "as a #1 (x)", unit: "none" as const, status: "computed" as const, label: true as const } } };
    expect(rowsGiven(torsionsSet([mapped], null, "molecules", { ...TORSIONS, torsions: "typed", atoms: "3-1-2-4", target: "180" })).map((r) => r.numbering)).toEqual(["as a #1 (x)"]);
    expect(rowsGiven(torsionsSet([mapped], [dce(false)], "molecules", { ...TORSIONS, torsions: "reference" })).map((r) => r.numbering)).toEqual(["as a #1 (x)", "as a #1 (x)"]);
  });

  it("says, at 180°, the entries with a double bond cis in the reference it does not hold, and what does hold it", () => {
    const o = torsionsSet([tagged(azo(180), "start", "a"), tagged(azo(0), "start", "b")], [azo(0)], "molecules", { ...TORSIONS, torsions: "reference", at: "trans" });
    expect(o.ok && o.said).toBe("0 rows for 2 entries \u00b7 1 entry with none to hold \u00b7 1 entry with a double bond cis in the reference not held: choose Held at: the reference's own angle");
    expect(torsionsSet([tagged(azo(180), "start", "a")], [azo(0)], "molecules", { ...TORSIONS, torsions: "reference", at: "own" })).toMatchObject({ ok: true, said: "1 row for 1 entry" });
  });

  it("refuses an angle that is not written as a number in degrees: 0x10 is none", () => {
    expect(kindInfo("torsion-restraints").needs!({ on: "start", atoms: "1-2-3-4", target: "0x10" })).toBe("The angle must be a number, in degrees");
    expect(kindInfo("torsion-restraints").needs!({ on: "start", atoms: "1-2-3-4", target: "-1.5e2" })).toBeUndefined();
  });

  it("says what it needs - no angle of its own - and its line, the strength unless held exactly: 50 kcal/mol/rad² unless set, measured", () => {
    const needs = kindInfo("torsion-restraints").needs!;
    expect(needs({})).toBe("Name the property each row is for (an ID a Tag wrote)");
    expect(needs({ on: "start" })).toBe("Type the torsions, four atoms to a line");
    expect(needs({ on: "start", atoms: "1-2-3" })).toBe('"1-2-3" is not four different atoms from 1');
    expect(needs({ on: "start", atoms: "1-2-3-1" })).toBe('"1-2-3-1" is not four different atoms from 1');
    expect(needs({ on: "start", atoms: "1-2-3-4" })).toBe("Set the angle to hold them at");
    expect(needs({ on: "start", atoms: "1-2-3-4", target: "x" })).toBe("The angle must be a number, in degrees");
    expect(needs({ on: "start", atoms: "1-2-3-4", target: "180", strength: "" })).toBe("Set the strength");
    expect(needs({ on: "start", atoms: "1-2-3-4", target: "180" })).toBeUndefined();
    expect(needs({ on: "start", torsions: "reference", reference: "property" })).toBe("Name the property to pair them on");
    const how = kindInfo("torsion-restraints").how!;
    expect(how({ on: "start", atoms: "1-2-3-4", target: "-180" })).toBe("1 torsion at 180\u00b0, 50 kcal/mol/rad\u00b2; for each start");
    expect(how({ on: "start", torsions: "reference", hold: "exact" })).toBe("unlike the reference: trans there and cis here, at 180\u00b0, exactly; for each start");
    expect(how({ on: "start", torsions: "reference", at: "own", reference: "property", property: "product" })).toBe("unlike the reference: at its own angle, matched on product, 50 kcal/mol/rad\u00b2; for each start");
    expect(kindInfo("torsion-restraints").inputs?.map((p) => [p.name, p.optional ?? false])).toEqual([
      ["Molecules", false],
      ["Reference", true],
    ]);
    expect(kindInfo("torsion-restraints").others?.map((x) => x.id)).toEqual(["failed"]);
  });
});

describe("Compare torsions, as a step", () => {
  it("writes on each entry how many torsions are unlike its reference's, and which - every entry passed on", () => {
    const o = runMenoPair("compare-torsions", { entries: [dce(true), dce(false)], holds: "molecules" }, { entries: [dce(false)], holds: "molecules" }, {});
    if (!o.ok) throw new Error(o.said);
    expect(o.kept.map((e) => e.properties?.[TORSIONS_UNLIKE_COUNT]?.value)).toEqual([2, 0]);
    expect(o.kept.map((e) => e.properties?.[TORSIONS_UNLIKE]?.value)).toEqual(["Cl3-C1=C2-Cl4: 0.0\u00b0 (reference 180.0\u00b0); H5-C1=C2-H6: 0.0\u00b0 (reference 180.0\u00b0)", "none"]);
    expect(o.said).toBe("2 entries compared \u00b7 1 with torsions unlike the reference's");
    expect(kindInfo("compare-torsions").how?.({})).toBe("trans in the reference, cis here \u00b7 trans: more than 90\u00b0 either way (Klyne\u2013Prelog)");
    expect(kindInfo("compare-torsions").others?.map((x) => x.id)).toEqual(["failed"]);
  });

  it("says the entries whose reference's double bond, with no trans torsion, it checked by a cis one", () => {
    const o = runMenoPair("compare-torsions", { entries: [azo(180), azo(0)], holds: "molecules" }, { entries: [azo(0)], holds: "molecules" }, {});
    if (!o.ok) throw new Error(o.said);
    expect(o.kept.map((e) => e.properties?.[TORSIONS_UNLIKE_COUNT]?.value)).toEqual([1, 0]);
    expect(o.said).toBe("2 entries compared \u00b7 1 with torsions unlike the reference's \u00b7 2 entries checked by a cis torsion where the reference has no trans one");
  });

  it("sets one it cannot set against a reference out of Failed, with why", () => {
    const refs = [tagged(dce(false), "product", "p-1")];
    const o = runMenoPair("compare-torsions", { entries: [tagged(dce(true), "product", "p-2"), tagged(borane, "product", "p-1")], holds: "molecules" }, { entries: refs, holds: "molecules" }, { reference: "property", property: "product" });
    if (!o.ok) throw new Error(o.said);
    expect(o.aside.map((e) => e.failed?.why)).toEqual(["No entry of Reference has its product, p-2", "It has 4 atoms and the reference 6: both must hold the same atoms in one numbering."]);
  });
});

describe("restraints in a saved workspace", () => {
  it("are read back as they were when the workspace is opened again, none left out - a row held exactly, and where they were first held", () => {
    const e = dce(true);
    const restraints = { value: { restraints: [{ kind: "dihedral" as const, atoms: [2, 0, 1, 3], value: 180, exact: true as const }], start: [...e.xyz] }, unit: "none" as const, status: "computed" as const };
    const m: Omit<Molecule3D, "id"> = {
      at: { x: 0, y: 0 },
      atoms: e.atoms.map((a, i) => ({ el: a.el, x: e.xyz[3 * i], y: e.xyz[3 * i + 1], z: e.xyz[3 * i + 2] })),
      bonds: e.bonds.map((b) => ({ ...b })),
      properties: [{ restraints }],
    } as Omit<Molecule3D, "id">;
    const saving = createWorkspaceDocument();
    const store = createEditorStore(saving);
    connectStoreToDocument(store, saving);
    saving.edit("as it was", () => addMolecule3d(emptyWorkspaceDocument(), m));
    const ws = readWorkspace(readMenoFile(menoFileBytes(workspaceText(store.getState()), [])).workspace)!;
    expect(ws.leftOut).toBeUndefined();
    const opened = createWorkspaceDocument();
    const again = createEditorStore(opened);
    connectStoreToDocument(again, opened);
    again.getState().openWorkspace(ws, true);
    expect(again.getState().molecules3d[0].properties?.[0]?.restraints).toEqual(restraints);
  });
});
