import { describe, expect, it } from "vitest";
import { emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { DrawnModel } from "../store/types";
import { inside, type Frame } from "./entries";
import { resultOf } from "./flow";
import { inputsOf } from "./kinds";
import { BETWEEN, WIRE_ROOM, byTurn, CARD_H, CARD_W, framesHash, pointsFor, wirePath, wireRoute, type WireWay, GAP, inputLead, nearWire, PORT_DOWN, PORT_STEP, PX, setGives, setTakes, stepGives, stepTakes, WIRE_BAND, wireCurve, wireKey } from "./look";
import { addStep, connect } from "./model";
import { clearOf } from "./place";
import { boxOf } from "../chem/make3d";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { placeResults, type RunResults, type RunWith } from "./run";

const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };

/** Chloroethane as a step might give it, drawn about the origin. */
const chloroethane = (): DrawnModel => ({
  atoms: [
    { id: 1, el: "C", x: 0, y: 0 },
    { id: 2, el: "C", x: 1.56, y: 0.9 },
    { id: 3, el: "Cl", x: 3.12, y: 0 },
  ] as never,
  bonds: [
    { id: 1, a: 1, b: 2, order: 1 },
    { id: 2, a: 2, b: 3, order: 1 },
  ] as never,
});
const drawn = (n: number): RunResults => ({ molecules: [], rest: [], holds: "structures", drawn: { made: Array.from({ length: n }, chloroethane), rest: [] } });

const cardOf = (s: { x: number; y: number }): Frame => ({ x0: s.x, x1: s.x + CARD_W, y0: s.y - CARD_H, y1: s.y });
const overlap = (a: Frame, b: Frame) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Whatever a page's result sets lie over: another set, a step's card, or a
 * wire - one from or to another set or step than its own - each said.
 */
function overlaps(doc: WorkspaceDocument): string[] {
  const sets = doc.sets ?? [];
  const steps = doc.steps ?? [];
  const said: string[] = [];
  const made = sets.filter((b) => b.made);
  // (what wires go round, as Workflow2D has them: the page's sets and cards)
  const page: Frame[] = [...sets, ...steps.map(cardOf)];
  for (const b of made) {
    for (const o of sets) if (o.id !== b.id && overlap(b, o)) said.push(`set ${b.id} over set ${o.id}`);
    for (const s of steps) if (overlap(b, cardOf(s))) said.push(`set ${b.id} over step ${s.id}'s card`);
    // (each wire not its own: from a set into a step, and from a step to its result set)
    const lines: { name: string; pts: { x: number; y: number }[] }[] = [];
    for (const w of doc.wires ?? []) {
      const from = sets.find((x) => x.id === w.from.set)!;
      const to = steps.find((x) => x.id === w.to.step)!;
      if (from.id === b.id) continue;
      const e = { from, to: cardOf(to) };
      const q = stepTakes(to, Math.max(0, inputsOf(to.kind).findIndex((p) => p.id === w.to.port)));
      lines.push({ name: `wire ${w.id}`, pts: wirePath(setGives(from), q, e, nearWire(setGives(from), q, e, page)) });
    }
    for (const o of sets) {
      const s = o.made && steps.find((x) => x.id === o.made!.step);
      const e = s && { from: cardOf(s), to: o as Frame };
      if (s && e && o.id !== b.id) lines.push({ name: `line to set ${o.id}`, pts: wirePath(stepGives(s), setTakes(o), e, nearWire(stepGives(s), setTakes(o), e, page)) });
    }
    for (const l of lines) if (l.pts.some((p) => inside(b, p))) said.push(`set ${b.id} over ${l.name}`);
    // (and its own wires and line, none turning back over it: in it, off its sides)
    const within = (p: { x: number; y: number }) => p.x > b.x0 + 1e-6 && p.x < b.x1 - 1e-6 && p.y > b.y0 + 1e-6 && p.y < b.y1 - 1e-6;
    for (const w of (doc.wires ?? []).filter((w) => w.from.set === b.id)) {
      const to = steps.find((x) => x.id === w.to.step)!;
      const e = { from: b as Frame, to: cardOf(to) };
      const q = stepTakes(to, Math.max(0, inputsOf(to.kind).findIndex((p) => p.id === w.to.port)));
      if (wirePath(setGives(b), q, e, nearWire(setGives(b), q, e, page)).some(within)) said.push(`set ${b.id} under its own wire ${w.id}`);
    }
    const by = steps.find((x) => x.id === b.made!.step);
    const own = by && { from: cardOf(by), to: b as Frame };
    if (by && own && wirePath(stepGives(by), setTakes(b), own, nearWire(stepGives(by), setTakes(b), own, page)).some(within)) said.push(`set ${b.id} under its own line`);
  }
  return said;
}

/** A chain of `n` steps that take structures drawn and give them, each a card's width and a gap apart - as a chemist lays a chain out by hand, close - each wired from the one before's result set once that has run. */
function chain(n: number, each: number): WorkspaceDocument {
  let doc = emptyWorkspaceDocument();
  for (let k = 0; k < n; k++) doc = addStep(doc, "descriptors", k * (CARD_W + 4), 0);
  for (let k = 0; k < n; k++) {
    const step = doc.steps![k];
    doc = placeResults(doc, step, drawn(each), W);
    if (k + 1 < n) doc = connect(doc, { set: resultOf(doc, step.id, "out")!.id }, doc.steps![k + 1].id);
  }
  return doc;
}

/** How far one line lies from the other at most, either way: each point to the nearest of the other's segments. */
const apart = (a: { x: number; y: number }[], b: { x: number; y: number }[]) => {
  const seg = (pt: { x: number; y: number }, u: { x: number; y: number }, v: { x: number; y: number }) => {
    const dx = v.x - u.x;
    const dy = v.y - u.y;
    const t = Math.max(0, Math.min(1, ((pt.x - u.x) * dx + (pt.y - u.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(pt.x - u.x - t * dx, pt.y - u.y - t * dy);
  };
  const off = (A: typeof a, B: typeof b) => Math.max(...A.map((pt) => Math.min(...B.slice(1).map((v, i) => seg(pt, B[i], v)))));
  return Math.max(off(a, b), off(b, a));
};


describe("where a result set goes", () => {
  it("is clear of every other set, card and wire, in a chain of steps laid close - 19 structures drawn from each", () => {
    const doc = chain(4, 19);
    // (each step two exits: what it gives, and what it sets aside)
    expect((doc.sets ?? []).filter((b) => b.made)).toHaveLength(8);
    expect(overlaps(doc)).toEqual([]);
  });

  it("stays where it was as its step runs again, where it still fits - and moves where it grew over something", () => {
    let doc = chain(2, 3);
    const first = doc.steps![0];
    const was = resultOf(doc, first.id, "out")!;
    // (the same again: in place)
    doc = placeResults(doc, first, drawn(3), W);
    const same = resultOf(doc, first.id, "out")!;
    expect([same.id, same.x0, same.y1]).toEqual([was.id, was.x0, was.y1]);
    // (many more: grown over the next step's card where it was - put where it is clear, still the same set, still wired)
    doc = placeResults(doc, first, drawn(19), W);
    const grown = resultOf(doc, first.id, "out")!;
    expect(grown.id).toBe(was.id);
    expect(overlaps(doc)).toEqual([]);
    expect((doc.wires ?? []).some((w) => w.from.set === grown.id)).toBe(true);
  });

  it("keeps clear of a wire that passes where it would go", () => {
    // (a set wired into a step far to its right, level with it: its wire runs through where a step between them would put its set)
    let doc = addStep(emptyWorkspaceDocument(), "descriptors", 0, 0);
    doc = placeResults(doc, doc.steps![0], drawn(1), W);
    const from = resultOf(doc, doc.steps![0].id, "out")!;
    doc = addStep(doc, "descriptors", from.x1 + 60, (from.y0 + from.y1) / 2 + PORT_DOWN);
    doc = connect(doc, { set: from.id }, doc.steps![1].id);
    // (the step between, level with the wire, its card under it - its set to go lower, clear of the wire)
    doc = addStep(doc, "descriptors", from.x1 + 8, (from.y0 + from.y1) / 2 + PORT_DOWN);
    const between = doc.steps![2];
    const wire = wireCurve(setGives(from), stepTakes(doc.steps![1], 0), 96);
    // (where a set would go beside it, were the wire not there: the wire runs through it)
    const beside = { x0: between.x + CARD_W + GAP, x1: between.x + CARD_W + GAP + CARD_W, y0: between.y - CARD_H, y1: between.y };
    expect(wire.some((p) => inside(beside, p))).toBe(true);
    doc = placeResults(doc, between, drawn(2), W);
    expect(overlaps(doc)).toEqual([]);
  });
});


describe("what a set keeps clear of: a structure's ink, and its own wires", () => {
  const L = NOMINAL_BOND_LENGTH;
  /** A page with one structure drawn on it, not in any set. */
  const drawnOn = (atoms: { el: string; x: number; y: number }[], bonds: [number, number][]): WorkspaceDocument => ({
    ...emptyWorkspaceDocument(),
    model: { atoms: atoms.map((a, i) => ({ id: i + 1, r: 0.9, ...a })), bonds: bonds.map(([a, b], i) => ({ id: i + 1, a, b, order: 1 })) } as never,
  });
  const f: Frame = { x0: 0, x1: 10, y0: -10, y1: 0 };

  it("keeps BETWEEN from a structure's labels' letters, not only its atoms: a Cl just beyond reach, its letters within it", () => {
    // (C-Cl, the Cl to the left, its atom just past BETWEEN from the frame's right side - its letters, about half a bond either side of it, within)
    const at = f.x1 + BETWEEN + 0.1 * L;
    const doc = drawnOn([{ el: "Cl", x: at, y: -5 }, { el: "C", x: at + L, y: -5 }], [[1, 2]]);
    expect(boxOf({ atoms: doc.model.atoms, bonds: doc.model.bonds }).x0).toBeLessThan(f.x1 + BETWEEN);
    expect(clearOf(doc, f)).toBe(false);
    // (moved a bond further off: clear)
    expect(clearOf(drawnOn([{ el: "Cl", x: at + L, y: -5 }, { el: "C", x: at + 2 * L, y: -5 }], [[1, 2]]), f)).toBe(true);
  });

  it("keeps BETWEEN from a structure's bonds: a long one across it, its atoms both well outside", () => {
    const doc = drawnOn([{ el: "C", x: -6, y: -5 }, { el: "C", x: 16, y: -5 }], [[1, 2]]);
    expect(clearOf(doc, f)).toBe(false);
  });

  it("a wire coming back - into a step to the left of its set's right side, above it - goes round both, never over either", () => {
    // (a tall set, and a step's card well above it whose input is to the left of the set's right side: as steps laid close have it)
    const set: Frame = { x0: 10, x1: 16, y0: -60, y1: -4 };
    const card = cardOf({ x: 12, y: 8 });
    const p = setGives(set);
    const q = stepTakes({ x: 12, y: 8 }, 0);
    const strictly = (b: Frame) => (pt: { x: number; y: number }) => pt.x > b.x0 + 1e-9 && pt.x < b.x1 - 1e-9 && pt.y > b.y0 + 1e-9 && pt.y < b.y1 - 1e-9;
    // (the curve alone: back over the set)
    expect(wireCurve(p, q, 96).some(strictly(set))).toBe(true);
    const pts = wireCurve(p, q, 96, { from: set, to: card });
    expect(pts).toHaveLength(97);
    expect([pts[0], pts[96]]).toEqual([p, q]);
    expect(pts.some(strictly(set)) || pts.some(strictly(card))).toBe(false);
    // (leaving to the right, and coming into the input from its left: a bond out from each, as far as its turns go)
    expect(Math.max(...pts.map((pt) => pt.x))).toBeCloseTo(set.x1 + WIRE_ROOM, 6);
    expect(Math.min(...pts.map((pt) => pt.x))).toBeCloseTo(card.x0 - WIRE_ROOM, 6);
    // (across between the two, the set under the card: no higher than the card's foot, no lower than the set's top)
    const across = pts.filter((pt) => pt.x > card.x0 && pt.x < set.x1);
    for (const pt of across) expect(pt.y > set.y1 - 1e-9 && pt.y < card.y0 + 1e-9).toBe(true);
    // (going on to the right, as it was: the curve)
    const far = stepTakes({ x: 40, y: 0 }, 0);
    expect(wireCurve(p, far, 48, { from: set, to: cardOf({ x: 40, y: 0 }) })).toEqual(wireCurve(p, far, 48));
  });
});

describe("a wire's shape", () => {
  const strictly = (b: Frame) => (pt: { x: number; y: number }) => pt.x > b.x0 + 1e-9 && pt.x < b.x1 - 1e-9 && pt.y > b.y0 + 1e-9 && pt.y < b.y1 - 1e-9;

  it("is smooth: a long run down with little across, its bends drawn through points a few px and a few degrees apart", () => {
    const p = { x: 0, y: 0 };
    for (const [across, down] of [[30, 600], [8, 300], [200, 40], [-60, 400]]) {
      const q = { x: across * PX, y: -down * PX };
      const from: Frame = { x0: -20 * PX, x1: 0, y0: -10 * PX, y1: 10 * PX };
      const path = wirePath(p, q, { from, to: cardOf({ x: q.x, y: q.y + PORT_DOWN }) });
      // (drawn at the page's own size: a page pixel a screen pixel)
      const pts = byTurn(path, pointsFor(path, 1 / PX));
      let far = 0;
      let turn = 0;
      for (let i = 1; i < pts.length; i++) {
        far = Math.max(far, Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) / PX);
        if (i < pts.length - 1) {
          const a = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
          const b = Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x);
          let t = Math.abs(b - a);
          if (t > Math.PI) t = 2 * Math.PI - t;
          turn = Math.max(turn, (t * 180) / Math.PI);
        }
      }
      expect(far).toBeLessThan(4);
      expect(turn).toBeLessThan(6);
      expect([pts[0], pts[pts.length - 1]]).toEqual([p, q]);
    }
  });

  it("turns in an arc as wide as its run is long, not a tight hook: the tighter the shorter the run", () => {
    // (the least radius it turns at, from three points at a time along its path)
    const radius = (pts: { x: number; y: number }[]) => {
      let least = Infinity;
      for (let i = 1; i < pts.length - 1; i++) {
        const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
        const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
        if (area > 1e-12) least = Math.min(least, (Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y) * Math.hypot(a.x - c.x, a.y - c.y)) / (4 * area));
      }
      return least / PX;
    };
    const p = { x: 0, y: 0 };
    const [long, middling, short] = [600, 300, 60].map((down) => radius(wirePath(p, { x: 160 * PX, y: -down * PX })));
    expect(long).toBeGreaterThan(45);
    expect(middling).toBeGreaterThan(45);
    void short;
    // (and kept between its ends: never further right than its input, nor left of where it leaves)
    const kept = wirePath(p, { x: 64 * PX, y: -600 * PX });
    expect(Math.max(...kept.map((pt) => pt.x))).toBeLessThanOrEqual(64 * PX + 1e-9);
    expect(Math.min(...kept.map((pt) => pt.x))).toBeGreaterThanOrEqual(-1e-9);

  });

  it("never jumps as its input is moved across the band where it turns from going round to the curve: 1 px apart, a few px at most", () => {
    const from: Frame = { x0: 0, x1: 6, y0: -12, y1: -2 };
    const p = setGives(from);
    let was: { x: number; y: number }[] | null = null;
    let most = 0;
    // (the input moved right a page pixel at a time, from well before the band to well past it, level with the set's top)
    for (let px = WIRE_BAND.from / PX - 20; px <= WIRE_BAND.to / PX + 20; px++) {
      const at = { x: p.x + px * PX, y: 2 };
      const pts = wireCurve(p, stepTakes(at, 0), 48, { from, to: cardOf(at) });
      // (as it is seen: how far either line lies from the other - its points slide along it as its bends are spread anew, which is no change to see)
      if (was) most = Math.max(most, apart(pts, was) / PX);
      was = pts;
    }
    expect(most).toBeLessThan(12);
    // (before the band, round: clear of its set; well past it, level with where it leaves and clear of both, the curve, as it ever was)
    const before = { x: p.x + WIRE_BAND.from - PX, y: 2 };
    expect(wireCurve(p, stepTakes(before, 0), 48, { from, to: cardOf(before) }).some(strictly(from))).toBe(false);
    const level = { x: p.x + 300 * PX, y: p.y + PORT_DOWN };
    expect(wireCurve(p, stepTakes(level, 0), 48, { from, to: cardOf(level) })).toEqual(wireCurve(p, stepTakes(level, 0), 48));
  });

  it("where no way round is clear of all, goes the way over least - over what it must, not over what a set holds", () => {
    // (as steps laid close have it: a set below a step's card, the step before's empty second exit just under that, and a set lower right wired back up into the card)
    const card = cardOf({ x: 20, y: 0 });
    const full: Frame = { x0: 10, x1: 22, y0: -40, y1: -4 };
    const rest: Frame = { x0: 10, x1: 16, y0: -42, y1: -41 };
    const from: Frame = { x0: 15, x1: 30, y0: -60, y1: -41.5 };
    const p = setGives(from);
    const q = stepTakes({ x: 20, y: 0 }, 0);
    // (and a tall frame just right of where it leaves, that every way round must cross)
    const wall: Frame = { x0: from.x1 + BETWEEN / 2, x1: from.x1 + 2 * BETWEEN, y0: -90, y1: 30 };
    const around = [card, full, rest, from, wall];
    const pts = wireCurve(p, q, 96, { from, to: card }, around);
    expect([pts[0], pts[96]]).toEqual([p, q]);
    expect(pts.some(strictly(full))).toBe(false);
  });

  it("into a card that names its inputs, comes in level under the name: from above or below, never through it", () => {
    const at = { x: 40, y: 0 };
    const card = cardOf(at);
    for (const [k, name] of ["Levels", "Connects"].entries()) {
      const q = stepTakes(at, k);
      // (the name: 10 px letters, their middle half a port's step above the input, from 8 px out from the card to its lead's start)
      const label: Frame = { x0: q.x - inputLead(name), x1: q.x - 8 * PX, y0: q.y + (PORT_STEP / 2) - 5 * PX, y1: q.y + (PORT_STEP / 2) + 5 * PX };
      for (const from of [{ x0: 0, x1: 10, y0: 20, y1: 40 }, { x0: 0, x1: 10, y0: -40, y1: -20 }, { x0: 0, x1: 10, y0: -2, y1: 4 }] as Frame[]) {
        const pts = wireCurve(setGives(from), q, 96, { from, to: card, lead: inputLead(name) });
        expect([pts[0], pts[96]]).toEqual([setGives(from), q]);
        expect(pts.some(strictly(label))).toBe(false);
      }
    }
  });

  it("goes round a set between its ends - a step's line to its set, below another set it would cross - never over what that holds", () => {
    // (as steps laid close have it: the step's card, the set of the step before under it, and its own set below that)
    const card = cardOf({ x: 10, y: 0 });
    const between: Frame = { x0: 6, x1: 16, y0: -40, y1: -4 };
    const own: Frame = { x0: 12, x1: 22, y0: -70, y1: -44 };
    const p = stepGives({ x: 10, y: 0 });
    const q = setTakes(own);
    expect(wireCurve(p, q, 96, { from: card, to: own }).some(strictly(between))).toBe(true);
    const pts = wireCurve(p, q, 96, { from: card, to: own }, [card, between, own]);
    expect([pts[0], pts[96]]).toEqual([p, q]);
    for (const f of [card, between, own]) expect(pts.some(strictly(f))).toBe(false);
  });
});

describe("a wire dragged past what it goes round", () => {
  it("keeps the way it went while that is still clear: a card dragged in 2 px steps past a set changes its wire's way at most twice", () => {
    // (a set, a step's card well to its right, and another set between them; the card dragged from well above that set to well below it)
    const from: Frame = { x0: 0, x1: 10, y0: -10, y1: 0 };
    const block: Frame = { x0: 16, x1: 26, y0: -12, y1: 2 };
    const ways = (keep: boolean) => {
      let was: WireWay | undefined;
      let before: { x: number; y: number }[] | null = null;
      let changes = 0;
      for (let dy = 240; dy >= -240; dy -= 2) {
        const at = { x: 34, y: -5 + dy * PX };
        const card = cardOf(at);
        const q = stepTakes(at, 0);
        const e = { from, to: card };
        const r = wireRoute(setGives(from), q, e, nearWire(setGives(from), q, e, [from, block, card]), keep ? was : undefined);
        // (a change of way: the wire seen to jump - more than 12 px from where it was, beyond the 2 px its input moved)
        if (before && apart(r.pts, before) / PX > 12) changes++;
        was = r.way;
        before = r.pts;
      }
      return changes;
    };
    const [kept, unkept] = [ways(true), ways(false)];
    expect(kept).toBeLessThanOrEqual(2);
    expect(kept).toBeLessThanOrEqual(unkept);
  }, 30000);
});

describe("a page's wires, worked out again", () => {
  it("only where a wire or something near it moved - 50 wires on a page of 100 sets and 50 cards, keyed in well under a frame", () => {
    // (100 sets in a grid, 50 steps' cards beside them, and 50 wires each from a set into a card)
    const sets: Frame[] = Array.from({ length: 100 }, (_, i) => ({ x0: (i % 10) * 30, x1: (i % 10) * 30 + 10, y0: -Math.floor(i / 10) * 30 - 10, y1: -Math.floor(i / 10) * 30 }));
    const cards = Array.from({ length: 50 }, (_, i) => cardOf({ x: (i % 10) * 30 + 15, y: -Math.floor(i / 5) * 30 }));
    const wires = Array.from({ length: 50 }, (_, i) => ({ p: setGives(sets[i * 2]), q: { x: cards[i].x0, y: cards[i].y1 - PORT_DOWN }, e: { from: sets[i * 2], to: cards[i] } }));
    const keys = (all: Frame[]) => wires.map((w) => wireKey(w.p, w.q, w.e, framesHash(nearWire(w.p, w.q, w.e, all))));
    const page = [...sets, ...cards];
    const k0 = keys(page);
    // (as a drag has it: the keys of all, each frame - 100 frames)
    const t0 = performance.now();
    for (let k = 0; k < 100; k++) keys(page);
    const each = (performance.now() - t0) / 100;
    expect(each).toBeLessThan(4);
    // (a set far to the bottom right moved: the wires near it keyed anew, those far off - the first, at the top left - as they were)
    const moved = page.map((f, i) => (i === 99 ? { ...f, x0: f.x0 + 1, x1: f.x1 + 1 } : f));
    const k1 = keys(moved);
    const changed = k1.filter((k, i) => k !== k0[i]).length;
    expect(k1[0]).toBe(k0[0]);
    expect(changed).toBeLessThan(wires.length);
    // (and the same page, the same keys)
    expect(keys(page)).toEqual(k0);
  });

  it("a drag frame works out again only the wires whose key changed - a card moved 2 px among 100 sets, in well under a frame", () => {
    const sets: Frame[] = Array.from({ length: 100 }, (_, i) => ({ x0: (i % 10) * 30, x1: (i % 10) * 30 + 10, y0: -Math.floor(i / 10) * 30 - 10, y1: -Math.floor(i / 10) * 30 }));
    const cards = Array.from({ length: 50 }, (_, i) => cardOf({ x: (i % 10) * 30 + 15, y: -Math.floor(i / 5) * 30 }));
    const page = [...sets, ...cards];
    const wires = Array.from({ length: 50 }, (_, i) => ({ p: setGives(sets[i * 2]), q: { x: cards[i].x0, y: cards[i].y1 - PORT_DOWN }, e: { from: sets[i * 2], to: cards[i] } }));
    const drawn = (w: (typeof wires)[number], all: Frame[]) => {
      const r = wireRoute(w.p, w.q, w.e, nearWire(w.p, w.q, w.e, all));
      return byTurn(r.pts, pointsFor(r.pts, 1));
    };
    // (all of them, as the page opens - and their keys)
    wires.forEach((w) => drawn(w, page));
    const keys = (all: Frame[], ws: typeof wires) => ws.map((w) => wireKey(w.p, w.q, w.e, framesHash(nearWire(w.p, w.q, w.e, all))));
    const k0 = keys(page, wires);
    // (the first card moved 2 px right, its wire's input with it: as a drag's frame has it)
    const moved = page.map((f, i) => (i === 100 ? { ...f, x0: f.x0 + 2 * PX, x1: f.x1 + 2 * PX } : f));
    const now = wires.map((w, i) => (i === 0 ? { ...w, q: { x: w.q.x + 2 * PX, y: w.q.y }, e: { ...w.e, to: moved[100] } } : w));
    const t = performance.now();
    const k1 = keys(moved, now);
    const again = now.filter((_, i) => k1[i] !== k0[i]);
    again.forEach((w) => drawn(w, moved));
    const frame = performance.now() - t;
    expect(again.length).toBeLessThan(wires.length / 4);
    // (16 ms a frame at 60 frames a second; this Mac takes about 7 - room left for a slower one)
    expect(frame).toBeLessThan(48);
  });
});
