import { describe, expect, it } from "vitest";
import { addMolecule3d, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import { OWN_NUMBERING, restraintsTable } from "../../../../lib/steps/restraints";
import { inputKey, wireInto, wireRefusal } from "./flow";
import { holdTable, addSet, addStep, connect, setRan } from "./model";
import { placeResults, whyNot, type RunWith } from "./run";
import type { DrawnModel } from "../store/types";
import { ONE_INPUT, RESTRAINTS_INPUT } from "./kinds";

// The Restraints input on a step that holds restraints (docs/WORKFLOWS.md, *Restraints wired in*): what "its input" means where a
// step has it beside its first, what goes into it, and a step with nothing wired into it keeping the key it had before it had one.

/** A page: a water in a set (1), a Minimise step (2) with its exits' sets (3, 4), and a table of restraints in a set of its own (5). */
function page(): WorkspaceDocument {
  let d = addMolecule3d(emptyWorkspaceDocument(), {
    atoms: [
      { el: "O", x: 0, y: 0, z: 0 },
      { el: "H", x: 0, y: 0.76, z: 0.59 },
      { el: "H", x: 0, y: -0.76, z: 0.59 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    at: { x: 0, y: 0 },
  });
  d = addSet(d, { x0: -3, y0: -3, x1: 3, y1: 3 });
  d = addStep(d, "minimise", 10, 0, undefined, "rdkit");
  d = addSet(d, { x0: -3, y0: 10, x1: 3, y1: 16 });
  return holdTable(d, 5, restraintsTable([{ restraint: { kind: "fixed", atoms: [0] }, why: "typed", for: "w", on: "start", numbering: OWN_NUMBERING }]));
}

describe("a step's Restraints input", () => {
  it("is never the input a step's wire is, where none is named: that is its first", () => {
    const only = connect(page(), { set: 5 }, 2, RESTRAINTS_INPUT.id);
    expect(only.wires?.map((w) => w.to.port)).toEqual([RESTRAINTS_INPUT.id]);
    expect(wireInto(only, 2)).toBeUndefined();
    const both = connect(only, { set: 1 }, 2, ONE_INPUT);
    expect(wireInto(both, 2)?.from).toEqual({ set: 1 });
    expect(wireInto(both, 2, RESTRAINTS_INPUT.id)?.from).toEqual({ set: 5 });
  });

  it("takes a table of restraints, never molecules seen as one", () => {
    expect(wireRefusal(page(), { set: 1 }, 2, RESTRAINTS_INPUT.id)).toBe("It takes a table of restraints, not molecules");
    expect(wireRefusal(page(), { set: 5 }, 2, RESTRAINTS_INPUT.id)).toBeNull();
  });

  it("with nothing wired into it, leaves a step the key it had before it had one; wired, gives another", () => {
    const one = connect(page(), { set: 1 }, 2, ONE_INPUT);
    // (the key of this step on main before the kind had a Restraints input: one input, keyed as one)
    expect(inputKey(one, one.steps!.find((s) => s.id === 2)!, "rdkit")).toBe(KEY_BEFORE);
    const wired = connect(one, { set: 5 }, 2, RESTRAINTS_INPUT.id);
    expect(inputKey(wired, wired.steps!.find((s) => s.id === 2)!, "rdkit")).not.toBe(KEY_BEFORE);
  });
});

/** The step's key as main gave it, before Minimise had a Restraints input (45cd584c). */
const KEY_BEFORE = "brjkm4";

describe("a conformer search's Restraints input", () => {
  it("is refused with structures drawn coming in: restraints are held on molecules in 3D, each by its ID", () => {
    const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };
    const ethane: DrawnModel = { atoms: [{ id: 1, el: "C", x: 0, y: 0 }, { id: 2, el: "C", x: 1.56, y: 0.9 }] as never, bonds: [{ id: 1, a: 1, b: 2, order: 1 }] as never };
    // (structures a step made, run: what comes into the search)
    let d = addStep(page(), "generate", 0, 30);
    const made = d.steps!.find((s) => s.kind === "generate")!;
    d = placeResults(d, made, { molecules: [], rest: [], holds: "structures", drawn: { made: [ethane], rest: [] } }, W);
    d = setRan(d, made.id, { at: 1, ok: true, said: "made", input: inputKey(d, made, "meno"), kind: made.kind });
    d = addStep(d, "conformers", 40, 30, undefined, "rdkit");
    const c = d.steps![d.steps!.length - 1];
    d = connect(d, { set: d.sets!.find((b) => b.made?.step === made.id && b.made.exit === "out")!.id }, c.id, ONE_INPUT);
    expect(whyNot(d, c, "rdkit")).not.toBe("Restraints are held on molecules in 3D: make the structures 3D first, then wire them in");
    d = connect(d, { set: 5 }, c.id, RESTRAINTS_INPUT.id);
    expect(whyNot(d, d.steps!.find((s) => s.id === c.id)!, "rdkit")).toBe("Restraints are held on molecules in 3D: make the structures 3D first, then wire them in");
  });
});
