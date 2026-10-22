import { describe, expect, it } from "vitest";
import { emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { DrawnModel, DrawnRecord, Model } from "../store/types";
import { countOf, holdsOf, readDrawnRecord, setMembers } from "./entries";
import { canWire, givesOf, inputOf, resultOf } from "./flow";
import { runMenoDrawn } from "./meno";
import { addSet, addStep, connect, membersSettled } from "./model";
import { drawnEntries, keepRun, placeResults, resultsNow, runStep, showRun, type RunResults, type RunWith } from "./run";
import { readWorkflow } from "./saved";

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

/** Records as steps give them: an Enumerate product's number and how it was made; a generated structure's NLL and lineage; one set aside, and why. */
const numbered: DrawnRecord = {
  properties: {
    number: { value: 2, unit: "none", status: "computed", by: { step: "4" } },
    "made.how": { value: "R1 = Me", unit: "none", status: "computed", by: { step: "4" } },
  },
};
const sampled: DrawnRecord = { from: ["seed-1"], properties: { nll: { value: 23.5, unit: "none", status: "computed", by: { plugin: "reinvent", version: "4.6.0" } } } };
const aside: DrawnRecord = { status: { aside: "a radical" } };

describe("structures drawn, each with its record", () => {
  it("keep a step's record on their members, give it on along a wire, and keep it with a run kept and shown again", () => {
    let doc = placeResults(page(), page().steps![0], drawn([{ ...chiral(), record: numbered }, chloroethane()], [{ ...chloroethane(), record: aside }]), W);
    const step = () => doc.steps![0];
    const out = resultOf(doc, step().id, "out")!;
    expect(setMembers(doc, out).records).toEqual([numbered, undefined]);
    expect(setMembers(doc, resultOf(doc, step().id, "rest")!).records).toEqual([aside]);
    // (what a step after it is given: each structure with its record)
    doc = addStep(doc, "conformers", 40, 0);
    doc = connect(doc, { set: out.id }, doc.steps![1].id);
    const input = inputOf(doc, doc.steps![1].id)!;
    expect(drawnEntries(doc.model, input.structures, input.records).map((e) => e.record)).toEqual([numbered, undefined]);
    // (a run kept keeps them, and gives them back when shown again)
    doc = { ...doc, steps: doc.steps!.map((s) => ({ ...s, ran: { at: 1, ok: true, said: "first", input: "k", kind: s.kind } })) };
    expect(resultsNow(doc, step())!.drawn!.made.map((m) => m.record)).toEqual([numbered, undefined]);
    doc = keepRun(doc, step());
    doc = placeResults(doc, step(), drawn([{ ...chloroethane(), record: sampled }]), W);
    expect(setMembers(doc, resultOf(doc, step().id, "out")!).records).toEqual([sampled]);
    doc = showRun(doc, step().id, 0, W);
    expect(setMembers(doc, resultOf(doc, step().id, "out")!).records).toEqual([numbered, undefined]);
    expect(step().runs![0].results!.drawn!.made.map((m) => m.record)).toEqual([sampled]);
  });

  it("keep their records as a set's members settle again: moved, or joined by the chemist to a structure of their own", () => {
    const first = placeResults(page(), page().steps![0], drawn([{ ...chiral(), record: numbered }]), W);
    const out = resultOf(first, first.steps![0].id, "out")!;
    const br = first.model.atoms.find((a) => a.el === "Br" && out.put!.includes(a.id))!;
    const joined = membersSettled(
      { ...first, model: { atoms: [...first.model.atoms, { id: 900, el: "C", x: br.x - 1.5, y: br.y, r: 0.9 } as never], bonds: [...first.model.bonds, { id: 901, a: br.id, b: 900, order: 1 } as never] }, nextId: 902 },
      first,
    );
    const held = setMembers(joined, resultOf(joined, joined.steps![0].id, "out")!);
    expect(held.structures[0]).toContain(900);
    expect(held.records).toEqual([numbered]);
  });

  it("are written with their records and read back - the members' and a run kept's alike", () => {
    let doc = placeResults(page(), page().steps![0], drawn([{ ...chiral(), record: sampled }], [{ ...chloroethane(), record: aside }]), W);
    doc = { ...doc, steps: doc.steps!.map((s) => ({ ...s, ran: { at: 1, ok: true, said: "first", input: "k", kind: s.kind } })) };
    doc = keepRun(doc, doc.steps![0]);
    const saved = readWorkflow(JSON.parse(JSON.stringify({ sets: doc.sets, steps: doc.steps, wires: doc.wires })))!;
    const back = { ...doc, sets: saved.sets, steps: saved.steps };
    expect(setMembers(back, resultOf(back, back.steps![0].id, "out")!).records).toEqual([sampled]);
    expect(setMembers(back, resultOf(back, back.steps![0].id, "rest")!).records).toEqual([aside]);
    expect(saved.steps[0].runs![0].results!.drawn!.made[0].record).toEqual(sampled);
    expect(saved.steps[0].runs![0].results!.drawn!.rest[0].record).toEqual(aside);
  });

  it("are read as data: what of a record does not read is left out, and a record of nothing is none", () => {
    expect(
      readDrawnRecord({
        from: ["a", "b"],
        properties: {
          kept: { value: 1.5, unit: "kcal/mol", status: "computed", by: { step: "3", junk: "x", plugin: 7 } },
          aText: { value: "R1 = Me", unit: "none", status: { notApplicable: "no ring" } },
          noUnit: { value: 2, unit: "furlongs", status: "computed" },
          noValue: { value: { nested: true }, unit: "none", status: "computed" },
          noStatus: { value: 3, unit: "none", status: "guessed" },
          infinite: { value: Infinity, unit: "none", status: "computed" },
        },
        status: { aside: "a radical" },
      }),
    ).toEqual({
      from: ["a", "b"],
      properties: {
        kept: { value: 1.5, unit: "kcal/mol", status: "computed", by: { step: "3" } },
        aText: { value: "R1 = Me", unit: "none", status: { notApplicable: "no ring" } },
      },
      status: { aside: "a radical" },
    });
    expect(readDrawnRecord({ from: [1], properties: { x: { value: 1 } }, status: "maybe" })).toBeUndefined();
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
