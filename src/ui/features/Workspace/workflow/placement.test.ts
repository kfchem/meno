import { describe, expect, it } from "vitest";
import { emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { DrawnModel } from "../store/types";
import { inside, type Frame } from "./entries";
import { resultOf } from "./flow";
import { inputsOf } from "./kinds";
import { CARD_H, CARD_W, GAP, PORT_DOWN, setGives, setTakes, stepGives, stepTakes, wireCurve } from "./look";
import { addStep, connect } from "./model";
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
      lines.push({ name: `wire ${w.id}`, pts: wireCurve(setGives(from), stepTakes(to, Math.max(0, inputsOf(to.kind).findIndex((p) => p.id === w.to.port))), 96) });
    }
    for (const o of sets) {
      const s = o.made && steps.find((x) => x.id === o.made!.step);
      if (s && o.id !== b.id) lines.push({ name: `line to set ${o.id}`, pts: wireCurve(stepGives(s), setTakes(o), 96) });
    }
    for (const l of lines) if (l.pts.some((p) => inside(b, p))) said.push(`set ${b.id} over ${l.name}`);
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

