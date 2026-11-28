import { describe, expect, it, vi } from "vitest";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { DEFAULT_STYLE_CHOICE, styleOf } from "../../../../lib/chem/style";
import { branchPath, branchWordsAt, cycleMembers, endKey, inkDistance, type Cycle } from "../../../../lib/chem/cycle";
import type { Model } from "../store/types";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import { arrowsOfCycles, branchWords, carriedByCycle, CycleChange, CycleEase, cycleThings, endsAt, endsRenamed, membersOn, thingKey, turnCycle, wordsOfBranches } from "./cycles";

const on = (key: string, angle: number, half = 0.3) => ({ key, index: 0, angle, lo: half, hi: half });
const settle = (e: CycleEase) => {
  for (let i = 0; i < 200 && e.step(1 / 60); i++);
};

describe("a cycle as it is drawn", () => {
  it("is drawn as it is the first time, with nothing on its way", () => {
    const e = new CycleEase();
    e.take([on("a1", 0)]);
    expect(e.members()[0].lo).toBeCloseTo(0.3);
    expect(e.step(1 / 60)).toBe(false);
  });

  it("opens round what comes on to its line, a little at a time", () => {
    const e = new CycleEase();
    e.take([on("a1", 0)]);
    e.take([on("a1", 0), on("a2", 2)]);
    expect(e.members().find((m) => m.angle === 2)!.lo).toBe(0);
    e.step(1 / 60);
    const half = e.members().find((m) => m.angle === 2)!.lo;
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(0.3);
    settle(e);
    expect(e.members().find((m) => m.angle === 2)!.lo).toBeCloseTo(0.3);
  });

  it("closes after what goes off it, running on through it meanwhile, and forgets it once closed", () => {
    const e = new CycleEase();
    e.take([on("a1", 0), on("a2", 2)]);
    e.take([on("a1", 0)]);
    const going = e.members().find((m) => m.angle === 2)!;
    expect(going.passing).toBe(true);
    expect(going.lo).toBeCloseTo(0.3);
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
  const l = branchWordsAt(c, b, B, { w: 0.8 * B, h: 0.3 * B });
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

describe("the words that are an arrow's own, beside another arrow", () => {
  const B = NOMINAL_BOND_LENGTH;
  type Branch = NonNullable<Cycle["branches"]>[number];
  // (a page with a cycle on it, and words set by its arrows - each where the rule sets words by that arrow, or where given)
  const page = (branches: Branch[], words: { text: string; by?: number; at?: (half: { w: number; h: number }) => { x: number; y: number } }[]) => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const id = st().addCycle({ x: 0, y: 0, r: 4.5 * B, branches })!;
    const ids = words.map((w) => {
      const n = st().addCaption(w.text, 0, 0);
      const t = cycleThings(st().model, st().captions, styleOf(st().docStyle)).find((x) => x.caption === n)!;
      const off = { x: (t.box.x0 + t.box.x1) / 2, y: (t.box.y0 + t.box.y1) / 2 };
      const cy = st().cycles.find((x) => x.id === id)!;
      const half = { w: (t.box.x1 - t.box.x0) / 2, h: (t.box.y1 - t.box.y0) / 2 };
      const to = w.at ? w.at(half) : branchWordsAt(cy, branches[w.by!], B, half);
      st().updateCycle(id, {}, undefined, [{ id: n, x: to.x - off.x, y: to.y - off.y }]);
      return n;
    });
    const cycle = () => st().cycles.find((x) => x.id === id)!;
    const things = () => cycleThings(st().model, st().captions, styleOf(st().docStyle), [cycle()]);
    const turn = () => {
      const now = vi.spyOn(performance, "now").mockReturnValue(0);
      let next: (() => void) | null = null;
      turnCycle(store, id, (go) => void (next = go));
      now.mockReturnValue(1e6);
      (next as (() => void) | null)?.();
      now.mockRestore();
    };
    // (whether each set of words stands where the rule sets words by arrow `by` of the cycle as it is now)
    const atRule = (n: number, by: number) => {
      const t = things().find((x) => x.caption === n)!;
      const m = branchWordsAt(cycle(), branches[by], B, { w: (t.box.x1 - t.box.x0) / 2, h: (t.box.y1 - t.box.y0) / 2 });
      return Math.hypot((t.box.x0 + t.box.x1) / 2 - m.x, (t.box.y0 + t.box.y1) / 2 - m.y) < 1e-6;
    };
    return { st, ids, cycle, things, turn, atRule };
  };
  const top: Branch = { at: Math.PI / 2, way: "out" };
  const beside: Branch = { at: Math.PI / 4, way: "in" };

  it("an arrow with no words never takes its neighbour's, as it is, turned round, or the whole cycle turned", () => {
    for (const [a, b] of [[top, beside], [{ ...top, way: "in" as const }, beside], [top, { ...beside, way: "out" as const }]]) {
      const p = page([a, b], [{ text: "Ar-X", by: 0 }]);
      expect(branchWords(p.cycle(), b, p.things())).toBeNull();
      expect(branchWords(p.cycle(), a, p.things())).toBe(p.ids[0]);
      p.turn();
      expect(p.atRule(p.ids[0], 0)).toBe(true);
      expect(wordsOfBranches(p.cycle(), p.things())).toEqual([p.ids[0], null]);
      p.turn();
      expect(p.atRule(p.ids[0], 0)).toBe(true);
    }
  });

  it("two arrows side by side, each with words, each keep their own through a turn", () => {
    const p = page([top, beside], [{ text: "Ar-X", by: 0 }, { text: "L", by: 1 }]);
    expect(wordsOfBranches(p.cycle(), p.things())).toEqual(p.ids);
    p.turn();
    expect(wordsOfBranches(p.cycle(), p.things())).toEqual(p.ids);
    expect(p.atRule(p.ids[0], 0) && p.atRule(p.ids[1], 1)).toBe(true);
  });

  it("words moved well away from any arrow by hand are no arrow's, and are left where they are", () => {
    // (their nearest corner a bond from the top arrow's end, more than three times the gap the rule sets them at)
    const end = branchPath({ x: 0, y: 0, r: 4.5 * B }, top, B).end;
    const away = B / Math.SQRT2;
    const p = page([top, beside], [{ text: "Ar-X", at: (h) => ({ x: end.x - away - h.w, y: end.y + Math.sign(end.y) * (away + h.h) }) }]);
    const was = p.st().captions.find((w) => w.id === p.ids[0])!;
    expect(wordsOfBranches(p.cycle(), p.things())).toEqual([null, null]);
    expect(carriedByCycle(p.cycle(), p.things()).captions).toEqual([]);
    p.turn();
    expect(p.st().captions.find((w) => w.id === p.ids[0])).toMatchObject({ x: was.x, y: was.y });
  });

  it("the whole cycle turned, with arrows in and out all round: every set of words still its own arrow's, at the gap", () => {
    const branches: Branch[] = [0, 1, 2, 3, 4, 5].map((k) => ({ at: (k * Math.PI) / 3 + 0.2, way: k % 2 ? "in" : "out" }));
    const texts = ["X", "Ar-X", "base-H", "L", "Ar'B(OH)2", "HX"];
    const p = page(branches, texts.map((text, by) => ({ text, by })));
    expect(wordsOfBranches(p.cycle(), p.things())).toEqual(p.ids);
    for (let round = 0; round < 2; round++) {
      p.turn();
      expect(wordsOfBranches(p.cycle(), p.things())).toEqual(p.ids);
      expect(p.ids.every((n, by) => p.atRule(n, by))).toBe(true);
    }
  });
});

describe("the circle round a structure on it", () => {
  const B = NOMINAL_BOND_LENGTH;
  const style = styleOf(DEFAULT_STYLE_CHOICE);
  // (phenylboronic acid: its ring to the right, B(OH)2 to the left - HO and OH sticking out)
  const ring = Array.from({ length: 6 }, (_, k) => ({ id: k + 1, el: "C", x: 2 * B + B * Math.cos(Math.PI - (k * Math.PI) / 3), y: B * Math.sin(Math.PI - (k * Math.PI) / 3) }));
  const model = {
    atoms: [...ring, { id: 7, el: "B", x: 0, y: 0 }, { id: 8, el: "O", x: -0.5 * B, y: 0.866 * B }, { id: 9, el: "O", x: -0.5 * B, y: -0.866 * B }],
    bonds: [
      ...ring.map((a, k) => ({ id: 10 + k, a: a.id, b: ring[(k + 1) % 6].id, order: k % 2 ? 1 : 2 })),
      { id: 20, a: 7, b: 1, order: 1 },
      { id: 21, a: 7, b: 8, order: 1 },
      { id: 22, a: 7, b: 9, order: 1 },
    ],
  } as unknown as Model;

  it("ends each stretch just short of what is drawn, not where the circle leaves its box", () => {
    const [t] = cycleThings(model, [], style);
    const m = { x: (t.box.x0 + t.box.x1) / 2, y: (t.box.y0 + t.box.y1) / 2 };
    // (on a cycle's line at its left, the circle running up through it)
    const c: Cycle = { id: 1, x: m.x + 4.5 * B, y: m.y, r: 4.5 * B };
    const [inked] = membersOn(c, [t]);
    const [boxed] = cycleMembers(c, [t.box], B);
    expect(inked.lo + inked.hi).toBeLessThan(boxed.lo + boxed.hi);
    // (each end of the circle broken for it at most a margin, or the nearest it comes, from its ink)
    const arrows = arrowsOfCycles([c], [t]);
    expect(arrows).toHaveLength(1);
    const a = arrows[0];
    const ends = [-1, 1].map((k) => ({ x: a.x + (k * Math.cos(a.angle) * a.length) / 2, y: a.y + (k * Math.sin(a.angle) * a.length) / 2 }));
    for (const e of ends) expect(inkDistance(e, t.ink!)).toBeLessThan(0.7 * B);
  });

  it("keeps an end's gap set by hand as the structure is moved along the circle", () => {
    const [t] = cycleThings(model, [], style);
    const m = { x: (t.box.x0 + t.box.x1) / 2, y: (t.box.y0 + t.box.y1) / 2 };
    const c: Cycle = { id: 1, x: m.x + 4.5 * B, y: m.y, r: 4.5 * B, ends: { [endKey(thingKey(t), "hi")]: 1.5 } };
    const end = (things: ReturnType<typeof cycleThings>) => {
      const [x] = membersOn(c, things);
      const a = x.angle + x.hi;
      return inkDistance({ x: c.x + c.r * Math.cos(a), y: c.y + c.r * Math.sin(a) }, things[0].ink!) / B;
    };
    expect(end([t])).toBeGreaterThan(1.3);
    // (carried 40 degrees round the circle, as a drag along it carries it)
    const turn = (40 * Math.PI) / 180;
    const moved = { ...model, atoms: model.atoms.map((a) => ({ ...a, x: c.x + (a.x - c.x) * Math.cos(turn) - (a.y - c.y) * Math.sin(turn), y: c.y + (a.x - c.x) * Math.sin(turn) + (a.y - c.y) * Math.cos(turn) })) } as Model;
    const after = cycleThings(moved, [], style);
    expect(thingKey(after[0])).toBe(thingKey(t));
    expect(end(after)).toBeGreaterThan(1.3);
  });

  it("keeps an end's gap for what it was of when pasted, numbered anew", () => {
    const c: Cycle = { id: 1, x: 0, y: 0, r: 4, ends: { "a7:lo": 1, "c3:hi": 0.25, "a99:hi": 2 } };
    const renamed = endsRenamed(c, (id) => (id === 7 ? 107 : undefined), (id) => (id === 3 ? 13 : undefined));
    expect(renamed.ends).toEqual({ "a107:lo": 1, "c13:hi": 0.25 });
  });
});

describe("the ends of a cycle's arrows where its menu was asked for", () => {
  const B = NOMINAL_BOND_LENGTH;
  const style = styleOf(DEFAULT_STYLE_CHOICE);
  const c: Cycle = { id: 1, x: 0, y: 0, r: 4.5 * B };
  // (words at the top and at the bottom of the circle)
  const words = (id: number, x: number, y: number) => ({ id, x, y, text: "Pd" }) as never;
  const things = cycleThings({ atoms: [], bonds: [] }, [words(1, 0, 4.5 * B), words(2, 0, -4.5 * B)], style, [c]);

  it("are the two ends of the arrow there, on a stretch", () => {
    // (on the right: from the bottom words' anticlockwise side up to the top words' clockwise side)
    expect(endsAt(c, things, 0)).toEqual(["c2:hi", "c1:lo"]);
    expect(endsAt(c, things, Math.PI)).toEqual(["c1:hi", "c2:lo"]);
  });

  it("is the nearer end, in the break round one", () => {
    expect(endsAt(c, things, Math.PI / 2 - 0.01)).toEqual(["c1:lo"]);
    expect(endsAt(c, things, Math.PI / 2 + 0.01)).toEqual(["c1:hi"]);
  });

  it("are none, with nothing on it", () => {
    expect(endsAt(c, [], 0)).toEqual([]);
  });
});
