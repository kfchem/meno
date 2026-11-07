import { describe, expect, it } from "vitest";
import { moleculeHandlers, sameMoleculeProps, type MoleculeHandlers } from "./moleculeHandlers";

function fakeStore() {
  const calls: unknown[][] = [];
  const state = {
    sel3d: new Set<number>([7]),
    setFrame3d: (...a: unknown[]) => void calls.push(["frame", ...a]),
    setMagnified3d: (...a: unknown[]) => void calls.push(["magnified", ...a]),
    risen3d: (...a: unknown[]) => void calls.push(["risen", ...a]),
    setHoveredAtom3d: (...a: unknown[]) => void calls.push(["hovered", ...a]),
    editMeasure3d: (...a: unknown[]) => void calls.push(["edit", ...a]),
    setMeasure3d: (...a: unknown[]) => (calls.push(["measure", ...a]), null),
  };
  return { calls, store: { getState: () => state as never } };
}

describe("a molecule's handlers", () => {
  it("are the same functions every time the molecules are drawn again", () => {
    const { store } = fakeStore();
    const kept = new Map<number, MoleculeHandlers>();
    const remake = { current: undefined };
    const first = moleculeHandlers(kept, 3, store, remake);
    const again = moleculeHandlers(kept, 3, store, remake);
    expect(again).toBe(first);
    expect(again.onFrame).toBe(first.onFrame);
    expect(moleculeHandlers(kept, 4, store, remake)).not.toBe(first);
  });

  it("act on their own molecule, through the store as it is when called", () => {
    const { calls, store } = fakeStore();
    const on = moleculeHandlers(new Map(), 3, store, { current: undefined });
    on.onFrame(2);
    on.onHoverAtom(5);
    on.onRisen();
    on.onSetMeasure(1, 1.5);
    on.onEditDone();
    expect(calls).toEqual([["frame", 3, 2], ["hovered", 3, 5], ["risen", 3], ["edit", null], ["measure", 3, 1, 1.5], ["edit", null]]);
  });

  it("magnify it, or those selected with it", () => {
    const { calls, store } = fakeStore();
    moleculeHandlers(new Map(), 3, store, { current: undefined }).onMagnify(2, "g");
    moleculeHandlers(new Map(), 7, store, { current: undefined }).onMagnify(2, "g");
    expect(calls).toEqual([["magnified", [3], 2, "g"], ["magnified", [7], 2, "g"]]);
  });

  it("remake it with the remake given last, not the one there when they were made", () => {
    const { store } = fakeStore();
    const made: string[] = [];
    const remake: { current: ((id: number) => void) | undefined } = { current: (id) => void made.push(`old ${id}`) };
    const on = moleculeHandlers(new Map(), 3, store, remake);
    remake.current = (id) => void made.push(`new ${id}`);
    on.onRemake();
    expect(made).toEqual(["new 3"]);
  });
});

describe("whether a molecule is drawn again", () => {
  it("not where every prop is the same - its handlers, kept, among them", () => {
    const on = moleculeHandlers(new Map(), 3, fakeStore().store, { current: undefined });
    const m = { id: 3 };
    const turn = [0, 0, 0, 1];
    const a = { m, turn, frame: 0, lit: 0, onFrame: on.onFrame, onHoverAtom: on.onHoverAtom };
    expect(sameMoleculeProps(a, { ...a })).toBe(true);
  });

  it("where any prop has changed, or one has come or gone", () => {
    const m = { id: 3 };
    const a: Record<string, unknown> = { m, frame: 0, onFrame: () => {} };
    expect(sameMoleculeProps(a, { ...a, frame: 1 })).toBe(false);
    expect(sameMoleculeProps(a, { ...a, m: { id: 3 } })).toBe(false);
    // (a new function each time, as the molecules were given before: always drawn again)
    expect(sameMoleculeProps(a, { ...a, onFrame: () => {} })).toBe(false);
    expect(sameMoleculeProps(a, { ...a, onRemake: () => {} })).toBe(false);
  });
});
