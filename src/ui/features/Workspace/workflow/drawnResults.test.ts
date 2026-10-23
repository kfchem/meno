import { describe, expect, it } from "vitest";
import { emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { DrawnModel, DrawnRecord, Model, WorkflowSet } from "../store/types";
import { BEFORE_THE_EDIT, countOf, countSaid, heldOwn, drawnHash, holdsOf, numberedRecord, readDrawnRecord, recordNumber, setMembers } from "./entries";
import { canWire, givesOf, inputKey, inputOf, resultOf, stateOf } from "./flow";
import { runMenoDrawn } from "./meno";
import { addSet, addStep, connect, membersSettled, removeStep } from "./model";
import { drawnEntries, inputEntries, keepRun, placeResults, resultsNow, runStep, showRun, type RunResults, type RunWith } from "./run";
import { DRAWN_ON_PAGE, PX } from "./look";
import { boxOf } from "../chem/make3d";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { readWorkflow } from "./saved";
import { noting } from "../utils/readNotes";
import { appendParts, carriedRenumbered, partsOf } from "./parts";

const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };

/**
 * Structures drawn as a step might give them, each in its own numbering
 * from 1 - as Enumerate's products all are, in their template's - and
 * where it was drawn: (R)-CHFClBr, a wedge from C to F; and chloroethane.
 */
const chiral = (): Model => ({
  atoms: [
    { id: 1, el: "C", x: 0, y: 0 },
    { id: 2, el: "F", x: 0, y: 1.8 },
    { id: 3, el: "Cl", x: 1.56, y: -0.9 },
    { id: 4, el: "Br", x: -1.56, y: -0.9 },
  ] as never,
  bonds: [
    { id: 1, a: 1, b: 2, order: 1, stereo: "up" },
    { id: 2, a: 1, b: 3, order: 1 },
    { id: 3, a: 1, b: 4, order: 1 },
  ] as never,
});
const chloroethane = (): Model => ({
  atoms: [
    { id: 1, el: "C", x: 40, y: 40 },
    { id: 2, el: "C", x: 41.56, y: 40.9 },
    { id: 3, el: "Cl", x: 43.12, y: 40 },
  ] as never,
  bonds: [
    { id: 1, a: 1, b: 2, order: 1 },
    { id: 2, a: 2, b: 3, order: 1 },
  ] as never,
});

const drawn = (made: DrawnModel[], rest: DrawnModel[] = []): RunResults => ({ molecules: [], rest: [], holds: "structures", drawn: { made, rest } });

/** A page with a step that sets entries aside (Duplicates), at (5, 0), its exits not run yet - and a structure of the chemist's, drawn above it, that is none of its. */
function page(): WorkspaceDocument {
  const doc: WorkspaceDocument = {
    ...emptyWorkspaceDocument(),
    model: { atoms: [{ id: 1, el: "O", x: 5, y: 30 }, { id: 2, el: "O", x: 6.2, y: 30 }] as never, bonds: [{ id: 3, a: 1, b: 2, order: 2 }] as never },
    nextId: 4,
  };
  return addStep(doc, "duplicates", 5, 0);
}

/**
 * A structure as it is drawn, whatever its atoms' order or where on the page:
 * each atom's element and place from the structure's lower left corner, and
 * each bond between two of those, with its order and wedge - each list sorted.
 */
function shapeOf(m: Model) {
  const x0 = Math.min(...m.atoms.map((a) => a.x));
  const y0 = Math.min(...m.atoms.map((a) => a.y));
  const name = new Map(m.atoms.map((a) => [a.id, `${a.el}@${(a.x - x0).toFixed(4)},${(a.y - y0).toFixed(4)}`]));
  return {
    atoms: [...name.values()].sort(),
    bonds: m.bonds.map((b) => `${name.get(b.a)}-${name.get(b.b)}:${b.order}${b.stereo ? `:${b.stereo}` : ""}`).sort(),
  };
}

/** Each structure a set holds, in the set's order, as it is drawn (`shapeOf`). */
function shapes(doc: WorkspaceDocument, set: number) {
  const b = doc.sets!.find((s) => s.id === set)!;
  return setMembers(doc, b).structures.map((ids) => {
    const of = new Set(ids);
    return shapeOf({ atoms: doc.model.atoms.filter((a) => of.has(a.id)), bonds: doc.model.bonds.filter((x) => of.has(x.a)) });
  });
}

describe("structures drawn, given by a step", () => {
  it("are its exits' sets' structures, each as given - moved whole, its wedge with it - in the step's order, apart though they share one numbering", () => {
    const doc = placeResults(page(), page().steps![0], drawn([chiral(), chloroethane(), chiral()], [chloroethane()]), W);
    const step = doc.steps![0];
    const out = resultOf(doc, step.id, "out")!;
    const rest = resultOf(doc, step.id, "rest")!;
    expect(out.made).toEqual({ step: step.id, exit: "out", holds: "structures" });
    expect(rest.made).toEqual({ step: step.id, exit: "rest", holds: "structures" });
    // (three structures, not one: the two in one numbering are two)
    expect(shapes(doc, out.id)).toEqual([shapeOf(chiral()), shapeOf(chloroethane()), shapeOf(chiral())]);
    expect(shapes(doc, rest.id)).toEqual([shapeOf(chloroethane())]);
    expect(countOf(doc, out)).toEqual({ holds: "structures", entries: 3, compounds: 3 });
    // (the page's: the chemist's structure, and the four given, 4 + 3 + 4 + 3 atoms, every id its own)
    expect(doc.model.atoms).toHaveLength(2 + 14);
    expect(new Set(doc.model.atoms.map((a) => a.id)).size).toBe(16);
    expect(new Set(doc.model.bonds.map((b) => b.id)).size).toBe(doc.model.bonds.length);
    // (each inside its set, to the right of the step)
    for (const set of [out, rest]) {
      for (const ids of setMembers(doc, set).structures) {
        for (const id of ids) {
          const a = doc.model.atoms.find((x) => x.id === id)!;
          expect(a.x > set.x0 && a.x < set.x1 && a.y > set.y0 && a.y < set.y1).toBe(true);
        }
      }
    }
    expect(out.x0).toBeGreaterThan(step.x);
  });

  it("go on along a wire as structures drawn: what a step that takes them is given, as they are drawn", () => {
    let doc = placeResults(page(), page().steps![0], drawn([chiral(), chloroethane()]), W);
    const out = { set: resultOf(doc, doc.steps![0].id, "out")!.id };
    expect(holdsOf(doc, doc.sets!.find((b) => b.id === out.set)!)).toBe("structures");
    expect(givesOf(doc, out)).toBe("structures");
    doc = addStep(doc, "conformers", 40, 0);
    const search = doc.steps![1].id;
    expect(canWire(doc, out, search)).toBe(true);
    doc = connect(doc, out, search);
    const input = inputOf(doc, search)!;
    expect(input.holds).toBe("structures");
    const entries = drawnEntries(doc.model, input.structures);
    expect(entries.map((e) => e.place)).toEqual([0, 1]);
    expect(entries.map((e) => shapeOf(e.drawn))).toEqual([shapeOf(chiral()), shapeOf(chloroethane())]);
    // (a step that takes molecules in 3D alone is not wired them)
    doc = addStep(doc, "energy-window", 40, 20);
    expect(canWire(doc, out, doc.steps![2].id)).toBe(false);
  });

  it("run again, take the place of what the exit held - nothing left of it on the page, the chemist's own untouched", () => {
    let doc = placeResults(page(), page().steps![0], drawn([chiral(), chloroethane(), chiral()], [chloroethane()]), W);
    const step = doc.steps![0];
    const before = resultOf(doc, step.id, "out")!;
    doc = placeResults(doc, step, drawn([chloroethane()]), W);
    const out = resultOf(doc, step.id, "out")!;
    // (the same set, its top left where it was)
    expect(out.id).toBe(before.id);
    expect([out.x0, out.y1]).toEqual([before.x0, before.y1]);
    expect(shapes(doc, out.id)).toEqual([shapeOf(chloroethane())]);
    // (its second exit given none: empty, saying so)
    expect(setMembers(doc, resultOf(doc, step.id, "rest")!).structures).toEqual([]);
    expect(doc.model.atoms.map((a) => a.el)).toEqual(["O", "O", "C", "C", "Cl"]);
    expect(doc.model.bonds).toHaveLength(1 + 2);
  });

  it("run again, leave a structure the chemist dropped into the set: it is none of the set's, and stays where it was", () => {
    const first = placeResults(page(), page().steps![0], drawn([chiral()]), W);
    const out = resultOf(first, first.steps![0].id, "out")!;
    // (an N2 of the chemist's, drawn and put inside the frame by hand)
    const mine = { atoms: [{ id: 900, el: "N", x: out.x0 + 0.5, y: out.y0 + 0.5 }, { id: 901, el: "N", x: out.x0 + 1.6, y: out.y0 + 0.5 }] as never[], bonds: [{ id: 902, a: 900, b: 901, order: 3 }] as never[] };
    const dropped = membersSettled({ ...first, model: { atoms: [...first.model.atoms, ...mine.atoms], bonds: [...first.model.bonds, ...mine.bonds] }, nextId: 903 }, first);
    expect(shapes(dropped, out.id)).toEqual([shapeOf(chiral())]);
    const again = placeResults(dropped, dropped.steps![0], drawn([chloroethane()]), W);
    expect(again.model.atoms.filter((a) => a.id === 900 || a.id === 901).map((a) => [a.el, a.x, a.y])).toEqual([
      ["N", out.x0 + 0.5, out.y0 + 0.5],
      ["N", out.x0 + 1.6, out.y0 + 0.5],
    ]);
    expect(again.model.bonds.some((b) => b.id === 902)).toBe(true);
  });

  it("run again, take away only the atoms the step put there: a structure the chemist joined to one by a bond keeps its own atoms", () => {
    const first = placeResults(page(), page().steps![0], drawn([chiral()]), W);
    const out = resultOf(first, first.steps![0].id, "out")!;
    expect(out.put).toHaveLength(4);
    // (a methyl of the chemist's, bonded to the step's bromine: one structure with it now, and so a member)
    const br = first.model.atoms.find((a) => a.el === "Br" && out.put!.includes(a.id))!;
    const joined = membersSettled(
      { ...first, model: { atoms: [...first.model.atoms, { id: 900, el: "C", x: br.x - 1.5, y: br.y, r: 0.9 } as never], bonds: [...first.model.bonds, { id: 901, a: br.id, b: 900, order: 1 } as never] }, nextId: 902 },
      first,
    );
    expect(setMembers(joined, resultOf(joined, joined.steps![0].id, "out")!).structures[0]).toContain(900);
    const again = placeResults(joined, joined.steps![0], drawn([chloroethane()]), W);
    // (the chemist's carbon stays, its bond to the bromine gone with the bromine; every atom the step put is gone)
    expect(again.model.atoms.find((a) => a.id === 900)?.el).toBe("C");
    expect(again.model.bonds.some((b) => b.id === 901)).toBe(false);
    expect(again.model.atoms.some((a) => out.put!.includes(a.id))).toBe(false);
    expect(resultOf(again, again.steps![0].id, "out")!.put).toHaveLength(3);
  });

  it("say, in a file, which atoms their step put there - each by id, as members are", () => {
    const doc = placeResults(page(), page().steps![0], drawn([chiral()]), W);
    const saved = readWorkflow(JSON.parse(JSON.stringify({ sets: doc.sets, steps: doc.steps, wires: doc.wires })))!;
    const out = resultOf(doc, doc.steps![0].id, "out")!;
    expect(saved.sets.find((b) => b.id === out.id)!.put).toEqual(out.put);
    // (a chemist's set says none, and none is read for one)
    expect(readWorkflow({ sets: [{ id: 1, x0: 0, y0: 0, x1: 2, y1: 2, put: [3, 4] }] })!.sets[0].put).toBeUndefined();
  });

  it("are kept with the run that gave them, as they stand then, and shown again as they were", () => {
    let doc = placeResults(page(), page().steps![0], drawn([chiral()], [chloroethane()]), W);
    doc = { ...doc, steps: doc.steps!.map((s) => ({ ...s, ran: { at: 1, ok: true, said: "first", input: "k", kind: s.kind } })) };
    const step = () => doc.steps![0];
    const now = resultsNow(doc, step())!;
    expect(now.holds).toBe("structures");
    expect(now.drawn!.made.map(shapeOf)).toEqual([shapeOf(chiral())]);
    expect(now.drawn!.rest.map(shapeOf)).toEqual([shapeOf(chloroethane())]);
    // (a second run, the first kept among its runs)
    doc = keepRun(doc, step());
    doc = placeResults(doc, step(), drawn([chloroethane(), chloroethane()]), W);
    doc = { ...doc, steps: doc.steps!.map((s) => ({ ...s, ran: { at: 2, ok: true, said: "second", input: "k", kind: s.kind } })) };
    expect(step().runs![0].results!.drawn!.made.map(shapeOf)).toEqual([shapeOf(chiral())]);
    // (the first shown again: its structures back in its exits' sets, the second kept in its place)
    doc = showRun(doc, step().id, 0, W);
    expect(step().ran!.said).toBe("first");
    expect(shapes(doc, resultOf(doc, step().id, "out")!.id)).toEqual([shapeOf(chiral())]);
    expect(shapes(doc, resultOf(doc, step().id, "rest")!.id)).toEqual([shapeOf(chloroethane())]);
    expect(step().runs![0].results!.drawn!.made.map(shapeOf)).toEqual([shapeOf(chloroethane()), shapeOf(chloroethane())]);
    expect(doc.model.atoms).toHaveLength(2 + 4 + 3);
  });

  it("are read back from a file with the run that gave them - a structure that does not read left out and counted, as a molecule is", () => {
    const saved = readWorkflow({
      steps: [
        {
          id: 1,
          kind: "duplicates",
          x: 0,
          y: 0,
          runs: [{ at: 5, ok: true, said: "2 of 3 kept", input: "k", kind: "duplicates", results: { molecules: [], rest: [], holds: "structures", drawn: { made: [chiral(), { atoms: "no" }], rest: [chloroethane()] } } }],
        },
      ],
    })!;
    const results = saved.steps[0].runs![0].results!;
    expect(results.holds).toBe("structures");
    expect(results.drawn!.made.map(shapeOf)).toEqual([shapeOf(chiral())]);
    expect(results.drawn!.rest.map(shapeOf)).toEqual([shapeOf(chloroethane())]);
    // (never left out unsaid: how many of the first exit's did not read)
    expect(results.unread).toBe(1);
    expect(results.restUnread).toBeUndefined();
  });
});

describe("a large set of structures drawn, given by a step", () => {
  /** `n` structures as a step might number them: each a chloroethane, said to be the `k`th made. */
  const many = (n: number, from = 1) => Array.from({ length: n }, (_, k) => ({ ...chloroethane(), record: numberedRecord(from + k, `R1 = ${from + k}`) }));
  /** A long chain drawn - an icosane - said to be the `k`th made: much more of the page than a chloroethane. */
  const long = (k: number): DrawnModel => ({
    atoms: Array.from({ length: 20 }, (_, i) => ({ id: i + 1, el: "C", x: i * 1.56, y: i % 2 ? 0.9 : 0 })) as never,
    bonds: Array.from({ length: 19 }, (_, i) => ({ id: i + 1, a: i + 1, b: i + 2, order: 1 })) as never,
    record: numberedRecord(k, `R1 = ${k}`),
  });
  /** A set's structures by their numbers, in the order it gives them on: those on the page, then those it holds. */
  const numbers = (doc: WorkspaceDocument, b: WorkflowSet) => [...setMembers(doc, b).records, ...(b.drawnCollection ?? []).map((m) => m.record)].map((r) => recordNumber(r));
  const upTo = (n: number) => Array.from({ length: n }, (_, k) => k + 1);

  it("of more than the page shows: as many on it as take no more of it than DRAWN_ON_PAGE allows, in the step's order, the rest held in the set after them - all of them the set's, counted", () => {
    const doc = placeResults(page(), page().steps![0], drawn(many(DRAWN_ON_PAGE.most + 1), many(2)), W);
    const out = resultOf(doc, doc.steps![0].id, "out")!;
    // (small ones: as many as the count allows on the page, the one after them held)
    expect(shapes(doc, out.id)).toHaveLength(DRAWN_ON_PAGE.most);
    expect(out.drawnCollection!.map((m) => recordNumber(m.record))).toEqual([DRAWN_ON_PAGE.most + 1]);
    expect(numbers(doc, out)).toEqual(upTo(DRAWN_ON_PAGE.most + 1));
    expect(countOf(doc, out)).toEqual({ holds: "structures", entries: DRAWN_ON_PAGE.most + 1, compounds: DRAWN_ON_PAGE.most + 1 });
    // (and its frame says so: how many it shows of how many)
    expect(countSaid(out, countOf(doc, out))).toBe(`${DRAWN_ON_PAGE.most} of ${DRAWN_ON_PAGE.most + 1} structures shown`);
    // (as many as it shows, on the page as before: none held)
    const fifty = placeResults(page(), page().steps![0], drawn(many(DRAWN_ON_PAGE.most)), W);
    const all = resultOf(fifty, fifty.steps![0].id, "out")!;
    expect(all.drawnCollection).toBeUndefined();
    expect(countSaid(all, countOf(fifty, all))).toBe(`${DRAWN_ON_PAGE.most} structures`);
    expect(shapes(fifty, resultOf(fifty, fifty.steps![0].id, "out")!.id)).toHaveLength(DRAWN_ON_PAGE.most);
  });

  it("show fewer large structures than small ones - by the room they take - one at least, the rest held, none lost", () => {
    const doc = placeResults(page(), page().steps![0], drawn(Array.from({ length: 40 }, (_, k) => long(k + 1))), W);
    const out = resultOf(doc, doc.steps![0].id, "out")!;
    const shown = shapes(doc, out.id).length;
    expect(shown).toBeGreaterThanOrEqual(1);
    expect(shown).toBeLessThan(40);
    expect(shown).toBeLessThan(DRAWN_ON_PAGE.most);
    expect(numbers(doc, out)).toEqual(upTo(40));
    // (the room those shown take, within what the page allows - the next would have taken more)
    const area = (m: DrawnModel) => {
      const b = boxOf(m);
      return (b.x1 - b.x0) * (b.y1 - b.y0 + NOMINAL_BOND_LENGTH / 2 + 16 * PX);
    };
    expect(shown * area(long(1))).toBeLessThanOrEqual(DRAWN_ON_PAGE.area);
    expect((shown + 1) * area(long(1))).toBeGreaterThan(DRAWN_ON_PAGE.area);
  });

  it("go on along a wire all of them: a step that takes them is given each, in order - those on the page, then those held - and its key changes with any", () => {
    let doc = placeResults(page(), page().steps![0], drawn(many(DRAWN_ON_PAGE.most + 3)), W);
    const out = { set: resultOf(doc, doc.steps![0].id, "out")!.id };
    doc = addStep(doc, "conformers", 40, 0);
    const search = doc.steps![1].id;
    expect(canWire(doc, out, search)).toBe(true);
    doc = connect(doc, out, search);
    const input = inputOf(doc, search)!;
    expect(input.holds).toBe("structures");
    expect([input.structures.length, input.held!.length]).toEqual([DRAWN_ON_PAGE.most, 3]);
    const entries = inputEntries(doc.model, input);
    expect(entries.map((e) => e.place)).toEqual(Array.from({ length: DRAWN_ON_PAGE.most + 3 }, (_, k) => k));
    expect(entries.map((e) => recordNumber(e.record))).toEqual(upTo(DRAWN_ON_PAGE.most + 3));
    expect(entries.every((e) => shapeOf(e.drawn).atoms.join() === shapeOf(chloroethane()).atoms.join())).toBe(true);
    // (one of those held changed: what comes in is not what came in)
    const key = inputKey(doc, doc.steps![1], "meno");
    const held = resultOf(doc, doc.steps![0].id, "out")!.drawnCollection!;
    const changed = { ...held[1], atoms: held[1].atoms.map((a) => (a.el === "Cl" ? { ...a, el: "Br" } : a)) };
    const other = { ...doc, sets: doc.sets!.map((b) => (b.id === out.set ? { ...b, drawnCollection: held.map((m, k) => (k === 1 ? changed : m)) } : b)) };
    expect(inputKey(other, other.steps![1], "meno")).not.toBe(key);
  });

  it("run again, are taken away whole: fewer put on the page in their place, or more shown and held in place of those the page had", () => {
    const large = placeResults(page(), page().steps![0], drawn(many(DRAWN_ON_PAGE.most + 1)), W);
    const fewer = placeResults(large, large.steps![0], drawn([chiral()]), W);
    const out = resultOf(fewer, fewer.steps![0].id, "out")!;
    expect(out.drawnCollection).toBeUndefined();
    expect(shapes(fewer, out.id)).toEqual([shapeOf(chiral())]);
    const more = placeResults(fewer, fewer.steps![0], drawn(many(DRAWN_ON_PAGE.most + 2)), W);
    const now = resultOf(more, more.steps![0].id, "out")!;
    expect(numbers(more, now)).toEqual(upTo(DRAWN_ON_PAGE.most + 2));
    // (the chiral one the step put there gone; the chemist's own left, and those shown now)
    expect(more.model.atoms.filter((a) => a.el === "F" || a.el === "Br")).toEqual([]);
    expect(more.model.atoms.filter((a) => a.el === "O")).toHaveLength(2);
  });

  it("are kept with the run that gave them, all of them, and shown again as they were", () => {
    let doc = placeResults(page(), page().steps![0], drawn(many(DRAWN_ON_PAGE.most + 1)), W);
    doc = { ...doc, steps: doc.steps!.map((s) => ({ ...s, ran: { at: 1, ok: true, said: "first", input: "k", kind: s.kind } })) };
    const step = () => doc.steps![0];
    expect(resultsNow(doc, step())!.drawn!.made.map((m) => recordNumber(m.record))).toEqual(upTo(DRAWN_ON_PAGE.most + 1));
    doc = keepRun(doc, step());
    doc = placeResults(doc, step(), drawn([chiral()]), W);
    doc = { ...doc, steps: doc.steps!.map((s) => ({ ...s, ran: { at: 2, ok: true, said: "second", input: "k", kind: s.kind } })) };
    doc = showRun(doc, step().id, 0, W);
    expect(numbers(doc, resultOf(doc, step().id, "out")!)).toEqual(upTo(DRAWN_ON_PAGE.most + 1));
  });

  it("are read back from a file, those held as held - one that does not read left out and counted, with those its file said had not", () => {
    const doc = placeResults(page(), page().steps![0], drawn(many(DRAWN_ON_PAGE.most + 3)), W);
    const text = JSON.parse(JSON.stringify({ sets: doc.sets, steps: doc.steps, wires: doc.wires }));
    const out = text.sets.find((b: { made?: { exit: string } }) => b.made?.exit === "out");
    out.drawnCollection[1] = { atoms: "no" };
    out.unread = 2;
    const read = readWorkflow(text)!.sets.find((b) => b.made?.exit === "out")!;
    expect(read.members).toHaveLength(DRAWN_ON_PAGE.most);
    expect(read.drawnCollection!.map((m) => recordNumber(m.record))).toEqual([DRAWN_ON_PAGE.most + 1, DRAWN_ON_PAGE.most + 3]);
    expect(read.unread).toBe(3);
    // (a set whose step was deleted holds them still: read, never lost)
    expect(readWorkflow({ sets: [{ id: 1, x0: 0, y0: 0, x1: 2, y1: 2, drawnCollection: [chloroethane()] }] })!.sets[0].drawnCollection).toHaveLength(1);
  });

  it("deleting their step, stay in their set - and in the file: none lost", () => {
    let doc = placeResults(page(), page().steps![0], drawn(many(DRAWN_ON_PAGE.most + 3)), W);
    const out = resultOf(doc, doc.steps![0].id, "out")!;
    doc = removeStep(doc, doc.steps![0].id);
    const kept = doc.sets!.find((b) => b.id === out.id)!;
    expect([kept.made, numbers(doc, kept)]).toEqual([undefined, upTo(DRAWN_ON_PAGE.most + 3)]);
    const read = readWorkflow(JSON.parse(JSON.stringify({ sets: doc.sets, steps: doc.steps, wires: doc.wires })))!.sets.find((b) => b.id === out.id)!;
    expect(read.drawnCollection!.map((m) => recordNumber(m.record))).toEqual([DRAWN_ON_PAGE.most + 1, DRAWN_ON_PAGE.most + 2, DRAWN_ON_PAGE.most + 3]);
    expect(heldOwn(doc, kept)).toBe("3 structures");
  });

  it("are not copied with their set: put down again, it holds nothing until its step runs", () => {
    const doc = placeResults(page(), page().steps![0], drawn(many(DRAWN_ON_PAGE.most + 1)), W);
    const out = resultOf(doc, doc.steps![0].id, "out")!;
    const parts = partsOf(doc, new Set([out.id]), new Set([doc.steps![0].id]));
    expect(parts.sets[0].drawnCollection).toBeUndefined();
    expect(parts.sets[0].unread).toBeUndefined();
  });
});

/** Records as steps give them: an Enumerate product's number and how it was made; a generated structure's NLL and lineage; one set aside, and why. */
const numbered: DrawnRecord = {
  properties: {
    number: { value: 2, unit: "none", status: "computed", by: { step: "4" } },
    "made.how": { value: "R1 = Me", unit: "none", status: "computed", by: { step: "4" } },
  },
};
const sampled: DrawnRecord = { from: ["seed-1"], properties: { nll: { value: 23.5, unit: "none", status: "computed", by: { plugin: "reinvent", version: "4.6.0" } } } };
const aside: DrawnRecord = { status: { aside: "a radical" } };

/** Records as they are compared: without what each is of (`of`), which the page's numbering says. */
const bare = (records: readonly (DrawnRecord | undefined)[]) => records.map((r) => r && (({ of: _of, ...rest }) => rest)(r));

/** A result set's records now, as its structures stand. */
const recordsOf = (doc: WorkspaceDocument, exit = "out") => setMembers(doc, resultOf(doc, doc.steps![0].id, exit)!).records;

/** `doc` with one atom of the structures its step put on the page - the first of element `el` - made another element, settled as an edit is. */
function swapped(doc: WorkspaceDocument, el: string, to: string): WorkspaceDocument {
  const put = new Set(resultOf(doc, doc.steps![0].id, "out")!.put);
  const atom = doc.model.atoms.find((a) => a.el === el && put.has(a.id))!;
  return membersSettled({ ...doc, model: { ...doc.model, atoms: doc.model.atoms.map((a) => (a.id === atom.id ? { ...a, el: to } : a)) } }, doc);
}

describe("structures drawn, each with its record", () => {
  it("keep a step's record on their members, give it on along a wire, and keep it with a run kept and shown again", () => {
    let doc = placeResults(page(), page().steps![0], drawn([{ ...chiral(), record: numbered }, chloroethane()], [{ ...chloroethane(), record: aside }]), W);
    const step = () => doc.steps![0];
    const out = resultOf(doc, step().id, "out")!;
    expect(bare(recordsOf(doc))).toEqual([numbered, undefined]);
    expect(bare(recordsOf(doc, "rest"))).toEqual([aside]);
    // (each of the structure it was put on, as it is drawn)
    expect(recordsOf(doc)[0]!.of).toBe(drawnHash(doc.model, setMembers(doc, out).structures[0]));
    // (what a step after it is given: each structure with its record)
    doc = addStep(doc, "conformers", 40, 0);
    doc = connect(doc, { set: out.id }, doc.steps![1].id);
    const input = inputOf(doc, doc.steps![1].id)!;
    expect(bare(drawnEntries(doc.model, input.structures, input.records).map((e) => e.record))).toEqual([numbered, undefined]);
    // (a run kept keeps them, and gives them back when shown again)
    doc = { ...doc, steps: doc.steps!.map((s) => ({ ...s, ran: { at: 1, ok: true, said: "first", input: "k", kind: s.kind } })) };
    expect(bare(resultsNow(doc, step())!.drawn!.made.map((m) => m.record))).toEqual([numbered, undefined]);
    doc = keepRun(doc, step());
    doc = placeResults(doc, step(), drawn([{ ...chloroethane(), record: sampled }]), W);
    expect(bare(recordsOf(doc))).toEqual([sampled]);
    doc = showRun(doc, step().id, 0, W);
    expect(bare(recordsOf(doc))).toEqual([numbered, undefined]);
    expect(bare(step().runs![0].results!.drawn!.made.map((m) => m.record))).toEqual([sampled]);
  });

  it("keep their records as a set's members settle again, moved whole", () => {
    const first = placeResults(page(), page().steps![0], drawn([{ ...chiral(), record: numbered }]), W);
    const put = new Set(resultOf(first, first.steps![0].id, "out")!.put);
    const moved = membersSettled({ ...first, model: { ...first.model, atoms: first.model.atoms.map((a) => (put.has(a.id) ? { ...a, x: a.x + 0.3, y: a.y - 0.2 } : a)) } }, first);
    expect(recordsOf(moved)).toEqual(recordsOf(first));
  });

  it("edited by hand, are not what their records' properties were for: those and the status are taken away and said so - what each came from kept", () => {
    const first = placeResults(page(), page().steps![0], drawn([{ ...chiral(), record: { ...sampled, status: "done" } }]), W);
    // (Br to I: another structure, whose NLL the model never gave)
    const edited = swapped(first, "Br", "I");
    expect(recordsOf(edited)).toEqual([{ from: ["seed-1"], stale: BEFORE_THE_EDIT }]);
    // (and so kept in the set itself, not only as it is read)
    const member = resultOf(edited, edited.steps![0].id, "out")!.members![0];
    expect("structure" in member && member.record).toEqual({ from: ["seed-1"], stale: BEFORE_THE_EDIT });
    // (undone, the structure is the one it was for again: the record as it was)
    expect(bare(recordsOf(first))).toEqual([{ ...sampled, status: "done" }]);
    // (a wedge turned over is another structure too)
    const flipped = membersSettled({ ...first, model: { ...first.model, bonds: first.model.bonds.map((b) => (b.stereo === "up" ? { ...b, stereo: "down" } : b)) } }, first);
    expect(recordsOf(flipped)).toEqual([{ from: ["seed-1"], stale: BEFORE_THE_EDIT }]);
  });

  it("joined by the chemist to a structure of their own, are another structure: the record keeps what it came from alone", () => {
    const first = placeResults(page(), page().steps![0], drawn([{ ...chiral(), record: sampled }]), W);
    const out = resultOf(first, first.steps![0].id, "out")!;
    const br = first.model.atoms.find((a) => a.el === "Br" && out.put!.includes(a.id))!;
    const joined = membersSettled(
      { ...first, model: { atoms: [...first.model.atoms, { id: 900, el: "C", x: br.x - 1.5, y: br.y, r: 0.9 } as never], bonds: [...first.model.bonds, { id: 901, a: br.id, b: 900, order: 1 } as never] }, nextId: 902 },
      first,
    );
    const held = setMembers(joined, resultOf(joined, joined.steps![0].id, "out")!);
    expect(held.structures[0]).toContain(900);
    expect(held.records).toEqual([{ from: ["seed-1"], stale: BEFORE_THE_EDIT }]);
  });

  it("two joined into one: what both came from kept, the properties of neither", () => {
    const first = placeResults(page(), page().steps![0], drawn([{ ...chiral(), record: sampled }, { ...chloroethane(), record: { from: ["seed-2"], properties: sampled.properties } }]), W);
    const [a, b] = setMembers(first, resultOf(first, first.steps![0].id, "out")!).structures;
    const br = first.model.atoms.find((x) => a.includes(x.id) && x.el === "Br")!;
    const cl = first.model.atoms.find((x) => b.includes(x.id) && x.el === "Cl")!;
    const one = membersSettled({ ...first, model: { ...first.model, bonds: [...first.model.bonds, { id: 950, a: br.id, b: cl.id, order: 1 } as never] } }, first);
    expect(recordsOf(one)).toEqual([{ from: ["seed-1", "seed-2"], stale: BEFORE_THE_EDIT }]);
  });

  it("are in what a step after them is keyed by: a value changed before it, it has changed", () => {
    const at = (nll: number) => {
      let doc = placeResults(page(), page().steps![0], drawn([{ ...chiral(), record: { properties: { nll: { value: nll, unit: "none", status: "computed" } } } }]), W);
      doc = addStep(doc, "conformers", 40, 0);
      return connect(doc, { set: resultOf(doc, doc.steps![0].id)!.id }, doc.steps![1].id);
    };
    const key = (doc: WorkspaceDocument) => inputKey(doc, doc.steps![1], "meno");
    expect(key(at(10))).toBe(key(at(10)));
    expect(key(at(10))).not.toBe(key(at(99)));
    // (run on the one, the step says it has changed on the other)
    const ran = at(10);
    const steps = ran.steps!.map((s, i) => (i === 1 ? { ...s, ran: { at: 1, ok: true, said: "done", input: key(ran), kind: s.kind } } : s));
    expect(stateOf({ ...ran, steps }, steps[1], "meno")).toBe("done");
    const other = at(99);
    expect(stateOf({ ...other, steps: other.steps!.map((s, i) => (i === 1 ? steps[1] : s)) }, steps[1], "meno")).toBe("changed");
  });

  it("are carried by a copy of their set, put down again: each record on its structure as pasted, of it", () => {
    const first = placeResults(page(), page().steps![0], drawn([{ ...chiral(), record: sampled }, chloroethane()]), W);
    const out = resultOf(first, first.steps![0].id, "out")!;
    const parts = partsOf(first, new Set([out.id]), new Set());
    expect(parts.sets[0].members).toBeUndefined();
    expect(bare(parts.sets[0].carried!.map((c) => c.record))).toEqual([sampled]);
    // (pasted 100 to the right, its atoms numbered on from 1000 - as a paste numbers them)
    const copied = new Set(out.put);
    const idOf = (id: number) => (copied.has(id) ? 1000 + id : undefined);
    const atoms = first.model.atoms.filter((a) => copied.has(a.id)).map((a) => ({ ...a, id: idOf(a.id)!, x: a.x + 100 }));
    const bonds = first.model.bonds.filter((b) => copied.has(b.a)).map((b) => ({ ...b, id: 2000 + b.id, a: idOf(b.a)!, b: idOf(b.b)! }));
    const before = { ...first, model: { atoms: [...first.model.atoms, ...atoms], bonds: [...first.model.bonds, ...bonds] } };
    // (as a copy goes, through Meno's own record of it)
    const through = readWorkflow(JSON.parse(JSON.stringify({ sets: parts.sets, steps: [], wires: [] })))!;
    const { doc, sets } = appendParts(before, carriedRenumbered({ ...parts, sets: through.sets }, idOf), 100, 0);
    const pasted = membersSettled(doc, before);
    const set = pasted.sets!.find((b) => b.id === sets[0])!;
    expect(set.carried).toBeUndefined();
    // (found again as they lie, in reading order: the record with (R)-CHFClBr, the structure it was for)
    const held = setMembers(pasted, set);
    const elOf = (id: number) => pasted.model.atoms.find((x) => x.id === id)!.el;
    const k = held.structures.findIndex((ids) => ids.some((id) => elOf(id) === "Br"));
    expect(held.structures).toHaveLength(2);
    expect(bare(held.records)).toEqual(held.structures.map((_, i) => (i === k ? sampled : undefined)));
    expect(held.records[k]!.of).toBe(drawnHash(pasted.model, held.structures[k]));
    // (and of the structure as pasted: edited there, it is not)
    const br = held.structures[k].find((id) => elOf(id) === "Br")!;
    const edited = membersSettled({ ...pasted, model: { ...pasted.model, atoms: pasted.model.atoms.map((x) => (x.id === br ? { ...x, el: "I" } : x)) } }, pasted);
    expect(setMembers(edited, edited.sets!.find((b) => b.id === sets[0])!).records[k]).toEqual({ from: ["seed-1"], stale: BEFORE_THE_EDIT });
  });

  it("are written with their records and read back - the members' and a run kept's alike", () => {
    let doc = placeResults(page(), page().steps![0], drawn([{ ...chiral(), record: sampled }], [{ ...chloroethane(), record: aside }]), W);
    doc = { ...doc, steps: doc.steps!.map((s) => ({ ...s, ran: { at: 1, ok: true, said: "first", input: "k", kind: s.kind } })) };
    doc = keepRun(doc, doc.steps![0]);
    const saved = readWorkflow(JSON.parse(JSON.stringify({ sets: doc.sets, steps: doc.steps, wires: doc.wires })))!;
    const back = { ...doc, sets: saved.sets, steps: saved.steps };
    expect(recordsOf(back)).toEqual(recordsOf(doc));
    expect(bare(recordsOf(back))).toEqual([sampled]);
    expect(bare(recordsOf(back, "rest"))).toEqual([aside]);
    expect(bare([saved.steps[0].runs![0].results!.drawn!.made[0].record])).toEqual([sampled]);
    expect(bare([saved.steps[0].runs![0].results!.drawn!.rest[0].record])).toEqual([aside]);
  });

  it("are read as data: what of a record does not read is left out and counted, and a record of nothing is none", () => {
    const { value, left } = noting(() =>
      readDrawnRecord({
        from: ["a", 7, "b"],
        properties: {
          kept: { value: 1.5, unit: "kcal/mol", at: { geometry: "g1", kelvin: 298.15 }, status: "computed", by: { step: "3", junk: "x" } },
          aText: { value: "R1 = Me", unit: "none", status: { notApplicable: "no ring" } },
          noUnit: { value: 2, unit: "furlongs", status: "computed" },
          noValue: { value: { nested: true }, unit: "none", status: "computed" },
          noStatus: { value: 3, unit: "none", status: "guessed" },
          infinite: { value: Infinity, unit: "none", status: "computed" },
          byNumber: { value: 4, unit: "none", status: "computed", by: { plugin: 7 } },
        },
        status: { aside: "a radical" },
        of: "k9",
        stale: "said",
      }),
    );
    expect(left).toEqual({ property: 5, madeFrom: 1 });
    expect(value).toEqual({
      from: ["a", "b"],
      properties: {
        kept: { value: 1.5, unit: "kcal/mol", at: { geometry: "g1", kelvin: 298.15 }, status: "computed", by: { step: "3" } },
        aText: { value: "R1 = Me", unit: "none", status: { notApplicable: "no ring" } },
      },
      status: { aside: "a radical" },
      of: "k9",
      stale: "said",
    });
    expect(readDrawnRecord({ from: [1], properties: { x: { value: 1 } }, status: "maybe", of: 3 })).toBeUndefined();
    expect(readDrawnRecord("no")).toBeUndefined();
    expect(readDrawnRecord({ status: "done" })).toEqual({ status: "done" });
  });
});

describe("structures drawn, into Meno's own steps", () => {
  it("are taken by none yet: a step of Meno's refuses the wire, and the 2D path says it does none of them", () => {
    let doc: WorkspaceDocument = { ...emptyWorkspaceDocument(), model: chiral(), nextId: 5 };
    doc = addSet(doc, { x0: -3, y0: -3, x1: 3, y1: 3 });
    doc = addStep(doc, "duplicates", 10, 0);
    const step = doc.steps![0].id;
    expect(canWire(doc, { set: 1 }, step)).toBe(false);
    expect(runStep(connect(doc, { set: 1 }, step), step, W).steps![0].ran).toMatchObject({ ok: false, said: "Nothing comes into it" });
    expect(runMenoDrawn("duplicates", drawnEntries(doc.model, [[1, 2, 3, 4]]))).toEqual({ ok: false, said: "Meno does not do this itself on structures drawn" });
    expect(runMenoDrawn("duplicates", [])).toEqual({ ok: false, said: "Nothing came in" });
  });
});
