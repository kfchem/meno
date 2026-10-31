import { describe, expect, it } from "vitest";
import { addMolecule3d, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import { allToRun, chainTo, inputKey, resultOf, stateOf, stepOf, stepsBefore, stepsRun } from "./flow";
import { addSet, addStep, connect, setRan } from "./model";

/** A page with one water in a set: set 1. */
function page(): WorkspaceDocument {
  const atoms = [
    { el: "O", x: 0, y: 0, z: 0 },
    { el: "H", x: 0.96, y: 0, z: 0 },
    { el: "H", x: -0.24, y: 0.93, z: 0 },
  ];
  const doc = addMolecule3d(emptyWorkspaceDocument(), { atoms, bonds: [{ a1: 0, a2: 1, order: 1 }, { a1: 0, a2: 2, order: 1 }], at: { x: 0, y: 0 } } as never);
  return addSet(doc, { x0: -3, y0: -3, x1: 3, y1: 3 });
}

/**
 * Steps of Meno's own, each named, wired as `ways` says - `["a", "b"]` is a's result into b, `["set", "a"]` the
 * page's set into a, `["a", "m", "second"]` into m's input of that name - each Filter but those named in `merges`;
 * then each in `done` marked run on what comes into it now, each in `changed` run on something else since.
 */
function flow(ways: [string, string, string?][], { merges = [] as string[], done = [] as string[], changed = [] as string[] } = {}) {
  let doc = page();
  const ids: Record<string, number> = { set: 0 };
  const named = new Set(ways.flatMap(([from, to]) => [from, to]).filter((n) => n !== "set"));
  let x = 10;
  for (const n of named) {
    doc = addStep(doc, merges.includes(n) ? "merge" : "filter", (x += 15), 0, merges.includes(n) ? undefined : { conditions: "number ≥ 1", match: "all" });
    ids[n] = doc.steps![doc.steps!.length - 1].id;
  }
  for (const [from, to, port] of ways) doc = connect(doc, from === "set" ? { set: doc.sets![0].id } : { set: resultOf(doc, ids[from])!.id }, ids[to], port);
  for (const n of [...done, ...changed]) {
    const step = stepOf(doc, ids[n])!;
    doc = setRan(doc, step.id, { at: 1, ok: true, said: "1 kept", input: changed.includes(n) ? "run on something else" : inputKey(doc, step, "meno"), kind: step.kind });
  }
  const name = (id: number) => Object.keys(ids).find((n) => ids[n] === id)!;
  return { doc, ids, name, state: (n: string) => stateOf(doc, stepOf(doc, ids[n])!, "meno") };
}

/** Whether each step in `run` comes after every step before it, among them, that it takes from. */
function inOrder(doc: WorkspaceDocument, run: number[]): boolean {
  return run.every((id, k) => stepsBefore(doc, id).every((b) => !run.includes(b) || run.indexOf(b) < k));
}

describe("the steps a Run runs (chainTo)", () => {
  it("runs, of a step of two inputs, the side not done, never the side done - however much nearer that side is", () => {
    // (set → a → m.first, done; set → p → q → m.second, neither run)
    const f = flow(
      [["set", "a"], ["a", "m", "first"], ["set", "p"], ["p", "q"], ["q", "m", "second"]],
      { merges: ["m"], done: ["a"] },
    );
    expect(["a", "p", "q", "m"].map(f.state)).toEqual(["done", "ready", "ready", "ready"]);
    const run = chainTo(f.doc, f.ids.m);
    expect(run.map(f.name)).toEqual(["p", "q", "m"]);
    expect(inOrder(f.doc, run)).toBe(true);
    // (and a step done on the done side, further back than any not done: left as it is too)
    const g = flow(
      [["set", "a0"], ["a0", "a"], ["a", "m", "first"], ["set", "p"], ["p", "m", "second"]],
      { merges: ["m"], done: ["a0", "a"] },
    );
    expect(chainTo(g.doc, g.ids.m).map(g.name)).toEqual(["p", "m"]);
  });

  it("runs a step not done and every step after it, never a done step before it: a done, b not done, then c", () => {
    const f = flow([["set", "a"], ["a", "b"], ["b", "c"]], { done: ["a"] });
    expect(chainTo(f.doc, f.ids.c).map(f.name)).toEqual(["b", "c"]);
    // (b changed since it ran - its options, or what came in: the same)
    const g = flow([["set", "a"], ["a", "b"], ["b", "c"]], { done: ["a", "c"], changed: ["b"] });
    expect(["a", "b", "c"].map(g.state)).toEqual(["done", "changed", "done"]);
    expect(chainTo(g.doc, g.ids.c).map(g.name)).toEqual(["b", "c"]);
  });

  it("runs a done step that lies after one not done: x not done, y done, then z - y takes anew what x gives", () => {
    const f = flow([["set", "x"], ["x", "y"], ["y", "z"]], { done: ["y"] });
    expect(["x", "y", "z"].map(f.state)).toEqual(["ready", "done", "ready"]);
    expect(chainTo(f.doc, f.ids.z).map(f.name)).toEqual(["x", "y", "z"]);
  });

  it("runs, of a diamond, the branch whose middle step is not done - and the source and the other branch not", () => {
    // (set → s; s → l1 → l2 → j.first; s → r1 → r2 → j.second: r1 not done, the rest done)
    const ways: [string, string, string?][] = [["set", "s"], ["s", "l1"], ["l1", "l2"], ["l2", "j", "first"], ["s", "r1"], ["r1", "r2"], ["r2", "j", "second"]];
    const f = flow(ways, { merges: ["j"], done: ["s", "l1", "l2", "r2", "j"] });
    expect(chainTo(f.doc, f.ids.j).map(f.name)).toEqual(["r1", "r2", "j"]);
    // (the source not done: every step, each after those it takes from)
    const g = flow(ways, { merges: ["j"], done: ["l1", "l2", "r1", "r2", "j"] });
    const all = chainTo(g.doc, g.ids.j);
    expect(all.map(g.name)).toEqual(["s", "r1", "l1", "r2", "l2", "j"]);
    expect(inOrder(g.doc, all)).toBe(true);
    // (a branch of other lengths - a way straight from the source too: still each after those it takes from)
    const h = flow([["set", "s"], ["s", "t1"], ["t1", "t2"], ["t2", "t3"], ["t3", "j", "first"], ["s", "j", "second"]], { merges: ["j"] });
    const run = chainTo(h.doc, h.ids.j);
    expect(run.map(h.name)).toEqual(["s", "t1", "t2", "t3", "j"]);
    expect(inOrder(h.doc, run)).toBe(true);
  });

  it("runs, over a page of two chains apart, what Run all says: the steps not done and those after them, nothing of a chain done", () => {
    // (one chain all done; the other's first done, its second not, its third after it)
    const f = flow([["set", "a1"], ["a1", "b1"], ["set", "a2"], ["a2", "b2"], ["b2", "c2"]], { done: ["a1", "b1", "a2", "c2"] });
    const all = allToRun(f.doc);
    expect(all.map(f.name).sort()).toEqual(["b2", "c2"]);
    expect(stepsRun(f.doc, all).map(f.name)).toEqual(["b2", "c2"]);
    // (and over a page whose step of two inputs has one side done: what Run all says, no more)
    const g = flow([["set", "a"], ["a", "m", "first"], ["set", "p"], ["p", "q"], ["q", "m", "second"], ["set", "o"]], { merges: ["m"], done: ["a", "o"] });
    expect(allToRun(g.doc).map(g.name).sort()).toEqual(["m", "p", "q"]);
    expect(stepsRun(g.doc, allToRun(g.doc)).map(g.name)).toEqual(["p", "q", "m"]);
  });
});
