import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));
import { emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import { addSet, markMade, membersSettled } from "./model";
import { setSigns } from "./setSigns";

/** A page with a chain of two carbons (atoms `id`, `id + 1`) at each of `at`. */
function page(...at: { x: number; y: number; id: number }[]): WorkspaceDocument {
  const doc = emptyWorkspaceDocument();
  return {
    ...doc,
    model: {
      atoms: at.flatMap((p) => [
        { id: p.id, x: p.x, y: p.y, r: 0.9, el: "C" },
        { id: p.id + 1, x: p.x + 1.3, y: p.y, r: 0.9, el: "C" },
      ]),
      bonds: at.map((p) => ({ id: p.id, a: p.id, b: p.id + 1, order: 1 as const })),
    },
  };
}

/** The structure holding atom `id` moved by (dx, dy), its sets' members settled as the document settles every edit - a drag's step. */
function dragged(doc: WorkspaceDocument, id: number, dx: number, dy: number): WorkspaceDocument {
  const next = { ...doc, model: { ...doc.model, atoms: doc.model.atoms.map((a) => (a.id === id || a.id === id + 1 ? { ...a, x: a.x + dx, y: a.y + dy } : a)) } };
  return membersSettled(next, doc);
}

/** The set with id `id`'s structures, each by its first atom. */
const firsts = (doc: WorkspaceDocument, id: number) => doc.sets!.find((b) => b.id === id)!.members!.map((m) => ("structure" in m ? m.structure[0] : -1));

describe("what a set's frame shows while the pointer is held", () => {
  it("a structure from outside held over a chemist's set: that set takes it - and letting go leaves it its member", () => {
    const pressed = addSet(page({ x: 0, y: 0, id: 1 }, { x: 10, y: 0, id: 3 }), { x0: -2, y0: -2, x1: 4, y1: 2 });
    // (half way: its middle not yet in - nothing would change, nothing is shown)
    const halfWay = dragged(pressed, 3, -4, 0);
    expect(setSigns(pressed, halfWay)).toEqual(new Map());
    const over = dragged(halfWay, 3, -4, 0);
    expect(setSigns(pressed, over)).toEqual(new Map([[1, "takes"]]));
    // (the outcome the sign said: the set holds it)
    expect(firsts(over, 1)).toContain(3);
  });

  it("a member held outside its set: the set lets go of it - and letting go leaves it out", () => {
    const pressed = addSet(page({ x: 0, y: 0, id: 1 }, { x: 0, y: -1, id: 3 }), { x0: -2, y0: -3, x1: 4, y1: 2 });
    expect(firsts(pressed, 1)).toEqual([1, 3]);
    const out = dragged(pressed, 3, 0, -8);
    expect(setSigns(pressed, out)).toEqual(new Map([[1, "letsGo"]]));
    expect(firsts(out, 1)).toEqual([1]);
  });

  it("a member held still inside its set, or moved within it: nothing is shown", () => {
    const pressed = addSet(page({ x: 0, y: 0, id: 1 }), { x0: -2, y0: -3, x1: 6, y1: 2 });
    expect(setSigns(pressed, pressed)).toEqual(new Map());
    expect(setSigns(pressed, dragged(pressed, 1, 1, -1))).toEqual(new Map());
  });

  it("a structure held over a step's result set: it takes nothing in, and shows nothing", () => {
    let pressed = addSet(page({ x: 0, y: 0, id: 1 }, { x: 10, y: 0, id: 3 }), { x0: -2, y0: -2, x1: 4, y1: 2 });
    pressed = markMade(pressed, 1, { step: 7, exit: "out", holds: "molecules" });
    const over = dragged(pressed, 3, -9, 0);
    expect(setSigns(pressed, over)).toEqual(new Map());
    expect(firsts(over, 1)).toEqual([1]);
  });

  it("two sets side by side, overlapping: the one whose frame takes the structure's middle shows it, the other nothing", () => {
    let pressed = page({ x: 0, y: 0, id: 1 }, { x: 20, y: 0, id: 3 });
    pressed = addSet(pressed, { x0: -2, y0: -2, x1: 4, y1: 2 });
    pressed = addSet(pressed, { x0: 3, y0: -2, x1: 10, y1: 2 });
    // (its middle at x 7.65: in the second frame alone, its first atom over the first's edge)
    const over = dragged(pressed, 3, -13, 0);
    expect(setSigns(pressed, over)).toEqual(new Map([[2, "takes"]]));
    expect(firsts(over, 1)).not.toContain(3);
    expect(firsts(over, 2)).toContain(3);
  });

  it("nothing held, or a structure drawn into a set or deleted from it: no sign", () => {
    const pressed = addSet(page({ x: 0, y: 0, id: 1 }), { x0: -2, y0: -3, x1: 6, y1: 2 });
    expect(setSigns(null, pressed)).toEqual(new Map());
    const drawn = membersSettled({ ...pressed, model: { atoms: [...pressed.model.atoms, { id: 9, x: 0, y: -1, r: 0.9, el: "C" }], bonds: pressed.model.bonds } }, pressed);
    expect(firsts(drawn, 1)).toContain(9);
    expect(setSigns(pressed, drawn)).toEqual(new Map());
    const deleted = membersSettled({ ...pressed, model: { atoms: [], bonds: [] } }, pressed);
    expect(setSigns(pressed, deleted)).toEqual(new Map());
  });
});
