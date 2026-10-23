import { describe, expect, it } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import { inside, type Frame } from "./entries";
import { BETWEEN, CARD_H, CARD_W, setGives, stepTakes, wireCurve } from "./look";

const cardOf = (s: { x: number; y: number }): Frame => ({ x0: s.x, x1: s.x + CARD_W, y0: s.y - CARD_H, y1: s.y });
const near = (a: Frame, b: Frame) => a.x0 < b.x1 + BETWEEN && b.x0 < a.x1 + BETWEEN && a.y0 < b.y1 + BETWEEN && b.y0 < a.y1 + BETWEEN;

/** A page holding a set 20 wide and 10 high, its top left at the origin, wired into a step far to its right. */
function page() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  st().addSet({ x0: 0, x1: 20, y0: -10, y1: 0 });
  const set = st().sets[0];
  const far = st().addStep("filter", "meno", 60, -2);
  st().connect({ set: set.id }, far);
  return { st, set, far };
}

describe("a step's card put down", () => {
  it("goes where it was put down, where that is clear", () => {
    const { st } = page();
    const id = st().addStep("species", "meno", 0, -30);
    const s = st().steps.find((x) => x.id === id)!;
    expect([s.x, s.y]).toEqual([0, -30]);
  });

  it("put down over a set, goes lower - clear of it, in line with where it was put", () => {
    const { st, set } = page();
    const id = st().addStep("species", "meno", 2, -3);
    const s = st().steps.find((x) => x.id === id)!;
    expect(s.x).toBe(2);
    expect(s.y).toBeLessThan(-3);
    expect(near(cardOf(s), set)).toBe(false);
  });

  it("put down over a wire, goes lower - clear of it", () => {
    const { st, set, far } = page();
    const to = st().steps.find((x) => x.id === far)!;
    const wire = wireCurve(setGives(set), stepTakes(to, 0), 96);
    // (between the set and the step it is wired into, level with the wire)
    const at = { x: 30, y: setGives(set).y + CARD_H / 2 };
    expect(wire.some((p) => inside(cardOf(at), p))).toBe(true);
    const id = st().addStep("species", "meno", at.x, at.y);
    const s = st().steps.find((x) => x.id === id)!;
    expect(wire.some((p) => inside(cardOf(s), p))).toBe(false);
    // (nor over the set, the other card, or the sets each gives)
    for (const b of st().sets.filter((b) => b.made?.step !== id)) expect(near(cardOf(s), b)).toBe(false);
    expect(near(cardOf(s), cardOf(to))).toBe(false);
  });
});
