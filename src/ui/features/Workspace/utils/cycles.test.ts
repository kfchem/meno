import { describe, expect, it, vi } from "vitest";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { DEFAULT_STYLE_CHOICE, styleOf } from "../../../../lib/chem/style";
import { branchPath, branchWordsAt, cycleMembers, endKey, inkDistance, type Cycle } from "../../../../lib/chem/cycle";
import type { Model } from "../store/types";
import { createWorkspaceDocument, schemeOf, withImportedScheme, updateCycle as cycleChanged, type WorkspaceDocument } from "../document";
import { readDrawn } from "./copyPaste";
import { connectStoreToDocument, createEditorStore } from "../store";
import { arrowsOfCycles, branchDropped, branchOpened, branchWords, carriedByCycle, CycleChange, CycleEase, cycleThings, endsAt, endsRenamed, membersOn, thingKey, turnCycle, TURN_S, wordsOfBranches } from "./cycles";

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
  const words = (id: number, x: number, y: number, own = false) => ({ id, x, y, text: "ArX", ...(own ? { branch: { cycle: 1, at: b.at } } : {}) }) as never;

  it("are those written at it, wherever they stand, and go with the cycle - not free words, however near", () => {
    const things = cycleThings({ atoms: [], bonds: [] }, [words(1, l.x + 0.2 * B, l.y), words(2, l.x + 0.9 * B, l.y, true), words(3, 20 * B, 0)], style, [c]);
    expect(branchWords(c, b, things)).toBe(2);
    expect(carriedByCycle(c, things).captions).toEqual([2]);
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
      // (written at the arrow: its own; set by hand, free)
      const n = st().addCaption(w.text, 0, 0, undefined, undefined, undefined, undefined, w.by != null ? { branch: { cycle: id, at: branches[w.by].at } } : undefined);
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
    return { st, doc, store, ids, cycle, things, turn, atRule };
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

  it("an arrow with no words whose end comes right by its neighbour's words, either side and either way, never takes them", () => {
    for (let k = -4; k <= 4; k++) {
      if (k === 0) continue;
      for (const way of ["in", "out"] as const) {
        const near: Branch = { at: Math.PI / 2 + (k * Math.PI) / 18, way };
        const p = page([top, near], [{ text: "Ar-X", by: 0 }]);
        expect(wordsOfBranches(p.cycle(), p.things())).toEqual([p.ids[0], null]);
        p.turn();
        expect(wordsOfBranches(p.cycle(), p.things())).toEqual([p.ids[0], null]);
        expect(p.atRule(p.ids[0], 0)).toBe(true);
      }
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

  // (an arrow at the right of the circle, out across: words set beside its head, their left side facing it)
  const right: Branch = { at: 0.1, way: "out" };
  const box = (p: ReturnType<typeof page>, n: number) => p.things().find((x) => x.caption === n)!.box;
  // (the words written again longer, about their middle - as words were before they were set from their side facing the arrow)
  const lengthened = (p: ReturnType<typeof page>, n: number, text: string) => p.st().updateCaption(n, { text });

  it("words made longer, or of two lines, stay their arrow's through a turn, a move and a resize of the cycle", () => {
    for (const text of ["Ar-X, 1.1 equiv, THF, 60 °C", "Ar-X\n1.1 equiv base"]) {
      const p = page([right, top], [{ text: "Ar-X", by: 0 }, { text: "L", by: 1 }]);
      lengthened(p, p.ids[0], text);
      expect(wordsOfBranches(p.cycle(), p.things())).toEqual(p.ids);
      // (moved or sized: carried with it)
      expect(carriedByCycle(p.cycle(), p.things()).captions.sort()).toEqual([...p.ids].sort());
      const was = p.st().captions.find((w) => w.id === p.ids[0])!;
      p.turn();
      const now = p.st().captions.find((w) => w.id === p.ids[0])!;
      expect(Math.hypot(now.x - was.x, now.y - was.y)).toBeGreaterThan(0.5 * B);
      expect(wordsOfBranches(p.cycle(), p.things())).toEqual(p.ids);
      expect(carriedByCycle(p.cycle(), p.things()).captions.sort()).toEqual([...p.ids].sort());
    }
  });

  it("turned and turned back, every set of words is exactly where it was - lengthened and nudged by hand too", () => {
    const p = page([right, top, beside], [{ text: "Ar-X", by: 0 }, { text: "L", by: 1 }, { text: "HX", by: 2 }]);
    lengthened(p, p.ids[0], "Ar-X, 1.1 equiv, THF");
    const w1 = p.st().captions.find((w) => w.id === p.ids[1])!;
    p.st().updateCaption(p.ids[1], { x: w1.x + 0.2 * B, y: w1.y + 0.1 * B });
    const first = p.st().captions.map((w) => ({ id: w.id, x: w.x, y: w.y }));
    p.turn();
    p.turn();
    const back = p.st().captions.map((w) => ({ id: w.id, x: w.x, y: w.y }));
    back.forEach((w, i) => {
      expect(w.x).toBeCloseTo(first[i].x, 9);
      expect(w.y).toBeCloseTo(first[i].y, 9);
    });
  });

  it("turned again while it turns, the words go back to exactly where they were, and stay their arrows'", () => {
    const p = page([right, top], [{ text: "Ar-X", by: 0 }, { text: "L", by: 1 }]);
    const first = p.st().captions.map((w) => ({ x: w.x, y: w.y }));
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    let next: (() => void) | null = null;
    turnCycle(p.store, p.cycle().id, (go) => void (next = go));
    // (half way round)
    now.mockReturnValue(TURN_S * 500);
    (next as (() => void) | null)?.();
    const half = p.st().captions.map((w) => ({ x: w.x, y: w.y }));
    expect(Math.hypot(half[0].x - first[0].x, half[0].y - first[0].y)).toBeGreaterThan(0.1 * B);
    turnCycle(p.store, p.cycle().id, (go) => void (next = go));
    expect(wordsOfBranches(p.cycle(), p.things())).toEqual(p.ids);
    now.mockReturnValue(TURN_S * 500 + 1e6);
    (next as (() => void) | null)?.();
    now.mockRestore();
    expect(p.cycle().ccw).toBeUndefined();
    p.st().captions.forEach((w, i) => {
      expect(w.x).toBeCloseTo(first[i].x, 9);
      expect(w.y).toBeCloseTo(first[i].y, 9);
    });
    expect(wordsOfBranches(p.cycle(), p.things())).toEqual(p.ids);
  });

  it("words nudged by hand keep their nudge mirrored with their arrow as it turns: as clear of it turned as before", () => {
    const p = page([top], [{ text: "Ar-X", by: 0 }]);
    const t0 = box(p, p.ids[0]);
    const half = { w: (t0.x1 - t0.x0) / 2, h: (t0.y1 - t0.y0) / 2 };
    // (nudged along the circle, the way the arrow will swing to)
    const w = p.st().captions.find((x) => x.id === p.ids[0])!;
    const nudge = { x: 0.4 * B, y: 0.1 * B };
    p.st().updateCaption(p.ids[0], { x: w.x + nudge.x, y: w.y + nudge.y });
    p.turn();
    const m = branchWordsAt(p.cycle(), top, B, half);
    const t = box(p, p.ids[0]);
    // (across the line from the middle to where it joins - straight up - the nudge is mirrored: its run along the circle the other way)
    expect((t.x0 + t.x1) / 2 - m.x).toBeCloseTo(-nudge.x, 9);
    expect((t.y0 + t.y1) / 2 - m.y).toBeCloseTo(nudge.y, 9);
  });

  it("words written again longer grow away from their arrow: their side facing it stays where it was", () => {
    const p = page([right], [{ text: "Ar-X", by: 0 }]);
    const w = p.st().captions.find((x) => x.id === p.ids[0])!;
    const place = branchOpened(p.st().cycles, w, styleOf(p.st().docStyle))!;
    const t = box(p, p.ids[0]);
    const h = (t.y1 - t.y0) / 2;
    const short = place({ w: (t.x1 - t.x0) / 2, h });
    expect(short.x).toBeCloseTo(w.x, 9);
    expect(short.y).toBeCloseTo(w.y, 9);
    // (twice as wide: the left side, facing the head, where it was)
    const long = place({ w: t.x1 - t.x0, h });
    expect(long.x - (t.x1 - t.x0)).toBeCloseTo(t.x0, 9);
    expect(long.y).toBeCloseTo(w.y, 9);
    // (free words: none)
    expect(branchOpened(p.st().cycles, { id: 99, x: 0, y: 0, text: "Y" }, styleOf(p.st().docStyle))).toBeNull();
  });

  it("put down by hand: near where their arrow sets them, still its; well away, free; free words put down by an arrow with none, its", () => {
    const p = page([top, beside], [{ text: "Ar-X", by: 0 }, { text: "L", at: () => ({ x: 0, y: -6.5 * B }) }]);
    const [own, free] = p.ids.map((n) => p.st().captions.find((w) => w.id === n)!);
    const t = box(p, own.id);
    const half = { w: (t.x1 - t.x0) / 2, h: (t.y1 - t.y0) / 2 };
    const cycles = p.st().cycles;
    const caps = p.st().captions;
    expect(branchDropped(cycles, caps, own, { x: own.x + 0.2 * B, y: own.y }, half)).toEqual(own.branch);
    expect(branchDropped(cycles, caps, own, { x: own.x + 2 * B, y: own.y + 2 * B }, half)).toBeNull();
    const ft = box(p, free.id);
    const fh = { w: (ft.x1 - ft.x0) / 2, h: (ft.y1 - ft.y0) / 2 };
    expect(branchDropped(cycles, caps, free, branchWordsAt(p.cycle(), beside, B, fh), fh)).toEqual({ cycle: p.cycle().id, at: beside.at });
    // (where an arrow with words of its own sets them: not taken from it)
    expect(branchDropped(cycles, caps, free, branchWordsAt(p.cycle(), top, B, fh), fh)).toBeNull();
  });

  it("undone and done again, a turn puts the words back and forth, still their arrow's", () => {
    const p = page([right, top], [{ text: "Ar-X", by: 0 }]);
    lengthened(p, p.ids[0], "Ar-X, 1.1 equiv");
    const first = { ...p.st().captions[0] };
    p.turn();
    const turned = { ...p.st().captions[0] };
    p.doc.undo();
    expect(p.st().captions[0]).toMatchObject({ x: first.x, y: first.y, branch: first.branch });
    expect(wordsOfBranches(p.cycle(), p.things())).toEqual([p.ids[0], null]);
    p.doc.redo();
    expect(p.st().captions[0]).toMatchObject({ x: turned.x, y: turned.y, branch: first.branch });
    expect(wordsOfBranches(p.cycle(), p.things())).toEqual([p.ids[0], null]);
  });

  it("an arrow taken away leaves its words where they stand, free; undone, they are its again", () => {
    const p = page([right, top], [{ text: "Ar-X", by: 0 }]);
    const was = { ...p.st().captions[0] };
    p.st().updateCycle(p.cycle().id, { branches: [top] });
    expect(p.st().captions[0]).toMatchObject({ x: was.x, y: was.y, text: was.text });
    expect(p.st().captions[0].branch).toBeUndefined();
    p.doc.undo();
    expect(p.st().captions[0].branch).toEqual(was.branch);
  });

  it("copied and pasted with its cycle, words are the words of the pasted cycle's arrow; read from a saved record, kept", () => {
    const p = page([right, top], [{ text: "Ar-X", by: 0 }, { text: "L", by: 1 }]);
    const part = { atoms: [], bonds: [], cycles: p.st().cycles, captions: p.st().captions } as never;
    const d0 = p.doc.getState() as WorkspaceDocument;
    const pasted = withImportedScheme(d0, schemeOf(part));
    const copy = pasted.cycles!.find((c) => c.id !== p.cycle().id)!;
    const copies = pasted.captions!.filter((w) => !p.ids.includes(w.id));
    expect(copies.map((w) => w.branch)).toEqual([{ cycle: copy.id, at: right.at }, { cycle: copy.id, at: top.at }]);
    // (the originals still their own cycle's)
    expect(pasted.captions!.filter((w) => p.ids.includes(w.id)).map((w) => w.branch?.cycle)).toEqual([p.cycle().id, p.cycle().id]);
    // (words copied without their cycle: free)
    const alone = withImportedScheme(d0, schemeOf({ atoms: [], bonds: [], captions: p.st().captions } as never));
    expect(alone.captions!.filter((w) => !p.ids.includes(w.id)).every((w) => !w.branch)).toBe(true);
    // (saved and read: kept - of an arrow not there, free)
    const read = readDrawn(JSON.parse(JSON.stringify({ atoms: [], bonds: [], cycles: p.st().cycles, captions: p.st().captions })))!;
    expect(read.captions!.map((w) => w.branch)).toEqual(p.st().captions.map((w) => w.branch));
    const gone = cycleChanged(d0, p.cycle().id, { branches: [top] });
    const readGone = readDrawn(JSON.parse(JSON.stringify({ atoms: [], bonds: [], cycles: gone.cycles, captions: p.st().captions })))!;
    expect(readGone.captions!.map((w) => w.branch)).toEqual([undefined, { cycle: p.cycle().id, at: top.at }]);
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
