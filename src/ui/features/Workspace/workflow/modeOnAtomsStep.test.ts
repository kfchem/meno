import { describe, expect, it } from "vitest";
import type { CalcInfo } from "../../../../lib/calc/output";
import type { Molecule } from "../../../../lib/chem/molecule";
import { dielsAlder } from "../../../../lib/chem/reactionMap.fixtures";
import { addMolecule3d, emptyWorkspaceDocument } from "../document";
import { setEntries } from "./entries";
import { resultOf } from "./flow";
import { kindInfo, optionsOf } from "./kinds";
import { addSet, addStep, connect } from "./model";
import { runStep, type RunWith } from "./run";

const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };

/** A vibration list of one imaginary vibration, -400 cm-1, moving the atoms `most` 0.5 along z and every other 0.05. */
function vibrationMoving(n: number, most: ReadonlySet<number>): CalcInfo {
  const move = Array.from({ length: n }, (_, i) => [0, 0, most.has(i) ? 0.5 : 0.05]).flat();
  return {
    readers: ["test 1"],
    results: [{ id: "vibrations", on: "list", group: "Vibrations", label: "Vibrations", columns: [{ label: "Frequency", quantity: "wavenumber" }], rows: [{ cells: [-400], move }] }],
  } as CalcInfo;
}

describe("Atom map's bond changes into Mode on atoms, on the page", () => {
  it("ranks the atoms of the bonds the Diels-Alder forms - C1, C5, C4, C6 - in each saddle point's imaginary vibration, writing the window and how many fall outside it", () => {
    const da = dielsAlder();
    const reactant = da.reactants[0];
    const mol = (m: Molecule, x: number, calc?: CalcInfo) => ({ at: { x, y: 0 }, atoms: m.atoms, bonds: m.bonds, ...(calc ? { calc } : {}) });
    const n = reactant.atoms.length;
    // (in the reactants' numbering, from 0: C1 0, C4 3, C5 10, C6 11 - the bonds formed, said from 1 as atoms 1, 4, 11 and 12; the hydrogens, every H)
    const reacting = new Set([0, 3, 10, 11]);
    const hydrogens = new Set(reactant.atoms.flatMap((a, i) => (a.el === "H" ? [i] : [])));
    let doc = addMolecule3d(emptyWorkspaceDocument(), mol(reactant, 0));
    doc = addMolecule3d(doc, mol(da.product, 20));
    // (two saddle points in the reactants' numbering: one whose vibration moves the reacting carbons most, one whose moves the hydrogens)
    doc = addMolecule3d(doc, mol(reactant, 40, vibrationMoving(n, reacting)));
    doc = addMolecule3d(doc, mol(reactant, 46, vibrationMoving(n, hydrogens)));
    const a = doc.nextWorkflowId ?? 1;
    doc = addSet(doc, { x0: -4, y0: -4, x1: 4, y1: 4 });
    const b = doc.nextWorkflowId!;
    doc = addSet(doc, { x0: 16, y0: -4, x1: 24, y1: 4 });
    const t = doc.nextWorkflowId!;
    doc = addSet(doc, { x0: 36, y0: -4, x1: 50, y1: 4 });
    const reaction = doc.nextWorkflowId!;
    doc = addStep(doc, "atom-map", 60, 0, { moleculesAre: "each", referenceIs: "each", bonds: "change" });
    doc = connect(connect(doc, { set: a }, reaction, "reference"), { set: b }, reaction, "molecules");
    const mode = doc.nextWorkflowId!;
    doc = addStep(doc, "mode-on-atoms", 100, 0, { reach: "1" });
    doc = connect(connect(doc, { set: t }, mode), { set: resultOf(doc, reaction, "changes")!.id }, mode, "atoms");
    // (Mode on atoms run: the Reaction before it run first)
    const ran = runStep(doc, mode, W);
    expect(ran.steps!.find((s) => s.id === mode)!.ran).toMatchObject({ ok: true, said: "2 entries, 1 with reacting atoms outside the window" });
    const out = resultOf(ran, mode, "out")!;
    const entries = setEntries(
      out.members!.flatMap((m) => ("molecule" in m ? ran.molecules3d!.filter((x) => x.id === m.molecule) : [])),
      "molecules",
    );
    const values = entries.map((e) => [e.properties?.["mode.window"]?.value, e.properties?.["mode.outside"]?.value]);
    expect(values).toEqual([
      [5, 0],
      [5, 4],
    ]);
    expect(entries[0].properties?.["mode.ranks"]?.value).toBe("C1 1, C4 2, C11 3, C12 4");
    // (the atoms typed, a table wired into Atoms all the same: the table not read, said so)
    const typed = ran.nextWorkflowId!;
    let doc2 = addStep(ran, "mode-on-atoms", 100, 20, { reach: "1", from: "typed", atoms: "1, 4" });
    doc2 = connect(connect(doc2, { set: t }, typed), { set: resultOf(doc2, reaction, "changes")!.id }, typed, "atoms");
    const said = runStep(doc2, typed, W).steps!.find((s) => s.id === typed)!.ran;
    expect(said).toMatchObject({ ok: true, said: "2 entries, 1 with reacting atoms outside the window · the table wired into Atoms not read: atoms typed" });
  });

  it("will not run without a reach - none is given without a basis - and says the atoms typed, where they are", () => {
    const info = kindInfo("mode-on-atoms");
    const needs = (v: Record<string, string>) => info.needs!(optionsOf(info.options ?? [], v));
    const how = (v: Record<string, string>) => info.how!(optionsOf(info.options ?? [], v));
    expect(needs({})).toBe("Give the reach");
    expect(needs({ reach: "x" })).toBe('"x" is no reach: a whole number from 0');
    expect(needs({ reach: "1", from: "typed" })).toBe("No atoms yet");
    expect(needs({ reach: "1", from: "typed", atoms: "1, 0" })).toBe('"0" is no atom, from 1');
    expect(how({ reach: "1" })).toBe("reach 1");
    expect(how({ reach: "1", rows: "map.entry" })).toBe("reach 1, rows by map.entry");
    expect(how({ reach: "0", from: "typed", atoms: "1, 5" })).toBe("reach 0, atoms 1, 5");
  });
});
