import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createWorkspaceDocument, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Molecule3D } from "../store/types";
import { cardLines } from "../pageGl/cardFace";
import { resultOf } from "./flow";
import { ONE_INPUT } from "./kinds";
import { BETWEEN, CARD_H, CARD_TALL, CARD_W, GAP, PX, portDown } from "./look";
import { addSet, addStep, addStepFrom, connect, moveStep, openedSet } from "./model";
import { heldSets, setsOnPage, unseenSets } from "./onPage";
import { clearOf, exitStart, frameAt, placeBelow, placeCard } from "./place";
import { placeResults, type RunResults, type RunWith } from "./run";

const extentOf: RunWith["extentOf"] = () => ({ x0: -2, x1: 2, y0: -2, y1: 2 });
const W: RunWith = { extentOf, byOf: () => "meno", now: 1 };
const water = (dx: number): Omit<Molecule3D, "id" | "at"> =>
  ({ atoms: [{ el: "O", x: dx, y: 0, z: 0 }, { el: "H", x: dx + 0.96, y: 0, z: 0 }, { el: "H", x: dx - 0.24, y: 0.93, z: 0 }], bonds: [{ a1: 0, a2: 1, order: 1 }, { a1: 0, a2: 2, order: 1 }] }) as never;
/** What a step gave: molecules kept, and those it set aside. */
const gave = (kept: number, aside: number): RunResults =>
  ({ molecules: Array.from({ length: kept }, (_, i) => water(3 * i)), rest: Array.from({ length: aside }, (_, i) => water(3 * i)), holds: "molecules" }) as unknown as RunResults;

/** An Optimise (step 1) not run yet: its sets 2, Optimised, and 3, Failed. */
function optimise(): WorkspaceDocument {
  const doc = addStep(emptyWorkspaceDocument(), "optimise", 0, 0, {}, "some-program");
  expect([resultOf(doc, 1)!.id, resultOf(doc, 1, "failed")!.id]).toEqual([2, 3]);
  return doc;
}
const setOf = (doc: WorkspaceDocument, id: number) => doc.sets!.find((b) => b.id === id)!;
/** The last step added. */
const lastStep = (doc: WorkspaceDocument) => doc.steps![doc.steps!.length - 1];

describe("an exit for what a step sets aside (docs/WORKFLOWS.md, *Exits that set aside*)", () => {
  it("holding nothing and wired on to none, is drawn nowhere - its port alone; the first exit's empty set is shown, Not run yet", () => {
    const doc = optimise();
    expect([...unseenSets(doc)]).toEqual([3]);
    expect(setsOnPage(doc, doc.sets!).map((b) => b.id)).toEqual([2]);
    // (its own exits, not a step's later ones: an Atom map's Bond changes, a table, is shown as it is, its Not mapped not)
    const map = addStep(emptyWorkspaceDocument(), "atom-map", 0, 0);
    expect([...unseenSets(map)]).toEqual([resultOf(map, 1, "rest")!.id]);
    expect(setsOnPage(map, map.sets!).map((b) => b.made!.exit)).toEqual(["out", "changes"]);
  });

  it("is laid out once given anything - under the first, clear of it - and drawn nowhere again once given nothing", () => {
    const step = optimise().steps![0];
    const ran = placeResults(optimise(), step, gave(1, 2), W);
    expect(unseenSets(ran).size).toBe(0);
    const [out, failed] = [setOf(ran, 2), setOf(ran, 3)];
    expect(failed.members).toHaveLength(2);
    expect(failed.y1).toBeLessThanOrEqual(out.y0 - BETWEEN + 1e-9);
    const again = placeResults(ran, step, gave(1, 0), W);
    expect([...unseenSets(again)]).toEqual([3]);
  });

  it.each([
    // (a large set's structures, kept with no members of its own: its molecules, or its drawings - run `drawnPut`)
    ["molecules held in it", { collection: [water(0)] }],
    ["drawings held in it", { drawnCollection: [{ atoms: [], bonds: [] }] }],
    ["a table", { table: { columns: [], rows: [] } }],
    ["a number", { number: { value: 0 } }],
    ["a chart", { chart: { kind: "bars" } }],
    ["none read", { unread: 2 }],
    ["none not kept", { notKept: { count: 4, hash: "x" } }],
    // (an older file's, its members to be looked for in its frame)
    ["its members not known", { members: undefined }],
  ])("is shown where it has anything to say: %s", (_, patch) => {
    const doc = optimise();
    const said = (p: object) => ({ ...doc, sets: doc.sets!.map((b) => (b.id === 3 ? { ...b, ...p } : b)) });
    expect([...unseenSets(said({}))]).toEqual([3]);
    expect(unseenSets(said(patch)).size).toBe(0);
  });

  it("wired on, is held off the page; wired and opened, is shown though it holds nothing", () => {
    let doc = addStep(optimise(), "energy", 600, 0, {}, "some-program");
    doc = connect(doc, { set: 3 }, lastStep(doc).id);
    expect([heldSets(doc).has(3), unseenSets(doc).has(3)]).toEqual([true, true]);
    const opened = openedSet(doc, 3, true);
    expect([heldSets(opened).has(3), unseenSets(opened).has(3)]).toEqual([false, false]);
  });

  it("lies nowhere: placing keeps clear of it no more than of empty space", () => {
    const doc = optimise();
    const failed = setOf(doc, 3);
    const where = frameAt(failed.x0, failed.y1, failed.x1 - failed.x0, failed.y1 - failed.y0);
    expect(clearOf(doc, where)).toBe(true);
    // (shown, it is in the way)
    expect(clearOf({ ...doc, sets: doc.sets!.map((b) => (b.id === 3 ? { ...b, unread: 1 } : b)) }, where)).toBe(false);
  });

  it("is drawn by the page by that rule: its frame, its line from the port and its place among the sets, as placing has them", () => {
    // (the page is WebGL: read as written)
    const src = readFileSync(join(__dirname, "../components/Workflow2D.tsx"), "utf8");
    expect(src).toMatch(/const unseen = useMemo\(\(\) => unseenSets\(\{ sets, wires, steps \}\), \[sets, wires, steps\]\);/);
    expect(src).toMatch(/const onPage = useMemo\(\(\) => \(unseen\.size \? sets\.filter\(\(b\) => !unseen\.has\(b\.id\)\) : sets\), \[sets, unseen\]\);/);
    // (given nothing again: folding into its port as a held set does, not fading - its words and its frame alike)
    expect(src).toMatch(/const fold = set\?\.made && unseen\.has\(set\.id\) \? foldAbout\(set\) : undefined;/);
    expect(src).toMatch(/const p = b\?\.made && \(leaving \? unseen\.has\(b\.id\) : growing\(b\.id\)\) \? exitGives\(b\) : null;/);
  });

  it("is the same answer, the same object, while only the cards move - so what is drawn of the sets is not worked out again", () => {
    const doc = optimise();
    const was = unseenSets(doc);
    expect(unseenSets(moveStep(doc, 1, 40, 40))).toBe(was);
    // (worked out again as the steps change, though the sets and wires do not: what sets aside is by its step's kind)
    expect(unseenSets({ ...doc, steps: doc.steps!.map((s) => ({ ...s, kind: "number" as const })) }).size).toBe(0);
    expect(unseenSets(addStep(doc, "energy", 600, 0, {}, "some-program"))).not.toBe(was);
  });
});

describe("a step added from an exit's port (docs/WORKFLOWS.md, *A step added from an exit*)", () => {
  /** A Filter (step 1) not run yet: its sets 2, kept, and 3, the rest. */
  const filter = () => addStep(emptyWorkspaceDocument(), "filter", 0, 0);

  it("goes close by: GAP right of the card, its input level with the exit's port, wired - wherever the wire was let go", () => {
    const doc = filter();
    const added = addStepFrom(doc, "energy", { set: 2 }, 900, -700, {}, "some-program");
    const s = lastStep(added);
    expect([s.kind, s.x, s.y]).toEqual(["energy", CARD_W + GAP, exitStart(doc.steps![0], "out").y + portDown(0)]);
    expect(added.wires!.map((w) => [w.from, w.to])).toEqual([[{ set: 2 }, { step: s.id, port: ONE_INPUT }]]);
    // (the frame it comes from, Not run yet, where the card now stands, is no hindrance: wired on, it is held off the page)
    expect(heldSets(added).has(2)).toBe(true);
  });

  it("from a later exit, level with that port where it can be - where it cannot, plainly beneath the card it comes from, clear of what is there", () => {
    const doc = filter();
    const added = addStepFrom(doc, "energy", { set: 3 }, 900, -700, {}, "some-program");
    const s = lastStep(added);
    const kept = setOf(doc, 2);
    expect(s.x).toBe(CARD_W + GAP);
    // (the kept set's frame, shown and not run yet, stands where the card would be level with the rest's port)
    expect(exitStart(doc.steps![0], "rest").y + portDown(0)).toBeGreaterThan(kept.y0 - BETWEEN);
    expect(s.y).toBeLessThanOrEqual(kept.y0 - BETWEEN + 1e-9);
    // (a step down, not a row out of line: its top the page's room under the card it comes from, drawn as tall as it can be)
    expect(s.y).toBeLessThanOrEqual(doc.steps![0].y - CARD_TALL - BETWEEN + 1e-9);
    // (clear of all that was there but the set its wire comes from)
    expect(clearOf(doc, frameAt(s.x, s.y, CARD_W, CARD_H), { set: 3 })).toBe(true);
    expect(added.wires!.map((w) => w.from)).toEqual([{ set: 3 }]);
  });

  it("into a later input, level with that input: a table of bond changes into Measure's Atoms", () => {
    // (its Mapped set's frame, shown and not run yet, left out: it stands where the card goes, and would send it lower)
    const made = addStep(emptyWorkspaceDocument(), "atom-map", 0, 0);
    const map = { ...made, sets: made.sets!.filter((b) => b.made!.exit !== "out") };
    const changes = resultOf(map, 1, "changes")!.id;
    const added = addStepFrom(map, "measure", { set: changes }, 900, -700);
    const s = lastStep(added);
    expect(added.wires!.map((w) => w.to.port)).toEqual(["atoms"]);
    expect([s.x, s.y]).toEqual([CARD_W + GAP, exitStart(map.steps![0], "changes").y + portDown(1)]);
  });

  it("keeps clear of the frame it comes from where the chemist opened it", () => {
    let doc = filter();
    doc = openedSet(connect(addStep(doc, "energy", 900, 0, {}, "some-program"), { set: 2 }, 4), 2, true);
    const added = addStepFrom(doc, "energy", { set: 2 }, 900, -700, {}, "some-program");
    expect(lastStep(added).y).toBeLessThanOrEqual(setOf(doc, 2).y0 - BETWEEN + 1e-9);
  });

  it("from a set the chemist made, goes where the wire was let go; where no input of it takes what the wire gives, there too, unwired", () => {
    const doc = addSet(filter(), { x0: -300, y0: -40, x1: -200, y1: 0 });
    const chemist = doc.sets![doc.sets!.length - 1].id;
    const added = addStepFrom(doc, "energy", { set: chemist }, 900, -700, {}, "some-program");
    expect([lastStep(added).x, lastStep(added).y]).toEqual(Object.values(placeCard(doc, 900, -700)));
    expect(added.wires!.map((w) => w.from)).toEqual([{ set: chemist }]);
    const none = addStepFrom(doc, "generate", { set: 2 }, 900, -700);
    expect([lastStep(none).x, lastStep(none).y, none.wires ?? []]).toEqual([...Object.values(placeCard(doc, 900, -700)), []]);
  });

  it("is as tall as its words can draw a card closed - so is every card placing keeps clear of - not as tall as its ports reach (look `CARD_TALL`)", () => {
    // (a set put a little below the level spot - clear of a card CARD_H tall there, not of one as tall as its words can draw it)
    const below = -(CARD_H + BETWEEN + 10 * PX);
    const doc = addSet(filter(), { x0: CARD_W + GAP, y0: below - CARD_H, x1: 2 * CARD_W + GAP, y1: below });
    const s = lastStep(addStepFrom(doc, "energy", { set: 2 }, 900, -700, {}, "some-program"));
    expect(s.y).toBeLessThan(exitStart(doc.steps![0], "out").y + portDown(0));
    // (a frame put under a card, and a card put down there: below as much of it as its words can draw)
    const plain = filter();
    expect(placeBelow(plain, 0, 0, CARD_W, CARD_H).y1).toBeLessThanOrEqual(-CARD_TALL - BETWEEN + 1e-9);
    expect(placeCard(plain, 0, 0).y).toBeLessThanOrEqual(-CARD_TALL - BETWEEN + 1e-9);
    // (as tall as the tallest card is drawn closed - pageGl/cardFace: its words cut at two lines each, a line said, a bar)
    const long = "words long enough to run past two lines of a card, and on past them, and on past them again";
    expect(CARD_TALL / PX).toBe(cardLines({ summary: long, state: { text: long, tone: "quiet" }, said: "x", progress: 0 }).height);
    // (a card put down above a set it would reach, drawn as tall as its words can draw it: lower)
    const under = addSet(emptyWorkspaceDocument(), { x0: 0, y0: below - CARD_H, x1: CARD_W, y1: below });
    expect(placeCard(under, 0, 0).y).toBeLessThan(0);
  });

  it("is one step of the history, the step and its wire undone together", () => {
    const d = createWorkspaceDocument(undefined, undefined, undefined, () => extentOf);
    d.reset(filter());
    const store = createEditorStore(d);
    connectStoreToDocument(store, d);
    const id = store.getState().addStep("energy", "some-program", 900, -700, { set: 2 });
    expect([d.getState().steps!.map((s) => s.id), d.getState().wires!.map((w) => w.to.step)]).toEqual([[1, id], [id]]);
    d.undo();
    expect([d.getState().steps!.map((s) => s.id), d.getState().wires ?? []]).toEqual([[1], []]);
  });
});
