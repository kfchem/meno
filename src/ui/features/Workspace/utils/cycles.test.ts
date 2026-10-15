import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { DEFAULT_STYLE_CHOICE, styleOf } from "../../../../lib/chem/style";
import { branchPath, type Cycle } from "../../../../lib/chem/cycle";
import type { Model } from "../store/types";
import { branchWords, carriedByCycle, CycleChange, CycleEase, cycleThings } from "./cycles";

const on = (key: string, angle: number, half = 0.3) => ({ key, index: 0, angle, half });
const settle = (e: CycleEase) => {
  for (let i = 0; i < 200 && e.step(1 / 60); i++);
};

describe("a cycle as it is drawn", () => {
  it("is drawn as it is the first time, with nothing on its way", () => {
    const e = new CycleEase();
    e.take([on("a1", 0)]);
    expect(e.members()[0].half).toBeCloseTo(0.3);
    expect(e.step(1 / 60)).toBe(false);
  });

  it("opens round what comes on to its line, a little at a time", () => {
    const e = new CycleEase();
    e.take([on("a1", 0)]);
    e.take([on("a1", 0), on("a2", 2)]);
    expect(e.members().find((m) => m.angle === 2)!.half).toBe(0);
    e.step(1 / 60);
    const half = e.members().find((m) => m.angle === 2)!.half;
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(0.3);
    settle(e);
    expect(e.members().find((m) => m.angle === 2)!.half).toBeCloseTo(0.3);
  });

  it("closes after what goes off it, running on through it meanwhile, and forgets it once closed", () => {
    const e = new CycleEase();
    e.take([on("a1", 0), on("a2", 2)]);
    e.take([on("a1", 0)]);
    const going = e.members().find((m) => m.angle === 2)!;
    expect(going.passing).toBe(true);
    expect(going.half).toBeCloseTo(0.3);
    settle(e);
    expect(e.members()).toHaveLength(1);
  });

  it("follows what is moved along its line at once", () => {
    const e = new CycleEase();
    e.take([on("a1", 0)]);
    e.take([on("a1", 0.5)]);
    expect(e.members()[0].angle).toBe(0.5);
    expect(e.step(1 / 60)).toBe(false);
  });
});

describe("what may lie on a cycle, measured", () => {
  const B = NOMINAL_BOND_LENGTH;
  const style = styleOf(DEFAULT_STYLE_CHOICE);
  // (ethanol, its O at the left: drawn HO, the H further left)
  const model = {
    atoms: [
      { id: 1, el: "O", x: 0, y: 0 },
      { id: 2, el: "C", x: B, y: 0.5 * B },
      { id: 3, el: "C", x: 2 * B, y: 0 },
    ],
    bonds: [
      { id: 10, a: 1, b: 2, order: 1 },
      { id: 11, a: 2, b: 3, order: 1 },
    ],
  } as unknown as Model;

  it("is a structure as far as its labels' letters reach: the H of HO and all", () => {
    const [t] = cycleThings(model, [], style);
    expect(t.atoms).toEqual([1, 2, 3]);
    // (past the O's own letter, to the H on its left)
    expect(t.box.x0).toBeLessThan(-0.4 * B);
    expect(t.box.x1).toBeCloseTo(2 * B, 5);
  });

  it("is only what comes near a cycle's line, when cycles are given", () => {
    const far: Cycle = { id: 1, x: 100 * B, y: 0, r: 4 * B };
    const here: Cycle = { id: 2, x: B, y: 4 * B, r: 4 * B };
    expect(cycleThings(model, [], style, [far])).toHaveLength(0);
    expect(cycleThings(model, [], style, [here])).toHaveLength(1);
    expect(cycleThings(model, [], style, [])).toHaveLength(0);
  });
});

describe("a cycle changing, as it is drawn", () => {
  const c = { id: 1, x: 0, y: 0, r: 4 };
  const settle = (e: CycleChange) => {
    for (let i = 0; i < 400 && e.step(1 / 60); i++);
  };

  it("draws a cycle opened as it is, and turns it round when it is turned, over a moment", () => {
    const e = new CycleChange();
    e.take({ ...c, branches: [{ at: 1, way: "in" }] });
    expect(e.motion()).toEqual({ branches: [{ b: { at: 1, way: "in" }, grown: 1 }] });
    e.take({ ...c, ccw: true, branches: [{ at: 1, way: "in" }] });
    expect(e.motion().turn).toBe(0);
    e.step(0.1);
    const turn = e.motion().turn!;
    expect(turn).toBeGreaterThan(0);
    expect(turn).toBeLessThan(1);
    // (turned back on the way: back from where it had got to)
    e.take({ ...c, branches: [{ at: 1, way: "in" }] });
    expect(e.motion().turn).toBeCloseTo(1 - turn, 5);
    settle(e);
    expect(e.motion().turn).toBeUndefined();
  });

  it("grows an arrow put there, and lets one taken away go", () => {
    const e = new CycleChange();
    e.take(c);
    const b = { at: 1, way: "out" as const };
    e.take({ ...c, branches: [b] });
    expect(e.motion().branches).toEqual([{ b, grown: 0 }]);
    e.step(1 / 60);
    expect(e.motion().branches![0].grown).toBeGreaterThan(0);
    settle(e);
    expect(e.motion().branches).toEqual([{ b, grown: 1 }]);
    e.take({ ...c, branches: [] });
    e.step(1 / 60);
    expect(e.motion().branches![0].grown).toBeLessThan(1);
    settle(e);
    expect(e.motion().branches).toEqual([]);
  });
});

describe("the words by a cycle's arrow", () => {
  const B = NOMINAL_BOND_LENGTH;
  const style = styleOf(DEFAULT_STYLE_CHOICE);
  const b = { at: Math.PI / 2, way: "in" as const };
  const c: Cycle = { id: 1, x: 0, y: 0, r: 4.5 * B, branches: [b] };
  const l = branchPath(c, b, B).label;
  const words = (id: number, x: number, y: number) => ({ id, x, y, text: "ArX" }) as never;

  it("are the nearest by its far end, and go with the cycle", () => {
    const things = cycleThings({ atoms: [], bonds: [] }, [words(1, l.x + 0.2 * B, l.y), words(2, l.x + 0.9 * B, l.y), words(3, 20 * B, 0)], style, [c]);
    expect(branchWords(c, b, things)).toBe(1);
    expect(carriedByCycle(c, things).captions).toEqual([1]);
  });

  it("are none, with none near", () => {
    expect(branchWords(c, b, cycleThings({ atoms: [], bonds: [] }, [words(3, 20 * B, 0)], style))).toBeNull();
  });
});
