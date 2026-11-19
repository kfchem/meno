/**
 * A step's result set grown as it runs again, where another step's frame not run yet stands in its way below it (workflow/place
 * `roomMadeFor`; docs/WORKFLOWS.md, *Where a result set goes*): the frame not run yet is pushed down just clear, and the grown set keeps
 * its place by its step. A set that holds results is never moved: the grown set goes lower, as before.
 */
import { describe, expect, it } from "vitest";
import { emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { DrawnModel, WorkflowSet } from "../store/types";
import type { Frame } from "./entries";
import { CARD_H } from "./look";
import { addStep } from "./model";
import { placeResults, type RunResults, type RunWith } from "./run";
import { roomMadeFor } from "./place";

const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };
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
const overlap = (a: Frame, b: Frame) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Two steps, one above the other, each with its exit's frame to its right; the upper run once, small. */
function page(): { doc: WorkspaceDocument; upper: number; lower: number } {
  let doc = addStep(emptyWorkspaceDocument(), "descriptors", 0, 0);
  doc = addStep(doc, "descriptors", 0, -3 * CARD_H);
  const [upper, lower] = doc.steps!.map((s) => s.id);
  doc = placeResults(doc, doc.steps![0], drawn(1), W);
  return { doc, upper, lower };
}
const setOf = (doc: WorkspaceDocument, step: number): WorkflowSet => doc.sets!.find((b) => b.made?.step === step)!;

describe("a result set grown as its step runs again, a frame not run yet below it", () => {
  it("keeps its place by its step, the frame not run yet pushed down just clear of it, still not run", () => {
    const { doc, upper, lower } = page();
    const was = setOf(doc, upper);
    const grown = placeResults(doc, doc.steps![0], drawn(19), W);
    const now = setOf(grown, upper);
    expect([now.x0, now.y1]).toEqual([was.x0, was.y1]);
    expect(now.y0).toBeLessThan(was.y0);
    const pushed = setOf(grown, lower);
    expect(pushed.made?.holds).toBeUndefined();
    expect(pushed.y1).toBeLessThan(setOf(doc, lower).y1);
    expect(overlap(now, pushed)).toBe(false);
  });

  it("goes lower, as before, where the set in its way holds results: that set never moved", () => {
    const first = page();
    const { upper, lower } = first;
    const doc = placeResults(first.doc, first.doc.steps![1], drawn(1), W);
    const stays = setOf(doc, lower);
    const was = setOf(doc, upper);
    const grown = placeResults(doc, doc.steps![0], drawn(19), W);
    expect(setOf(grown, lower)).toMatchObject({ x0: stays.x0, x1: stays.x1, y0: stays.y0, y1: stays.y1 });
    expect(setOf(grown, upper).y1).not.toBe(was.y1);
    expect(overlap(setOf(grown, upper), setOf(grown, lower))).toBe(false);
  });
});

describe("every frame of both steps, a result set grown as its step runs again", () => {
  /** Every two frames on the page that overlap, by step and exit. */
  const overlaps = (doc: WorkspaceDocument) => {
    const s = doc.sets ?? [];
    const hits: string[] = [];
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) if (overlap(s[i], s[j])) hits.push(`${s[i].made?.step}/${s[i].made?.exit} x ${s[j].made?.step}/${s[j].made?.exit}`);
    return hits;
  };

  it("overlaps no other: the grown step's later exit, kept under it, is never put where the other's was pushed (found in review)", () => {
    const { doc } = page();
    expect(overlaps(doc)).toEqual([]);
    expect(overlaps(placeResults(doc, doc.steps![0], drawn(19), W))).toEqual([]);
  });

  it("overlaps no other after a small growth too, its own place clear but its later exit's not (found in review)", () => {
    const { doc } = page();
    expect(overlaps(placeResults(doc, doc.steps![0], drawn(5), W))).toEqual([]);
  });
});

describe("room made for a grown set (roomMadeFor), one frame in its way and nothing else", () => {
  /**
   * A Tag run once, its set emptied as a run empties it before placing again (a set's own drawn structures are what its frame would be
   * clear of), grown to `grow` tall where it is; a frame B below it, made as `made` says, in the way of the growth; and, where `card`,
   * another step's card in the way too.
   */
  function room(made: Partial<WorkflowSet>, grow = 40, card = false) {
    let doc = addStep(emptyWorkspaceDocument(), "tag", 0, 0);
    doc = placeResults(doc, doc.steps![0], drawn(1), W);
    doc = { ...doc, model: { atoms: [], bonds: [] }, sets: doc.sets!.map((x) => ({ ...x, members: [] })) };
    const was = setOf(doc, doc.steps![0].id);
    const B = { id: 900, x0: was.x0, x1: was.x1, y0: was.y0 - 8, y1: was.y0 - 4, made: { step: 999, exit: "out" }, ...made } as WorkflowSet;
    doc = { ...doc, sets: [...doc.sets!, B] };
    if (card) doc = addStep(doc, "tag", was.x0 + 1, was.y0 - 12);
    return { doc, out: roomMadeFor(doc, doc.steps![0], was, was.x1 - was.x0, grow) };
  }
  const b = (doc: WorkspaceDocument) => doc.sets!.find((x) => x.id === 900)!;

  it("pushes a frame not run yet down below the grown set; leaves the page as it was where nothing is in the way", () => {
    const { doc, out } = room({});
    expect(b(out).y1).toBeLessThan(b(doc).y1);
    expect(b(out).y1).toBeLessThan(setOf(doc, doc.steps![0].id).y1 - 40);
    const clear = room({}, 1);
    expect(clear.out).toBe(clear.doc);
  });

  it("never moves a set that holds results, nor one not kept: the page as it was", () => {
    for (const made of [{ made: { step: 999, exit: "out", holds: "structures" } }, { notKept: { count: 3 } }] as Partial<WorkflowSet>[]) {
      const { doc, out } = room(made);
      expect(out).toBe(doc);
    }
  });

  it("keeps nothing it pushed where the grown set's place is not cleared by it - a card in the way too", () => {
    const { doc, out } = room({}, 40, true);
    expect(out).toBe(doc);
  });
});
