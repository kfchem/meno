import { describe, expect, it } from "vitest";
import { emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { DrawnModel, Model } from "../store/types";
import { hash, readDrawnRecord, setMembers, structureIdAt, structureLineage } from "./entries";
import { resultOf } from "./flow";
import { addSet, addStep, membersSettled } from "./model";
import { appendParts, carriedRenumbered, partsOf } from "./parts";
import { placeResults, type RunResults, type RunWith } from "./run";
import { readWorkflow } from "./saved";

// A structure's lasting id (`DrawnRecord.id`, docs/WORKFLOWS.md *What a structure drawn keeps*): what is made of it - its
// conformers in 3D - names it by.

const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };

/** (R)-CHFClBr, in its own numbering from 1, as a step gives it. */
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
/** Chloroethane, as a step gives it. */
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

/** A page with a step that sets entries aside (Duplicates), its exits not run yet. */
const stepPage = (): WorkspaceDocument => addStep({ ...emptyWorkspaceDocument(), nextId: 1 }, "duplicates", 5, 0);

/** A page with a chain of two carbons (atoms `id`, `id + 1`) at each of `at`, as the chemist drew them. */
function chains(...at: { x: number; y: number; id: number }[]): WorkspaceDocument {
  return {
    ...emptyWorkspaceDocument(),
    model: {
      atoms: at.flatMap((p) => [
        { id: p.id, x: p.x, y: p.y, r: 0.9, el: "C" },
        { id: p.id + 1, x: p.x + 1.3, y: p.y, r: 0.9, el: "C" },
      ]),
      bonds: at.map((p) => ({ id: p.id, a: p.id, b: p.id + 1, order: 1 as const })),
    },
    nextId: 100,
  };
}

/** The lasting ids of a set's structures, as they stand. */
const idsOf = (doc: WorkspaceDocument, set: number) => setMembers(doc, doc.sets!.find((b) => b.id === set)!).records.map((r) => r?.id);
/** The lasting ids of what a step's exit holds - the first step's, else the `step`th. */
const exitIds = (doc: WorkspaceDocument, exit = "out", step = 0) => idsOf(doc, resultOf(doc, doc.steps![step].id, exit)!.id);

/** `doc` with its atom `id` made element `to`, settled as an edit is. */
const madeAnother = (doc: WorkspaceDocument, id: number, to: string) => membersSettled({ ...doc, model: { ...doc.model, atoms: doc.model.atoms.map((a) => (a.id === id ? { ...a, el: to } : a)) } }, doc);

describe("a structure's lasting id", () => {
  it("is given to each structure the chemist drew as it is put in a set: its own, kept as it moves, and the same each time it is worked out", () => {
    const page = chains({ x: 0, y: 0, id: 1 }, { x: 0, y: 4, id: 3 });
    const doc = addSet(page, { x0: -2, y0: -2, x1: 6, y1: 6 });
    const [a, b] = idsOf(doc, 1);
    expect(a && b && a !== b).toBe(true);
    expect(idsOf(addSet(page, { x0: -2, y0: -2, x1: 6, y1: 6 }), 1)).toEqual([a, b]);
    // (moved: the same structure, the same id)
    const moved = membersSettled({ ...doc, model: { ...doc.model, atoms: doc.model.atoms.map((x) => (x.id <= 2 ? { ...x, x: x.x + 0.5 } : x)) } }, doc);
    expect(idsOf(moved, 1)).toEqual([a, b]);
    // (one drawn in it later: given one too, its own)
    const drawnIn = membersSettled(
      { ...doc, model: { atoms: [...doc.model.atoms, { id: 20, x: 3, y: 2, r: 0.9, el: "O" } as never, { id: 21, x: 4.3, y: 2, r: 0.9, el: "O" } as never], bonds: [...doc.model.bonds, { id: 22, a: 20, b: 21, order: 2 } as never] } },
      doc,
    );
    const ids = idsOf(drawnIn, 1);
    expect(ids).toHaveLength(3);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual(expect.arrayContaining([a, b]));
  });

  it("is another's once the chemist's structure is drawn as another - an element, a group's label - the same again as it was", () => {
    const doc = addSet(chains({ x: 0, y: 0, id: 1 }, { x: 0, y: 4, id: 3 }), { x0: -2, y0: -2, x1: 6, y1: 6 });
    const ids = idsOf(doc, 1);
    const atom = (id: number, change: object) => membersSettled({ ...doc, model: { ...doc.model, atoms: doc.model.atoms.map((a) => (a.id === id ? { ...a, ...change } : a)) } }, doc);
    // (chain 1, the second in reading order, its second carbon made an N: that one another's, the other as it was)
    const nitrogen = atom(2, { el: "N" });
    expect(idsOf(nitrogen, 1)[0]).toBe(ids[0]);
    expect(idsOf(nitrogen, 1)[1]).not.toBe(ids[1]);
    expect(idsOf(atom(2, { el: "OAc", abbrev: { atoms: [], bonds: [] } }), 1)[1]).not.toBe(idsOf(atom(2, { el: "OAc", abbrev: { atoms: [], bonds: [], held: 1 } }), 1)[1]);
    // (drawn back as it was: its own again)
    expect(idsOf(membersSettled(doc, nitrogen), 1)).toEqual(ids);
  });

  it("is given to a structure in a set saved before it had one, as the page is next edited", () => {
    const doc = addSet(chains({ x: 0, y: 0, id: 1 }), { x0: -2, y0: -2, x1: 6, y1: 6 });
    const before = { ...doc, sets: doc.sets!.map((b) => ({ ...b, members: [{ structure: [1, 2] }] })) };
    expect(idsOf(before, 1)).toEqual([undefined]);
    const edited = membersSettled({ ...before, model: { ...before.model, atoms: [...before.model.atoms, { id: 50, x: 30, y: 30, r: 0.9, el: "O" } as never] } }, before);
    expect(idsOf(edited, 1)).toEqual(idsOf(doc, 1));
  });

  it("is given to each structure a step gives - in each exit, two alike their own - the same when the step gives them again", () => {
    const results = () => drawn([chiral(), chloroethane(), chloroethane()], [chloroethane()]);
    const doc = placeResults(stepPage(), stepPage().steps![0], results(), W);
    const out = exitIds(doc);
    const rest = exitIds(doc, "rest");
    expect([...out, ...rest].every(Boolean)).toBe(true);
    expect(new Set([...out, ...rest]).size).toBe(4);
    expect([exitIds(placeResults(stepPage(), stepPage().steps![0], results(), W)), exitIds(placeResults(stepPage(), stepPage().steps![0], results(), W), "rest")]).toEqual([out, rest]);
  });

  it("is told apart by where it is put: one structure at the first place of two exits of a step, and of another step's two, has four", () => {
    const two = addStep(stepPage(), "duplicates", 5, 40);
    const once = placeResults(two, two.steps![0], drawn([chloroethane()], [chloroethane()]), W);
    const both = placeResults(once, once.steps![1], drawn([chloroethane()], [chloroethane()]), W);
    const ids = [exitIds(both), exitIds(both, "rest"), exitIds(both, "out", 1), exitIds(both, "rest", 1)].flat();
    expect(ids).toHaveLength(4);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(4);
  });

  it("is two hashes wide: two drawings one hash alone takes as the same are told apart", () => {
    // (two found by trying, each FNV-1a hash of the text the id is worked out from the same)
    const [a, b] = ["C5pf8", "Cmrj6"];
    expect(hash(`step 1 out|0|${a}`)).toBe(hash(`step 1 out|0|${b}`));
    expect(structureIdAt("step 1 out", 0, a)).not.toBe(structureIdAt("step 1 out", 0, b));
  });

  it("is kept where a step gives on the structure it was given with it - and is another's where it gives another with it", () => {
    const kept = placeResults(stepPage(), stepPage().steps![0], drawn([{ ...chiral(), record: { id: "s1", of: "x" } }]), W);
    // (its `of` another structure's: what it was given with is not this one)
    expect(exitIds(kept)[0]).not.toBe("s1");
    const same = placeResults(stepPage(), stepPage().steps![0], drawn([{ ...chiral(), record: { id: "s1" } }]), W);
    expect(exitIds(same)).toEqual(["s1"]);
    const of = setMembers(same, resultOf(same, same.steps![0].id, "out")!).records[0]!.of!;
    expect(exitIds(placeResults(stepPage(), stepPage().steps![0], drawn([{ ...chiral(), record: { id: "s1", of } }]), W))).toEqual(["s1"]);
  });

  it("is another's once the structure is edited into another: the same each time it is read, another again on the next edit, its own again undone", () => {
    const doc = placeResults(stepPage(), stepPage().steps![0], drawn([chiral()]), W);
    const [first] = exitIds(doc);
    const put = resultOf(doc, doc.steps![0].id, "out")!.put!;
    const br = doc.model.atoms.find((a) => put.includes(a.id) && a.el === "Br")!.id;
    const iodide = madeAnother(doc, br, "I");
    const [second] = exitIds(iodide);
    expect(second).not.toBe(first);
    expect(exitIds(iodide)).toEqual([second]);
    // (and so kept in the set itself)
    const member = resultOf(iodide, iodide.steps![0].id, "out")!.members![0];
    expect("structure" in member && member.record?.id).toBe(second);
    const [third] = exitIds(madeAnother(iodide, br, "Cl"));
    expect(new Set([first, second, third]).size).toBe(3);
    expect(exitIds(doc)).toEqual([first]);
    // (a wedge turned over: another structure too)
    const flipped = membersSettled({ ...doc, model: { ...doc.model, bonds: doc.model.bonds.map((b) => (b.stereo === "up" ? { ...b, stereo: "down" } : b)) } }, doc);
    expect(exitIds(flipped)[0]).not.toBe(first);
  });

  it("is a copy's own: a set copied and put down gives its structures ids of their own", () => {
    const first = placeResults(stepPage(), stepPage().steps![0], drawn([{ ...chiral(), record: { from: ["seed-1"] } }, chloroethane()]), W);
    const out = resultOf(first, first.steps![0].id, "out")!;
    const parts = partsOf(first, new Set([out.id]), new Set());
    // (what its step said is carried; its ids are not)
    expect(parts.sets[0].carried!.map((c) => c.record)).toEqual([expect.objectContaining({ from: ["seed-1"] })]);
    expect(parts.sets[0].carried!.some((c) => c.record.id)).toBe(false);
    const copied = new Set(out.put);
    const idOf = (id: number) => (copied.has(id) ? 1000 + id : undefined);
    const atoms = first.model.atoms.filter((a) => copied.has(a.id)).map((a) => ({ ...a, id: idOf(a.id)!, x: a.x + 100 }));
    const bonds = first.model.bonds.filter((b) => copied.has(b.a)).map((b) => ({ ...b, id: 2000 + b.id, a: idOf(b.a)!, b: idOf(b.b)! }));
    const before = { ...first, model: { atoms: [...first.model.atoms, ...atoms], bonds: [...first.model.bonds, ...bonds] } };
    const through = readWorkflow(JSON.parse(JSON.stringify({ sets: parts.sets, steps: [], wires: [] })))!;
    const { doc, sets } = appendParts(before, carriedRenumbered({ ...parts, sets: through.sets }, idOf), 100, 0);
    const pasted = idsOf(membersSettled(doc, before), sets[0]);
    expect(pasted).toHaveLength(2);
    expect(pasted.every(Boolean)).toBe(true);
    expect(pasted.some((id) => exitIds(first).includes(id))).toBe(false);
  });

  it("is written with its record and read back", () => {
    expect(readDrawnRecord({ id: "s1", of: "x" })).toEqual({ id: "s1", of: "x" });
    expect(readDrawnRecord({ id: "", from: ["a"] })).toEqual({ from: ["a"] });
    const doc = placeResults(stepPage(), stepPage().steps![0], drawn([chiral()]), W);
    const saved = readWorkflow(JSON.parse(JSON.stringify({ sets: doc.sets, steps: doc.steps, wires: doc.wires })))!;
    expect(exitIds({ ...doc, sets: saved.sets, steps: saved.steps })).toEqual(exitIds(doc));
  });

  it("is how what is made of the structure names it", () => {
    expect(structureLineage("s1")).toBe("structure:s1");
  });
});
