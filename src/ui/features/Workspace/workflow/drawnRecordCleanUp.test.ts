import { describe, expect, it } from "vitest";
import { createWorkspaceDocument, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { DrawnModel, DrawnRecord, Model } from "../store/types";
import { cleanUp, fragmentsOf } from "../chem/cleanUp";
import { drawnFromSmiles } from "../chem/testdata/identityCases";
import { moleculesToEditorModel, readMoleculesFromText } from "../../../../utils/importers";
import { editorModelOf } from "../utils/io";
import messyTaxol from "../../../../../scripts/gui/fixtures/messy-taxol.mol?raw";
import { placedAbbreviation } from "../../../../lib/chem/abbreviationPlace";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { BEFORE_THE_EDIT, drawnHash, drawnKey, setMembers } from "./entries";
import { resultOf } from "./flow";
import { addStep, membersSettled } from "./model";
import { placeResults, type RunWith } from "./run";

const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };

const sampled: DrawnRecord = { from: ["seed-1"], properties: { nll: { value: 23.5, unit: "none", status: "computed" } } };

/**
 * Structures as a chemist might draw them by hand: a stereocentre or two, a
 * double bond's side, rings, and groups Clean-up writes by their labels
 * (an acetate, a benzoate, Boc, a silyl ether).
 */
const SMILES = [
  "F[C@@H](Cl)Br",
  "F[C@@]([H])(Cl)Br",
  "C[C@H](N)C(=O)O",
  "O[C@@H]1CCCC[C@H]1O",
  "C/C=C/C(=O)OCC",
  "F/C=C\\Cl",
  "CC(=O)O[C@@H]1CC[C@H](CC1)C(=O)OC",
  "O=C(N[C@@H](Cc1ccccc1)C(=O)O)OC(C)(C)C",
  "C[C@H](OC(=O)c1ccccc1)c1ccccc1",
  "OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O",
  "CC(C)[C@@H]1CC[C@@H](C)C[C@H]1O",
  "N[C@@H](Cc1c[nH]c2ccccc12)C(=O)O",
  "C[Si](C)(C)OC[C@H]1CCCO1",
  "C[C@]12CC[C@H]3[C@@H](CC=C4C[C@@H](O)CC[C@]34C)[C@@H]1CC[C@@H]2O",
  "CC(=O)N[C@@H](CO)C(=O)O",
];

/** A seeded stream of numbers in [0, 1): the same mess each run. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * `m` drawn carelessly: turned, every atom nudged by up to a third of a
 * bond - and, every other time, drawn as in a mirror with each wedge
 * turned over, which says the same configuration by other wedges.
 */
function messy(m: Model, random: () => number): Model {
  const t = random() * 2 * Math.PI;
  const mirror = random() < 0.5 ? -1 : 1;
  return {
    atoms: m.atoms.map((a) => {
      const x = mirror * (a.x * Math.cos(t) - a.y * Math.sin(t)) + (random() - 0.5) * 0.66;
      const y = a.x * Math.sin(t) + a.y * Math.cos(t) + (random() - 0.5) * 0.66;
      return { ...a, x, y };
    }),
    bonds: mirror > 0 ? m.bonds : m.bonds.map((b) => (b.stereo === "up" ? { ...b, stereo: "down" as const } : b.stereo === "down" ? { ...b, stereo: "up" as const } : b)),
  };
}

/** A page with a step whose result set holds `made`, each with its record. */
function given(made: DrawnModel[]): WorkspaceDocument {
  const doc = addStep({ ...emptyWorkspaceDocument(), nextId: 1 }, "duplicates", 5, 0);
  return placeResults(doc, doc.steps![0], { molecules: [], rest: [], holds: "structures", drawn: { made, rest: [] } }, W);
}

/** `doc` cleaned up whole, as the chemist's Clean-up does it, through the store. */
async function cleanedUp(doc: WorkspaceDocument): Promise<WorkspaceDocument> {
  const d = createWorkspaceDocument();
  d.reset(doc);
  const store = createEditorStore(d);
  connectStoreToDocument(store, d);
  await cleanUp(store);
  return d.getState();
}

const records = (doc: WorkspaceDocument) => setMembers(doc, resultOf(doc, doc.steps![0].id)!).records;
const bare = (r: DrawnRecord | undefined) => r && (({ of: _of, ...rest }) => rest)(r);

describe("a structure drawn's record, through Clean-up", () => {
  it("is kept: Clean-up draws the same structure afresh - its wedges where it puts them, its groups by their labels - so the record's properties stand", async () => {
    const random = seeded(20261022);
    let moved = 0;
    let cleaned = 0;
    for (const smiles of SMILES) {
      const before = given([{ ...messy(drawnFromSmiles(smiles), random), record: sampled }]);
      const ids = setMembers(before, resultOf(before, before.steps![0].id)!).structures[0];
      let after: WorkspaceDocument;
      try {
        after = await cleanedUp(before);
      } catch {
        // (wedges a careless drawing left unreadable: Clean-up moves nothing, and says so)
        continue;
      }
      cleaned++;
      const held = setMembers(after, resultOf(after, after.steps![0].id)!);
      if (drawnKey(after.model, held.structures[0]) !== drawnKey(before.model, ids)) moved++;
      expect(bare(held.records[0]), smiles).toEqual(sampled);
      expect(held.records[0]!.of, smiles).toBe(drawnHash(after.model, held.structures[0]));
    }
    // (most cleaned up, and many drawn otherwise than they were: wedges moved or swapped, H taken away, groups written by name)
    expect(cleaned).toBeGreaterThanOrEqual(SMILES.length - 2);
    expect(moved).toBeGreaterThanOrEqual(cleaned / 2);
  }, 60_000);

  it("is kept for taxol drawn any which way, cleaned up with its groups written NHBz, OAc and OBz", async () => {
    const taxol = editorModelOf(moleculesToEditorModel(readMoleculesFromText(messyTaxol, "mol")).model);
    const before = given([{ ...taxol, record: sampled }]);
    const after = await cleanedUp(before);
    expect(after.model.atoms.filter((a) => !/^[A-Z][a-z]?$/.test(a.el)).map((a) => a.el).sort()).toEqual(["NHBz", "OAc", "OAc", "OBz"]);
    expect(fragmentsOf(after.model)).toHaveLength(1);
    expect(records(after).map(bare)).toEqual([sampled]);
  }, 30_000);

  it("is not kept where the structure itself has changed: an element, a charge, a bond's order, an atom taken away or added, the mirror image, a group's label or what it holds", () => {
    // ((R)-CHFClBr's Br written as a group, OAc - drawn as its label, as Clean-up writes one)
    const drawn = drawnFromSmiles("F[C@@H](Cl)Br");
    const before = given([{ ...drawn, record: sampled }]);
    const ids = setMembers(before, resultOf(before, before.steps![0].id)!).structures[0];
    const of = (el: string) => before.model.atoms.find((a) => ids.includes(a.id) && a.el === el)!;
    const edited = (model: Model) => records(membersSettled({ ...before, model }, before))[0];
    const atoms = (f: (a: Model["atoms"][number]) => Model["atoms"][number]) => ({ ...before.model, atoms: before.model.atoms.map(f) });
    const stale = { from: ["seed-1"], stale: BEFORE_THE_EDIT };
    expect(edited(atoms((a) => (a.id === of("Br").id ? { ...a, el: "I" } : a)))).toEqual(stale);
    expect(edited(atoms((a) => (a.id === of("Cl").id ? { ...a, charge: -1 } : a)))).toEqual(stale);
    expect(edited(atoms((a) => (a.id === of("Cl").id ? { ...a, isotope: 37 } : a)))).toEqual(stale);
    const cl = before.model.bonds.find((b) => [b.a, b.b].includes(of("Cl").id))!;
    expect(edited({ ...before.model, bonds: before.model.bonds.map((b) => (b.id === cl.id ? { ...b, order: 2 } : b)) })).toEqual(stale);
    expect(edited({ atoms: before.model.atoms.filter((a) => a.id !== of("F").id), bonds: before.model.bonds.filter((b) => ![b.a, b.b].includes(of("F").id)) })).toEqual(stale);
    const br = of("Br");
    expect(edited({ atoms: [...before.model.atoms, { id: 900, el: "C", x: br.x + 1.5, y: br.y, r: 0.9 }], bonds: [...before.model.bonds, { id: 901, a: br.id, b: 900, order: 1, stereo: "none" } as Model["bonds"][number]] })).toEqual(stale);
    // (drawn as in a mirror about its own middle, its wedges as they were: the other enantiomer)
    const mid = ids.reduce((x, id) => x + before.model.atoms.find((a) => a.id === id)!.x, 0) / ids.length;
    const midY = ids.reduce((y, id) => y + before.model.atoms.find((a) => a.id === id)!.y, 0) / ids.length;
    expect(edited(atoms((a) => (ids.includes(a.id) ? { ...a, x: 2 * mid - a.x } : a)))).toEqual(stale);
    // (turned about its middle: the same)
    expect(bare(edited(atoms((a) => (ids.includes(a.id) ? { ...a, x: 2 * mid - a.x, y: 2 * midY - a.y } : a))))).toEqual(sampled);
    // (a group by its label: the label another, or the atoms it holds others)
    const labelled = given([{ ...drawn, atoms: drawn.atoms.map((a) => (a.el === "Br" ? { ...a, el: "OAc" } : a)), record: sampled }]);
    const oac = labelled.model.atoms.find((a) => a.el === "OAc")!;
    const relabelled = (f: (a: Model["atoms"][number]) => Model["atoms"][number]) => records(membersSettled({ ...labelled, model: { ...labelled.model, atoms: labelled.model.atoms.map((a) => (a.id === oac.id ? f(a) : a)) } }, labelled))[0];
    expect(relabelled((a) => ({ ...a, el: "OBz" }))).toEqual(stale);
    expect(relabelled((a) => ({ ...a, abbrev: placedAbbreviation("OMe", null, NOMINAL_BOND_LENGTH)! }))).toEqual(stale);
    // (what OAc stands for, held: the same group)
    expect(bare(relabelled((a) => ({ ...a, abbrev: placedAbbreviation("OAc", null, NOMINAL_BOND_LENGTH)! })))).toEqual(sampled);
  });

  it("where its wedges cannot be read, is of the drawing itself: a wedge changed there is a change, moved whole it is not", () => {
    // (a carbon with four groups, a wedge and a hash in line: no configuration identity can read)
    const crossed: Model = {
      atoms: [
        { id: 1, el: "C", x: 0, y: 0, r: 0.9 },
        { id: 2, el: "F", x: 1.5, y: 0, r: 0.9 },
        { id: 3, el: "Cl", x: -1.5, y: 0, r: 0.9 },
        { id: 4, el: "Br", x: 0, y: 1.5, r: 0.9 },
        { id: 5, el: "I", x: 0, y: -1.5, r: 0.9 },
      ],
      bonds: [
        { id: 6, a: 1, b: 2, order: 1, stereo: "up" },
        { id: 7, a: 1, b: 3, order: 1, stereo: "down" },
        { id: 8, a: 1, b: 4, order: 1, stereo: "up" },
        { id: 9, a: 1, b: 5, order: 1, stereo: "down" },
      ],
    };
    const before = given([{ ...crossed, record: sampled }]);
    const ids = setMembers(before, resultOf(before, before.steps![0].id)!).structures[0];
    const edited = (model: Model) => records(membersSettled({ ...before, model }, before))[0];
    // (two wedges turned over: identity reads no configuration either way, but the drawing says another)
    const turned = new Set(before.model.bonds.filter((b) => ids.includes(b.a) && (b.stereo === "up" || b.stereo === "down")).slice(0, 2).map((b) => b.id));
    expect(edited({ ...before.model, bonds: before.model.bonds.map((b) => (turned.has(b.id) ? { ...b, stereo: b.stereo === "up" ? ("down" as const) : ("up" as const) } : b)) })).toEqual({ from: ["seed-1"], stale: BEFORE_THE_EDIT });
    expect(bare(edited({ ...before.model, atoms: before.model.atoms.map((a) => (ids.includes(a.id) ? { ...a, x: a.x + 0.4, y: a.y - 0.3 } : a)) }))).toEqual(sampled);
  });
});
