import { describe, expect, it } from "vitest";
import { emptyWorkspaceDocument } from "../document";
import { addStep } from "./model";
import { setsOnPage, unseenSets } from "./onPage";
import { madeByRun, ranBy, viewStillSince } from "./runShown";
import { heldByRepeats } from "./flow";

const view = { x0: 0, x1: 800, y0: -600, y1: 0 };

describe("what the end of Run all shows", () => {
  it("is how far the sets its steps made reach on the page: those of the steps run, none held", () => {
    const one = addStep(emptyWorkspaceDocument(), "optimise", 0, 0);
    const two = addStep(one, "optimise", 2000, -1500);
    const [a, b] = two.steps!.map((s) => s.id);
    const of = (id: number) => setsOnPage(two, (two.sets ?? []).filter((x) => x.made?.step === id));
    expect(of(a).length).toBeGreaterThan(0);
    const box = madeByRun(two, [b])!;
    for (const x of of(b)) expect([box.x0 <= x.x0, box.x1 >= x.x1, box.y0 <= x.y0, box.y1 >= x.y1]).toEqual([true, true, true, true]);
    // (the first step's sets, not run, left out: the box no further left than the second's)
    expect(box.x0).toBe(Math.min(...of(b).map((x) => x.x0)));
    // (a set held - wired on, drawn nowhere - not counted: the first's result set wired into the second, its box the first's other sets' alone, or none)
    const kept = (two.sets ?? []).find((x) => x.made?.step === a && x.made.exit === "out")!;
    const wired = { ...two, wires: [{ id: 99, from: { set: kept.id }, to: { step: b, port: "in" } }] } as typeof two;
    expect(unseenSets(wired).has(kept.id)).toBe(true);
    const rest = setsOnPage(wired, (wired.sets ?? []).filter((x) => x.made?.step === a));
    expect(rest.some((x) => x.id === kept.id)).toBe(false);
    const without = madeByRun(wired, [a]);
    expect(without === null || without.x1 <= Math.max(...rest.map((x) => x.x1))).toBe(true);
    expect(madeByRun(wired, [a])).not.toEqual(madeByRun(two, [a]));
    expect(madeByRun(two, [])).toBeNull();
  });

  it("moves the view only where it stands where it stood as the run began, and no press is held", () => {
    expect(viewStillSince(view, { ...view }, false)).toBe(true);
    expect(viewStillSince(view, { ...view, x0: 40, x1: 840 }, false)).toBe(false);
    expect(viewStillSince(view, { x0: -400, x1: 1200, y0: -1200, y1: 0 }, false)).toBe(false);
    expect(viewStillSince(view, { ...view }, true)).toBe(false);
    expect(viewStillSince(null, view, false)).toBe(false);
    expect(viewStillSince(view, null, false)).toBe(false);
  });

  it("takes in the sets of the steps a Repeat holds, as it runs them - Run all naming the Repeat alone", () => {
    const one = addStep(emptyWorkspaceDocument(), "optimise", 0, 0);
    const held = one.steps![0].id;
    const doc = { ...one, steps: [...one.steps!, { id: 900, kind: "repeat", x: -100, y: 100, by: "meno", frame: { w: 600, h: 400 }, holds: [held] }] } as typeof one;
    // (what Run all and Run from here name: the Repeat, not the step it holds - flow `heldByRepeats`)
    expect(heldByRepeats(doc, [held])).toEqual([900]);
    expect(madeByRun(doc, [900])).toBeNull();
    const ran = ranBy(doc, [900]);
    expect(ran).toContain(held);
    const sets = setsOnPage(doc, (doc.sets ?? []).filter((x) => x.made?.step === held));
    expect(sets.length).toBeGreaterThan(0);
    expect(madeByRun(doc, ran)).toEqual(madeByRun(doc, [held]));
  });

  it("is one rule for Run, Run from here and Run all: each a run of its steps and those before it it runs first", () => {
    const one = addStep(emptyWorkspaceDocument(), "optimise", 0, 0);
    const [a] = one.steps!.map((s) => s.id);
    expect(ranBy(one, [a])).toEqual([a]);
    expect(madeByRun(one, ranBy(one, [a]))).toEqual(madeByRun(one, [a]));
  });
});
