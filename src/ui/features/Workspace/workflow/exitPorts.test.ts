import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { appendModel, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { Model } from "../store/types";
import { boxOf } from "../chem/make3d";
import type { Frame } from "./entries";
import { resultOf } from "./flow";
import { exitPlace, exitsOf, inputsOf, KINDS } from "./kinds";
import { BETWEEN, CARD_H, CARD_W, nearWire, portDown, PX, setTakes, stepGives, stepTakes, wirePath } from "./look";
import { addStep } from "./model";
import { placeResults, type RunResults, type RunWith } from "./run";
import type { Molecule3D } from "../store/types";
import { clearOf, exitStart, frameAt, lineFrom, placeAgain, placeFor } from "./place";

describe("a step's exits' ports (docs/WORKFLOWS.md, *Exit ports*)", () => {
  it("stand down the card's right edge, each as far down as the input of its place on the left, all on the card shut - for every kind", () => {
    const s = { x: 120, y: -40 };
    for (const { kind } of KINDS) {
      const exits = exitsOf(kind);
      exits.forEach((x, k) => {
        const p = stepGives(s, exitPlace(kind, x.id));
        expect(p).toEqual({ x: s.x + CARD_W, y: stepTakes(s, k).y });
        expect(p.y).toBeGreaterThan(s.y - CARD_H);
        expect(p.y).toBeLessThan(s.y);
      });
      // (no more of them than a card shut has room for, as inputs)
      expect(Math.max(exits.length, inputsOf(kind).length)).toBeLessThanOrEqual(3);
    }
  });

  it("are placed by an exit's place among its kind's - the first's for one the kind has not", () => {
    expect(exitsOf("atom-map").map((x) => exitPlace("atom-map", x.id))).toEqual([0, 1, 2]);
    expect(exitPlace("optimise", "failed")).toBe(1);
    expect(exitPlace("optimise", "no-such-exit")).toBe(0);
    expect(stepGives({ x: 0, y: 0 })).toEqual(stepGives({ x: 0, y: 0 }, 0));
    expect(stepGives({ x: 0, y: 0 }, 1).y - stepGives({ x: 0, y: 0 }, 0).y).toBe(portDown(0) - portDown(1));
  });

  it("are where each exit's set's line leaves: a step put down has its second exit's set below its first, each line from its own port, level or going down", () => {
    const doc = addStep(emptyWorkspaceDocument(), "optimise", 0, 0);
    const s = doc.steps![0];
    const first = resultOf(doc, s.id, exitsOf("optimise")[0].id)!;
    const failed = resultOf(doc, s.id, "failed")!;
    expect(failed.y1).toBeLessThan(first.y0);
    // (each line from its own port to its set's left side: the second's lower down than the first's, as its set is)
    const from = [stepGives(s, exitPlace(s.kind, first.made!.exit)), stepGives(s, exitPlace(s.kind, failed.made!.exit))];
    expect(from[1].y).toBeLessThan(from[0].y);
    expect(setTakes(failed).y).toBeLessThanOrEqual(from[1].y);
  });

  it("are drawn on the ports layer, one for each exit with a set, its set's - a wire drawn out of it drawn out of that set, from the card", () => {
    const layer = readFileSync(join(__dirname, "../components/Workflow2D.tsx"), "utf8");
    // (drawn by WebGL: each its key, down the card's right edge, as far down as an input of its place - pageGl/ports)
    expect(layer).toMatch(/exits\.forEach\(\(x, k\) =>[\s\S]*?key: `port:exit:\$\{s\.id\}:\$\{x\.id\}`, x: s\.x \+ CARD_W, y: s\.y - portDown\(k\)/);
    expect(layer).toMatch(/"exit" in of[\s\S]*?drawFrom\(asPress\(e\), \{ set: b\.id \}\)/);
    // (its line to its set drawn from where placing measures it: `exitStart`, the layer rendered only in a WebGL page)
    expect(layer).toMatch(/const exitGives = [\s\S]*?exitStart\(s, b\.made\.exit\)/);
    expect(layer).toMatch(/key: `m\$\{b\.id\}`, p, q: setTakes/);
  });
});

/** A step of two exits, `optimise`, at the page's origin: its card, as placing has it, and its exits' sets as `withExits` put them. */
function twoExits(doc: WorkspaceDocument = emptyWorkspaceDocument()) {
  const d = addStep(doc, "optimise", 0, 0);
  const s = d.steps![d.steps!.length - 1];
  return { doc: d, s, card: frameAt(s.x, s.y, CARD_W, CARD_H), first: resultOf(d, s.id)!, second: resultOf(d, s.id, "failed")! };
}
const frameOf = (f: Frame): Frame => ({ x0: f.x0, x1: f.x1, y0: f.y0, y1: f.y1 });
/** A line from a card's port `p` to set `f`, as placing works it out and Workflow2D draws it (look `wirePath`, round `round`). */
function lineTo(p: { x: number; y: number }, card: Frame, f: Frame, round: readonly Frame[]) {
  const e = { from: card, to: f };
  return wirePath(p, setTakes(f), e, nearWire(p, setTakes(f), e, round));
}

/**
 * A short bond on the line from a card's first port to frame `to` - far
 * enough along that the first port's line half a card lower passes it,
 * and clear of the second port's line to `to` and of the first exit's own
 * line to `first`: a set placed for the second exit at `to` stays there
 * only where its line is measured from the second port.
 */
function bondAcross(s: { x: number; y: number }, card: Frame, first: Frame, to: Frame): Model {
  const round = [first, card];
  const lower = { ...to, y0: to.y0 - CARD_H / 2, y1: to.y1 - CARD_H / 2 };
  const [l0, l1, l0lower] = [lineTo(stepGives(s, 0), card, to, round), lineTo(stepGives(s, 1), card, to, round), lineTo(stepGives(s, 0), card, lower, round)];
  // (the first exit's own line, as it was placed: before the second's set was made)
  const first0 = lineTo(stepGives(s, 0), card, first, [card]);
  for (const p of l0) {
    if (p.x <= card.x1 + 2 * PX || p.x >= to.x0 - BETWEEN - 4 * PX) continue;
    const at: Model = { atoms: [{ id: 900, el: "C", x: p.x, y: p.y - 3 * PX }, { id: 901, el: "C", x: p.x, y: p.y + 3 * PX }], bonds: [{ id: 902, a: 900, b: 901, order: 1 }] } as Model;
    const ink = boxOf(at);
    const across = (q: { x: number; y: number }) => q.x > ink.x0 && q.x < ink.x1 && q.y > ink.y0 && q.y < ink.y1;
    if (l0.some(across) && !l1.some(across) && !l0lower.some(across) && !first0.some(across) && ink.x1 < to.x0 - BETWEEN) return at;
  }
  throw new Error("no place on the first port's line for a bond clear of the others");
}

describe("a set's line, from its own exit's port, as placing keeps it clear (place `lineFrom`, `exitStart`)", () => {
  it("leaves from the exit a set was made by - whatever else is said - from the exit said for one not made yet, else from the first", () => {
    const { doc, s, first, second } = twoExits();
    expect(lineFrom(doc, { step: s.id, set: second.id })).toEqual(stepGives(s, 1));
    expect(lineFrom(doc, { step: s.id, set: second.id, exit: "out" })).toEqual(stepGives(s, 1));
    expect(lineFrom(doc, { step: s.id, set: first.id, exit: "failed" })).toEqual(stepGives(s, 0));
    expect(lineFrom(doc, { step: s.id, exit: "failed" })).toEqual(stepGives(s, 1));
    expect(lineFrom(doc, { step: s.id })).toEqual(stepGives(s, 0));
    expect(lineFrom(doc, { set: second.id })).toBeUndefined();
    for (const { kind } of KINDS) for (const x of exitsOf(kind)) expect(exitStart({ ...s, kind }, x.id)).toEqual(stepGives(s, exitPlace(kind, x.id)));
  });

  it("is what a frame keeps clear of, another set's, as it leaves its own port: one beside the card, by the first port's line and not the second's, is clear where the second exit's set alone is drawn to", () => {
    const { doc: made, s, card, first, second } = twoExits();
    // (the first exit's set gone: the second's line alone leaves the card)
    const doc = { ...made, sets: made.sets!.filter((b) => b.id !== first.id) };
    const round = [...doc.sets!, card];
    const f = { x0: card.x1 + BETWEEN + PX / 2, x1: card.x1 + BETWEEN + 8 * PX, y0: stepGives(s, 0).y + BETWEEN - 6 * PX, y1: stepGives(s, 0).y + BETWEEN + 2 * PX };
    const near = (p: { x: number; y: number }) => p.x > f.x0 - BETWEEN && p.x < f.x1 + BETWEEN && p.y > f.y0 - BETWEEN && p.y < f.y1 + BETWEEN;
    // (as the page stands: the first port's line to the second's set would reach it, the second's does not)
    expect([lineTo(stepGives(s, 0), card, second, round).some(near), lineTo(stepGives(s, 1), card, second, round).some(near)]).toEqual([true, false]);
    expect(clearOf(doc, f)).toBe(true);
  });

  it("keeps a later exit's set just under the first as that grows over it - itself no hindrance where it stood", () => {
    const water = (dx: number): Omit<Molecule3D, "id" | "at"> =>
      ({ atoms: [{ el: "O", x: dx, y: 0, z: 0 }, { el: "H", x: dx + 0.96, y: 0, z: 0 }, { el: "H", x: dx - 0.24, y: 0.93, z: 0 }], bonds: [{ a1: 0, a2: 1, order: 1 }, { a1: 0, a2: 2, order: 1 }] }) as never;
    const { doc, s, second } = twoExits();
    const h = second.y1 - second.y0;
    // (each molecule's reach such that the first set grows over the second's top, by less than the second is tall and kept clear by)
    for (let r = 0.2; r < 3; r += 0.05) {
      const W: RunWith = { extentOf: () => ({ x0: -r, x1: r, y0: -r, y1: r }), byOf: () => "meno", now: 1 };
      const ran = placeResults(doc, s, { molecules: [water(0)], rest: [], holds: "molecules" } as unknown as RunResults, W);
      const [one, two] = [resultOf(ran, s.id)!, resultOf(ran, s.id, "failed")!];
      const over = second.y1 - (one.y0 - BETWEEN);
      if (over <= 0 || over >= h + BETWEEN) continue;
      expect(two.y1).toBeCloseTo(one.y0 - BETWEEN, 9);
      return;
    }
    throw new Error("no reach grew the first set over the second's top by less than its height");
  });

  it("is kept clear of what lies across it - its own, not the first port's: a short bond across the first port's line to where the second exit's set stands leaves it there, run again or made", () => {
    const { doc: base, s, card, first, second } = twoExits();
    const to = frameOf(second);
    const bond = bondAcross(s, card, frameOf(first), to);
    // (run again: where it was, its own line clear)
    const doc = appendModel(base, bond);
    expect(placeAgain(doc, s, second, to.x1 - to.x0, to.y1 - to.y0)).toEqual(to);
    // (made, the bond there before its step: both its exits' sets where they would be without it)
    const fresh = twoExits(appendModel(emptyWorkspaceDocument(), bond));
    expect([frameOf(fresh.first), frameOf(fresh.second)]).toEqual([frameOf(first), to]);
  });

  it("is kept clear for a set not made yet from the exit it is placed for: placed for the second exit, a bond across the first port's line to where it goes leaves it there", () => {
    const { doc: made, s, card, first, second } = twoExits();
    // (the second exit's set not made: placed for it, as a run's result is where its step was read without it)
    const doc = { ...made, sets: made.sets!.filter((b) => b.id !== second.id) };
    const [w, h] = [second.x1 - second.x0, second.y1 - second.y0];
    const to = placeFor(doc, s, "failed", w, h);
    const bond = bondAcross(s, card, frameOf(first), to);
    expect(placeFor(appendModel(doc, bond), s, "failed", w, h)).toEqual(to);
  });
});
