import { describe, expect, it } from "vitest";
import { calcOf } from "../../../../lib/calc/output";
import { addMolecule3d, createWorkspaceDocument, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Molecule3D } from "../store/types";
import { readWorkspace, workspaceText } from "../utils/workspace";
import { entryOfSet, setEntries, setMolecules } from "./entries";
import { resultOf } from "./flow";
import { addSet, addStep, connect } from "./model";
import { runStep, speciesKept, type RunWith } from "./run";

const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };

/** Water's radical cation as an xTB optimisation gives it: charge +1 and a doublet, said by the calculation - its atoms say neither. */
function cation(): Omit<Molecule3D, "id"> {
  const atoms = [
    { el: "O", x: 0, y: 0, z: 0 },
    { el: "H", x: 0.99, y: 0, z: 0 },
    { el: "H", x: -0.25, y: 0.96, z: 0 },
  ];
  return {
    at: { x: 0, y: 0 },
    atoms,
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    energies: [-75.9],
    calc: calcOf({ atoms: atoms.map((a) => a.el), frames: [atoms.flatMap((a) => [a.x, a.y, a.z])], program: "xtb", method: "GFN2-xTB", charge: 1, multiplicity: 2 }, ["xtb 6.7.1"]),
  };
}

/** `doc` saved as a workspace file and opened again on a new canvas: its document there. */
function reopened(doc: WorkspaceDocument): WorkspaceDocument {
  const saving = createWorkspaceDocument();
  const store = createEditorStore(saving);
  connectStoreToDocument(store, saving);
  saving.edit("as it was", () => doc);
  const text = workspaceText(store.getState());
  const ws = readWorkspace(text);
  expect(ws?.leftOut).toBeUndefined();
  const opening = createWorkspaceDocument();
  const again = createEditorStore(opening);
  connectStoreToDocument(again, opening);
  again.getState().openWorkspace(ws!, true);
  return opening.getState();
}

/** A page with the cation in a set (1), wired into a Filter (2) keeping all. */
function filtered(): WorkspaceDocument {
  let doc = emptyWorkspaceDocument();
  doc = addMolecule3d(doc, cation());
  doc = addSet(doc, { x0: -3, y0: -3, x1: 3, y1: 3 });
  doc = addStep(doc, "filter", 10, 0, { conditions: "number ≥ 1", match: "all" });
  return runStep(connect(doc, { set: 1 }, 2), 2, W);
}

/** The charge and multiplicity the entries of a step's result set are given to the next step as. */
const species = (doc: WorkspaceDocument, step: number) =>
  setEntries(setMolecules(doc, resultOf(doc, step)!), "molecules").map((e, i) => {
    const s = entryOfSet(e, String(i)).species;
    return [s?.charge, s?.multiplicity, s?.from.charge];
  });

describe("the charge and spin a step was given, saved and opened again", () => {
  it("keeps those of a Filter's result made after a calculation - never taken from its atoms instead", () => {
    const doc = filtered();
    expect(doc.steps!.find((s) => s.id === 2)!.ran?.ok).toBe(true);
    // (in the session: the calculation's)
    expect(species(doc, 2)).toEqual([[1, 2, "given"]]);
    // (opened again: still the calculation's - not 0 and a singlet, which its atoms alone would say)
    expect(species(reopened(doc), 2)).toEqual([[1, 2, "given"]]);
  });

  it("keeps those of a calculation's own result, opened again and then through a Filter", () => {
    let doc = reopened(addSet(addMolecule3d(emptyWorkspaceDocument(), cation()), { x0: -3, y0: -3, x1: 3, y1: 3 }));
    expect(setEntries(setMolecules(doc, doc.sets![0]), "molecules").map((e) => [e.charge, e.multiplicity])).toEqual([[1, 2]]);
    doc = addStep(doc, "filter", 10, 0, { conditions: "number ≥ 1", match: "all" });
    const step = doc.steps![doc.steps!.length - 1].id;
    doc = runStep(connect(doc, { set: doc.sets![0].id }, step), step, W);
    expect(species(reopened(doc), step)).toEqual([[1, 2, "given"]]);
  });

  it("keeps those a Meno step kept with no calculation of its own (its record read by no reader), opened again and through a Filter after", () => {
    // (the cation as a Meno step leaves one given its charge and spin with no calculation of its own: workflow/run speciesKept)
    const { calc: _, ...bare } = cation();
    const kept = speciesKept({ compound: 0, number: 1, atoms: [], bonds: [], xyz: [], charge: 1, multiplicity: 2 });
    expect(kept).toEqual({ calc: { readers: [], charge: 1, multiplicity: 2 } });
    const given = { ...bare, ...kept };
    let doc = reopened(addSet(addMolecule3d(emptyWorkspaceDocument(), given), { x0: -3, y0: -3, x1: 3, y1: 3 }));
    // (opened again: the charge and spin it was given - a later step told +1 and a doublet, not its atoms' 0 and singlet)
    const e = setEntries(setMolecules(doc, doc.sets![0]), "molecules")[0];
    expect([e.charge, e.multiplicity]).toEqual([1, 2]);
    expect(entryOfSet(e, "x").species).toMatchObject({ charge: 1, multiplicity: 2, from: { charge: "given", multiplicity: "given" } });
    doc = addStep(doc, "filter", 10, 0, { conditions: "number \u2265 1", match: "all" });
    const step = doc.steps![doc.steps!.length - 1].id;
    doc = runStep(connect(doc, { set: doc.sets![0].id }, step), step, W);
    expect(species(reopened(doc), step)).toEqual([[1, 2, "given"]]);
  });

  it("keeps what made conformers searched from a drawing - the plugin and its force field - opened again, nothing left out", () => {
    const made = { ...cation(), calc: { readers: [], program: "RDKit", method: "MMFF94" }, conformerSet: true as const };
    const doc = reopened(addMolecule3d(emptyWorkspaceDocument(), made));
    expect(doc.molecules3d?.[0].calc).toMatchObject({ readers: [], program: "RDKit", method: "MMFF94" });
  });
});

