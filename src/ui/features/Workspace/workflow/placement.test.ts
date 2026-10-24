import { describe, expect, it } from "vitest";
import { emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { DrawnModel } from "../store/types";
import { inside, type Frame } from "./entries";
import { resultOf } from "./flow";
import { inputsOf } from "./kinds";
import { BETWEEN, CARD_H, CARD_W, framesHash, GAP, inputLead, nearWire, PORT_DOWN, PORT_STEP, PX, setGives, setTakes, stepGives, stepTakes, WIRE_BAND, wireCurve, wireKey } from "./look";
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
  for (const b of made) {
    for (const o of sets) if (o.id !== b.id && overlap(b, o)) said.push(`set ${b.id} over set ${o.id}`);
    for (const s of steps) if (overlap(b, cardOf(s))) said.push(`set ${b.id} over step ${s.id}'s card`);
    // (each wire not its own: from a set into a step, and from a step to its result set)
    const lines: { name: string; pts: { x: number; y: number }[] }[] = [];
    for (const w of doc.wires ?? []) {
      const from = sets.find((x) => x.id === w.from.set)!;
      const to = steps.find((x) => x.id === w.to.step)!;
      if (from.id === b.id) continue;
      lines.push({ name: `wire ${w.id}`, pts: wireCurve(setGives(from), stepTakes(to, Math.max(0, inputsOf(to.kind).findIndex((p) => p.id === w.to.port))), 96, { from, to: cardOf(to) }) });
    }
    for (const o of sets) {
      const s = o.made && steps.find((x) => x.id === o.made!.step);
      if (s && o.id !== b.id) lines.push({ name: `line to set ${o.id}`, pts: wireCurve(stepGives(s), setTakes(o), 96, { from: cardOf(s), to: o }) });
    }
    for (const l of lines) if (l.pts.some((p) => inside(b, p))) said.push(`set ${b.id} over ${l.name}`);
    // (and its own wires and line, none turning back over it: in it, off its sides)
    const within = (p: { x: number; y: number }) => p.x > b.x0 + 1e-6 && p.x < b.x1 - 1e-6 && p.y > b.y0 + 1e-6 && p.y < b.y1 - 1e-6;
    for (const w of (doc.wires ?? []).filter((w) => w.from.set === b.id)) {
      const to = steps.find((x) => x.id === w.to.step)!;
      if (wireCurve(setGives(b), stepTakes(to, Math.max(0, inputsOf(to.kind).findIndex((p) => p.id === w.to.port))), 96, { from: b, to: cardOf(to) }).some(within)) said.push(`set ${b.id} under its own wire ${w.id}`);
    }
    const by = steps.find((x) => x.id === b.made!.step);
    if (by && wireCurve(stepGives(by), setTakes(b), 96, { from: cardOf(by), to: b }).some(within)) said.push(`set ${b.id} under its own line`);
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
    // (a tall set, and a step's card above it whose input is to the left of the set's right side: as steps laid close have it)
    const set: Frame = { x0: 10, x1: 16, y0: -60, y1: -4 };
    const card = cardOf({ x: 12, y: 0 });
    const p = setGives(set);
    const q = stepTakes({ x: 12, y: 0 }, 0);
    const strictly = (b: Frame) => (pt: { x: number; y: number }) => pt.x > b.x0 + 1e-9 && pt.x < b.x1 - 1e-9 && pt.y > b.y0 + 1e-9 && pt.y < b.y1 - 1e-9;
    // (the curve alone: back over the set)
    expect(wireCurve(p, q, 96).some(strictly(set))).toBe(true);
    const pts = wireCurve(p, q, 96, { from: set, to: card });
    expect(pts).toHaveLength(97);
    expect([pts[0], pts[96]]).toEqual([p, q]);
    expect(pts.some(strictly(set)) || pts.some(strictly(card))).toBe(false);
    // (leaving to the right, and coming into the input from its left: half a bond out from each)
    expect(Math.max(...pts.map((pt) => pt.x))).toBeCloseTo(set.x1 + BETWEEN, 6);
    expect(Math.min(...pts.map((pt) => pt.x))).toBeCloseTo(card.x0 - BETWEEN, 6);
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

  it("never jumps as its input is moved across the band where it turns from going round to the curve: 1 px apart, a few px at most", () => {
    const from: Frame = { x0: 0, x1: 6, y0: -12, y1: -2 };
    const p = setGives(from);
    let was: { x: number; y: number }[] | null = null;
    let most = 0;
    // (the input moved right a page pixel at a time, from well before the band to well past it, level with the set's top)
    for (let px = WIRE_BAND.from / PX - 20; px <= WIRE_BAND.to / PX + 20; px++) {
      const at = { x: p.x + px * PX, y: 2 };
      const pts = wireCurve(p, stepTakes(at, 0), 48, { from, to: cardOf(at) });
      if (was) most = Math.max(most, ...pts.map((pt, i) => Math.hypot(pt.x - was![i].x, pt.y - was![i].y) / PX));
      was = pts;
    }
    expect(most).toBeLessThan(6);
    // (and either side of it, the one or the other whole)
    const before = { x: p.x + WIRE_BAND.from - PX, y: 2 };
    const after = { x: p.x + WIRE_BAND.to + PX, y: 2 };
    expect(wireCurve(p, stepTakes(after, 0), 48, { from, to: cardOf(after) })).toEqual(wireCurve(p, stepTakes(after, 0), 48));
    expect(wireCurve(p, stepTakes(before, 0), 48, { from, to: cardOf(before) }).some(strictly(from))).toBe(false);
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
});
