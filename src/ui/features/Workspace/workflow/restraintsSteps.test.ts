import { describe, expect, it } from "vitest";
import type { Restraint } from "../../../../lib/entry";
import type { SetEntry } from "./entries";
import { kindInfo } from "./kinds";
import { runMeno, runMenoPair } from "./meno";
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

/** H3N->BH3. */
const borane = entry(["B", "N", "H", "H"], [0, 0, 0, 1.65, 0, 0, -0.4, 1, 0, 2.05, 1, 0], [[0, 1, 1], [0, 2, 1], [1, 3, 1]]);

const held = (e: SetEntry): Restraint[] => {
  const v = e.properties?.restraints?.value;
  return typeof v === "object" && v !== null && "restraints" in v ? v.restraints : [];
};
const tagged = (e: SetEntry, name: string, value: string): SetEntry => ({ ...e, properties: { ...e.properties, [name]: { value, unit: "none", status: "computed" } } });

describe("Restraints, as a step", () => {
  it("holds the pairs typed at their distance in each entry, at the strength typed, and says what it held", () => {
    const o = runMeno("restraints", [dce(true), dce(false)], "molecules", { factor: "0.9", distances: "3-4", strength: "1000" });
    if (!o.ok) throw new Error(o.said);
    const cl = (cis: boolean) => (cis ? 1.33 + 1.73 : Math.hypot(1.33 + 1.73, 2 * 0.866 * 1.73));
    expect(held(o.kept[0])).toEqual([{ kind: "distance", atoms: [2, 3], value: expect.closeTo(cl(true), 9), strength: 1000 }]);
    expect(held(o.kept[1])[0].value).toBeCloseTo(cl(false), 9);
    // (coordination bonds asked, none marked: said, not passed over)
    expect(o.said).toBe("2 entries restrained \u00b7 no coordination bonds \u00b7 2 pairs at their distance");
  });

  it("has no factor of its own, and a strength measured to hold: it says what it needs, and runs on nothing until it has them", () => {
    const needs = kindInfo("restraints").needs!;
    expect(needs({})).toBe("Set the factor");
    // (the strength 500 kcal/mol/Å² unless set - DISTANCE_STRENGTH's basis - and asked for where it is cleared)
    expect(needs({ factor: "0.9" })).toBeUndefined();
    expect(needs({ factor: "0.9", strength: "" })).toBe("Set the strength");
    expect(needs({ factor: "-1", strength: "1000" })).toBe("The factor must be a number above 0");
    expect(needs({ coordination: false })).toBe("Nothing to hold yet");
    // (atoms fixed need no strength: they are fixed)
    expect(needs({ coordination: false, fixed: "1-2" })).toBeUndefined();
    expect(needs({ coordination: false, distances: "1-2-3", strength: "5" })).toBe('"1-2-3" is not a pair of atoms');
    expect(runMeno("restraints", [borane], "molecules", {})).toEqual({ ok: false, said: "Set the factor" });
    expect(kindInfo("restraints").how?.({ factor: "0.9", strength: "1000", fixed: "1" })).toBe("Coordination bonds at 0.9 × van der Waals (Alvarez 2013); 1 atom fixed; 1000 kcal/mol/Å²");
    // (the default strength unsaid)
    expect(kindInfo("restraints").how?.({ factor: "0.9", strength: "500" })).toBe("Coordination bonds at 0.9 × van der Waals (Alvarez 2013)");
  });

  it("sets aside, saying why, an entry that has not the atom typed, and replaces what an entry held before", () => {
    const before = { restraints: { value: { restraints: [{ kind: "fixed" as const, atoms: [0] }] }, unit: "none" as const, status: "computed" as const } };
    const o = runMeno("restraints", [{ ...borane, properties: before }, entry(["He"], [0, 0, 0], [])], "molecules", { coordination: false, fixed: "2" });
    if (!o.ok) throw new Error(o.said);
    expect(held(o.kept[0])).toEqual([{ kind: "fixed", atoms: [1] }]);
    expect(o.aside[0].failed).toEqual({ kind: "refused", why: "It has no atom 2: its atoms are 1 to 1." });
    expect(o.said).toBe("1 entry restrained · 1 atom fixed · 1 entry's earlier distances and atoms fixed replaced · 1 failed");
  });
});

describe("Torsion restraints, as a step", () => {
  it("holds the torsions trans in the reference that are not trans here, 50 stronger each round, and passes on those trans already", () => {
    const first = runMenoPair("torsion-restraints", { entries: [dce(true), dce(false)], holds: "molecules" }, { entries: [dce(false)], holds: "molecules" }, { step: "50" });
    if (!first.ok) throw new Error(first.said);
    // (trans-1,2-dichloroethene holds Cl3-C1=C2-Cl4 and H5-C1=C2-H6 trans; the cis isomer neither)
    expect(held(first.kept[0])).toEqual([
      { kind: "dihedral", atoms: [2, 0, 1, 3], value: 180, strength: 50 },
      { kind: "dihedral", atoms: [4, 0, 1, 5], value: 180, strength: 50 },
    ]);
    expect(first.aside).toEqual([dce(false)]);
    expect(first.said).toBe("1 restrained · 1 trans already · 2 torsions newly held");
    // (a second round, still cis: each torsion 50 more)
    const second = runMenoPair("torsion-restraints", { entries: first.kept, holds: "molecules" }, { entries: [dce(false)], holds: "molecules" }, { step: "50" });
    if (!second.ok) throw new Error(second.said);
    expect(held(second.kept[0]).map((r) => r.strength)).toEqual([100, 100]);
    expect(second.said).toBe("1 restrained · 2 torsions held stronger");
  });

  it("matches each entry with its reference on a property, and does nothing where one has none, saying which", () => {
    const refs = [tagged(dce(false), "product", "p-1"), tagged(dce(true), "product", "p-2")];
    const o = runMenoPair("torsion-restraints", { entries: [tagged(dce(true), "product", "p-1"), tagged(dce(true), "product", "p-2")], holds: "molecules" }, { entries: refs, holds: "molecules" }, { reference: "property", property: "product", step: "50" });
    if (!o.ok) throw new Error(o.said);
    expect([o.kept.length, o.aside.length]).toEqual([1, 1]);
    expect(runMenoPair("torsion-restraints", { entries: [tagged(dce(true), "product", "p-3")], holds: "molecules" }, { entries: refs, holds: "molecules" }, { reference: "property", property: "product", step: "50" })).toEqual({
      ok: false,
      said: "1 entry could not be set against a reference: a #1: no entry of Reference has its product, p-3",
    });
    expect(runMenoPair("torsion-restraints", { entries: [dce(true)], holds: "molecules" }, { entries: refs, holds: "molecules" }, { step: "50" })).toEqual({
      ok: false,
      said: "Against the one reference, but 2 came into Reference: match them on a property",
    });
  });

  it("counts apart an entry whose reference has no trans torsion at all, from those trans already", () => {
    // (a reference with no double bond: no trans torsion to hold)
    const ref = entry(["C", "C", "H", "H"], [0, 0, 0, 1.54, 0, 0, -0.5, 0.9, 0, 2.04, 0.9, 0], [[0, 1, 1], [0, 2, 1], [1, 3, 1]]);
    const both = [tagged(dce(false), "product", "p-0"), tagged(ref, "product", "p-1")];
    const o = runMenoPair("torsion-restraints", { entries: both, holds: "molecules" }, { entries: both, holds: "molecules" }, { reference: "property", property: "product", step: "50" });
    if (!o.ok) throw new Error(o.said);
    expect(o.said).toBe("1 trans already · 1 with no trans torsion in its reference");
  });

  it("names every entry it could not set against a reference", () => {
    const refs = [tagged(dce(false), "product", "p-1")];
    const o = runMenoPair("torsion-restraints", { entries: [tagged(dce(true), "product", "p-2"), tagged(dce(true), "product", "p-3")], holds: "molecules" }, { entries: refs, holds: "molecules" }, { reference: "property", property: "product", step: "50" });
    expect(o).toEqual({ ok: false, said: "2 entries could not be set against a reference: a #1: no entry of Reference has its product, p-2; a #1: no entry of Reference has its product, p-3" });
  });

  it("adds 50 kcal/mol/rad² each time unless set - measured - and asks where it is cleared", () => {
    expect(kindInfo("torsion-restraints").needs?.({})).toBeUndefined();
    expect(kindInfo("torsion-restraints").needs?.({ step: "" })).toBe("Set the strength added");
    expect(kindInfo("torsion-restraints").how?.({})).toBe("held at 180°, +50 kcal/mol/rad²");
    expect(kindInfo("torsion-restraints").inputs?.map((p) => p.name)).toEqual(["Molecules", "Reference"]);
    expect(kindInfo("torsion-restraints").how?.({ reference: "property", property: "product", step: "50" })).toBe("held at 180°, +50 kcal/mol/rad², matched on product");
    expect(kindInfo("torsion-restraints").how?.({ step: "50" })).toBe("held at 180°, +50 kcal/mol/rad²");
  });
});

describe("restraints in a saved workspace", () => {
  it("are read back as they were when the workspace is opened again, none left out", () => {
    const held = runMenoPair("torsion-restraints", { entries: [dce(true)], holds: "molecules" }, { entries: [dce(false)], holds: "molecules" }, { step: "50" });
    if (!held.ok) throw new Error(held.said);
    const e = held.kept[0];
    const m: Omit<Molecule3D, "id"> = {
      at: { x: 0, y: 0 },
      atoms: e.atoms.map((a, i) => ({ el: a.el, x: e.xyz[3 * i], y: e.xyz[3 * i + 1], z: e.xyz[3 * i + 2] })),
      bonds: e.bonds.map((b) => ({ ...b })),
      properties: [e.properties!],
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
    expect(again.getState().molecules3d[0].properties?.[0]?.restraints).toEqual(e.properties!.restraints);
  });
});
