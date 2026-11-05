import { describe, expect, it } from "vitest";
import { createWorkspaceDocument, emptyWorkspaceDocument, withoutAtoms, type WorkspaceDocument } from "../document";
import { createEditorStore, connectStoreToDocument } from "../store";
import type { DrawnModel, DrawnRecord, Molecule3D } from "../store/types";
import { readWorkspace, workspaceText } from "../utils/workspace";
import { setMembers, setMolecules } from "./entries";
import { inputKey, resultOf } from "./flow";
import { heldOff, heldSets, heldSettled, isHeld, setsOnPage, wireStart } from "./held";
import { addSet, addStep, connect, removeStep, removeWire } from "./model";
import { flowIn } from "./parts";
import { clearOf } from "./place";
import { placeResults, type RunResults, type RunWith } from "./run";
import { exitPlace } from "./kinds";
import { setGives, stepGives } from "./look";

/** Each molecule reaching 2 page units about its middle, as a look draws it. */
const extentOf: RunWith["extentOf"] = () => ({ x0: -2, x1: 2, y0: -2, y1: 2 });
const W: RunWith = { extentOf, byOf: () => "meno", now: 1 };

/** Water at `dx` Å along: one geometry, its energy. */
function water(dx: number, energy = -76.4): Omit<Molecule3D, "id" | "at"> {
  return {
    atoms: [
      { el: "O", x: dx, y: 0, z: 0 },
      { el: "H", x: dx + 0.96, y: 0, z: 0 },
      { el: "H", x: dx - 0.24, y: 0.93, z: 0 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    energies: [energy],
  };
}

/** Ethanol drawn, its atoms numbered from `from`, with a record where given. */
function ethanol(from: number, record?: DrawnRecord): DrawnModel {
  return {
    atoms: [
      { id: from, el: "C", x: 0, y: 0 },
      { id: from + 1, el: "C", x: 1.5, y: 0 },
      { id: from + 2, el: "O", x: 2.25, y: 1.3 },
    ],
    bonds: [
      { id: from + 3, a: from, b: from + 1, order: 1 },
      { id: from + 4, a: from + 1, b: from + 2, order: 1 },
    ],
    ...(record ? { record } : {}),
  } as DrawnModel;
}
const made: DrawnRecord = { from: ["seed-1"], properties: { nll: { value: 23.5, unit: "none", status: "computed", by: { plugin: "reinvent", version: "4.6.0" } } } };

/** Molecules a step gives, as a run does. */
const molecules = (ms: readonly Omit<Molecule3D, "id" | "at">[]): RunResults => ({ molecules: [...ms], rest: [], holds: "molecules" }) as unknown as RunResults;
/** Structures drawn a step gives, as a run does. */
const drawn = (ms: readonly DrawnModel[]): RunResults => ({ molecules: [], rest: [], holds: "structures", drawn: { made: [...ms], rest: [] } }) as unknown as RunResults;

/**
 * A Filter (step 1; its sets 2, kept, and 3, the rest) that gave two
 * waters, on the page, and an Energy step (4; its sets 5 and 6) after it,
 * not wired yet.
 */
function page(): WorkspaceDocument {
  let doc = addStep(emptyWorkspaceDocument(), "filter", 0, 0);
  doc = addStep(doc, "energy", 300, 0, {}, "xtb");
  expect([doc.steps!.map((s) => s.id), resultOf(doc, 1)!.id, resultOf(doc, 4)!.id]).toEqual([[1, 4], 2, 5]);
  return placeResults(doc, doc.steps![0], molecules([water(0), water(3, -76.3)]), W);
}
const KEPT = 2;
const ENERGY = 4;

/** `doc`'s set `id`, as it is now. */
const setOf = (doc: WorkspaceDocument, id: number) => doc.sets!.find((b) => b.id === id)!;

/** A workspace's document whose edits settle as the app's do: held off the page or laid out as they wire it. */
function documented(doc: WorkspaceDocument) {
  const d = createWorkspaceDocument(undefined, undefined, undefined, () => extentOf);
  d.reset(doc);
  return d;
}

describe("a step's result set held off the page (docs/WORKFLOWS.md, *Held results*)", () => {
  it("is one whose exit is wired on and not opened: not a set the chemist made, not one not wired on", () => {
    let doc = addSet(page(), { x0: -40, y0: -40, x1: -30, y1: -30 });
    const chemist = doc.sets![doc.sets!.length - 1]!.id;
    expect(heldSets(doc).size).toBe(0);
    doc = connect(connect(doc, { set: KEPT }, ENERGY), { set: chemist }, ENERGY);
    // (the chemist's set wired in place of the Filter's: one wire into an input)
    expect([isHeld(doc, setOf(doc, KEPT)), isHeld(doc, setOf(doc, chemist))]).toEqual([false, false]);
    doc = connect(doc, { set: KEPT }, ENERGY);
    expect([isHeld(doc, setOf(doc, KEPT)), isHeld(doc, setOf(doc, chemist))]).toEqual([true, false]);
    doc = { ...doc, sets: doc.sets!.map((b) => (b.id === KEPT ? { ...b, opened: true as const } : b)) };
    expect(isHeld(doc, setOf(doc, KEPT))).toBe(false);
  });

  it("is held as its wire is drawn, in that one step of the history: its molecules off the page, in its order, kept by their ids - and laid out again on the same ids as the wire goes", () => {
    const d = documented(page());
    const ids = setMembers(d.getState(), setOf(d.getState(), KEPT)).molecules;
    const frame = (({ x0, x1, y0, y1 }) => ({ x0, x1, y0, y1 }))(setOf(d.getState(), KEPT));
    d.edit("wire", (s) => connect(s, { set: KEPT }, ENERGY));
    const held = setOf(d.getState(), KEPT);
    expect(d.getState().molecules3d!.filter((m) => ids.includes(m.id))).toEqual([]);
    expect([held.members, held.collection!.map((m) => m.energies), held.heldIds]).toEqual([[], [[-76.4], [-76.3]], ids]);
    expect((({ x0, x1, y0, y1 }) => ({ x0, x1, y0, y1 }))(held)).toEqual(frame);
    // (one step back: on the page, no wire)
    d.undo();
    expect([d.getState().wires ?? [], setMembers(d.getState(), setOf(d.getState(), KEPT)).molecules]).toEqual([[], ids]);
    d.redo();
    d.edit("unwire", (s) => removeWire(s, s.wires![0].id));
    const back = setOf(d.getState(), KEPT);
    expect([setMembers(d.getState(), back).molecules, back.collection, back.heldIds]).toEqual([ids, undefined, undefined]);
  });

  it("gives a step after it the same as on the page - its key too: no step changed by wiring it, nor by laying it out", () => {
    const wired = connect(page(), { set: KEPT }, ENERGY);
    const step = () => wired.steps!.find((s) => s.id === ENERGY)!;
    const shown = inputKey(wired, step(), "xtb");
    const held = heldSettled(wired, undefined, extentOf);
    expect(setOf(held, KEPT).collection).toHaveLength(2);
    expect(inputKey(held, step(), "xtb")).toBe(shown);
    const opened = heldSettled({ ...held, sets: held.sets!.map((b) => (b.id === KEPT ? { ...b, opened: true as const } : b)) }, held, extentOf);
    expect(setMembers(opened, setOf(opened, KEPT)).molecules).toHaveLength(2);
    expect(inputKey(opened, step(), "xtb")).toBe(shown);
  });

  it("keeps structures drawn on their own atoms' ids, with their records - the key of what a step after it takes the same - and lays them out on them again", () => {
    let doc = addStep(emptyWorkspaceDocument(), "check-structures", 0, 0);
    doc = addStep(doc, "descriptors", 300, 0);
    doc = placeResults(doc, doc.steps![0], drawn([ethanol(1, made), ethanol(10)]), W);
    const out = resultOf(doc, 1)!.id;
    const atoms = setMembers(doc, setOf(doc, out)).structures;
    const step = doc.steps![1];
    doc = connect(doc, { set: out }, step.id);
    const shown = inputKey(doc, step, "rdkit");
    const held = heldSettled(doc, undefined, extentOf);
    expect(setOf(held, out).drawnCollection!.map((m) => [m.atoms.map((a) => a.id), m.record?.from])).toEqual([
      [atoms[0], ["seed-1"]],
      [atoms[1], undefined],
    ]);
    expect(held.model.atoms.filter((a) => atoms.flat().includes(a.id))).toEqual([]);
    expect(inputKey(held, step, "rdkit")).toBe(shown);
    const back = heldSettled(removeWire(held, held.wires![0].id), held, extentOf);
    expect(setMembers(back, setOf(back, out)).structures).toEqual(atoms);
    expect(setOf(back, out).put).toEqual(atoms.flat());
    expect(setMembers(back, setOf(back, out)).records.map((r) => r?.from)).toEqual([["seed-1"], undefined]);
  });

  it("takes off the page only what it alone holds: a molecule another set holds too stays its, and is taken up again where it is", () => {
    let doc = page();
    const [first, second] = setMembers(doc, setOf(doc, KEPT)).molecules;
    doc = addSet(doc, { x0: -100, y0: -100, x1: -90, y1: -90 });
    const other = doc.sets![doc.sets!.length - 1]!.id;
    doc = { ...doc, sets: doc.sets!.map((b) => (b.id === other ? { ...b, members: [{ molecule: first }] } : b)) };
    const held = heldSettled(connect(doc, { set: KEPT }, ENERGY), undefined, extentOf);
    expect(held.molecules3d!.map((m) => m.id)).toEqual([first]);
    expect(setMembers(held, setOf(held, other)).molecules).toEqual([first]);
    expect(setOf(held, KEPT).collection).toHaveLength(2);
    const back = heldSettled(removeWire(held, held.wires![0].id), held, extentOf);
    expect(back.molecules3d!.map((m) => m.id).sort()).toEqual([first, second].sort());
    expect(setMembers(back, setOf(back, KEPT)).molecules).toEqual([first, second]);
  });

  it("keeps what names its molecules: a text shown from one, and a molecule's link to its drawing, find it again as it is laid out", () => {
    let doc = page();
    const [first] = setMembers(doc, setOf(doc, KEPT)).molecules;
    doc = {
      ...doc,
      texts: [{ id: 1, name: "out.log", text: "...", of: { molecule: first } }],
      molecules3d: doc.molecules3d!.map((m) => (m.id === first ? { ...m, drawnFrom: [7, 8, 9] } : m)),
    };
    const held = heldSettled(connect(doc, { set: KEPT }, ENERGY), undefined, extentOf);
    const back = heldSettled(removeWire(held, held.wires![0].id), held, extentOf);
    const named = back.texts![0].of as { molecule: number };
    expect(back.molecules3d!.find((m) => m.id === named.molecule)?.drawnFrom).toEqual([7, 8, 9]);
  });

  it("is filled by its step's run off the page, however few it is given - 1, 50 or 51 - its frame where it was", () => {
    for (const n of [1, 50, 51]) {
      const doc = heldSettled(connect(page(), { set: KEPT }, ENERGY), undefined, extentOf);
      const frame = setOf(doc, KEPT);
      const ran = placeResults(doc, doc.steps![0], molecules(Array.from({ length: n }, (_, k) => water(k))), W);
      const set = setOf(ran, KEPT);
      expect([ran.molecules3d!.length, set.collection!.length, set.members, set.x0, set.y1]).toEqual([0, n, [], frame.x0, frame.y1]);
    }
  });

  it("lies nowhere on the page: where another set goes is the same wherever its frame was, a box takes it only with its step, a selection's set does not see it", () => {
    const doc = heldSettled(connect(page(), { set: KEPT }, ENERGY), undefined, extentOf);
    const set = setOf(doc, KEPT);
    // (its frame moved far off: whether a frame where it was is clear, the same - the wire from its port there either way)
    const away = { ...doc, sets: doc.sets!.map((b) => (b.id === KEPT ? { ...b, x0: b.x0 + 1e5, x1: b.x1 + 1e5 } : b)) };
    for (const f of [{ x0: set.x0, x1: set.x1, y0: set.y0, y1: set.y1 }, { x0: set.x0, x1: set.x1, y0: set.y0 - 40, y1: set.y0 - 20 }]) expect(clearOf(doc, f, { set: -1 })).toBe(clearOf(away, f, { set: -1 }));
    // (a set on the page there, its frame in the way)
    const shown = { ...doc, sets: doc.sets!.map((b) => (b.id === KEPT ? { ...b, opened: true as const } : b)) };
    expect(clearOf(shown, { x0: set.x0, x1: set.x1, y0: set.y0, y1: set.y1 }, { set: -1 })).toBe(false);
    expect(setsOnPage(doc, doc.sets!).map((b) => b.id)).not.toContain(KEPT);
    const around = [{ x: set.x0 - 1, y: set.y0 - 1 }, { x: set.x1 + 1, y: set.y1 + 1 }];
    expect(flowIn(doc, "box", around).sets).not.toContain(KEPT);
    const withStep = [{ x: -10, y: set.y0 - 200 }, { x: set.x1 + 1, y: set.y1 + 200 }];
    expect(flowIn(doc, "box", withStep)).toMatchObject({ sets: expect.arrayContaining([KEPT]), steps: expect.arrayContaining([1]) });
  });

  it("gives its wires from its exit's port on the card, a set the chemist made from its frame", () => {
    const doc = heldSettled(connect(page(), { set: KEPT }, ENERGY), undefined, extentOf);
    const step = doc.steps![0];
    expect(wireStart(doc.steps!, setOf(doc, KEPT))).toEqual(stepGives(step, exitPlace(step.kind, "out")));
    const chemist = addSet(doc, { x0: -40, y0: -40, x1: -30, y1: -30 });
    const last = chemist.sets![chemist.sets!.length - 1];
    expect(wireStart(chemist.steps!, last)).toEqual(setGives(last));
  });

  it("is laid out once opened, and held again once closed", () => {
    const held = heldSettled(connect(page(), { set: KEPT }, ENERGY), undefined, extentOf);
    const open = (doc: WorkspaceDocument, on: boolean) => ({ ...doc, sets: doc.sets!.map((b) => (b.id === KEPT ? (({ opened: _o, ...rest }) => (on ? { ...rest, opened: true as const } : rest))(b) : b)) });
    const opened = heldSettled(open(held, true), held, extentOf);
    expect(setMolecules(opened, setOf(opened, KEPT)).every((m) => m.id > 0)).toBe(true);
    const closed = heldSettled(open(opened, false), opened, extentOf);
    expect([closed.molecules3d, setOf(closed, KEPT).collection!.length]).toEqual([[], 2]);
  });

  it("is laid out as the step it went into is deleted, its wire with it - and as its own step is, a chemist's set from then on", () => {
    const held = heldSettled(connect(page(), { set: KEPT }, ENERGY), undefined, extentOf);
    const intoGone = heldSettled(removeStep(held, ENERGY), held, extentOf);
    expect(setMembers(intoGone, setOf(intoGone, KEPT)).molecules).toHaveLength(2);
    const ownGone = heldSettled(removeStep(held, 1), held, extentOf);
    const kept = setOf(ownGone, KEPT);
    expect([kept.made, setMembers(ownGone, kept).molecules.length]).toEqual([undefined, 2]);
  });

  it("is saved held - its molecules once, in it, never also on the page; its ids on the page this session's only - and opens held, opened kept", () => {
    const save = (doc: WorkspaceDocument) => {
      const d = createWorkspaceDocument();
      const store = createEditorStore(d);
      connectStoreToDocument(store, d);
      d.edit("as it was", () => doc);
      return workspaceText(store.getState());
    };
    const moleculesIn = (text: string) => {
      const json = JSON.parse(text) as { molecules3d?: unknown[]; sets?: { collection?: unknown[] }[] };
      return (json.molecules3d?.length ?? 0) + (json.sets ?? []).reduce((n, b) => n + (b.collection?.length ?? 0), 0);
    };
    const shown = page();
    const held = heldSettled(connect(shown, { set: KEPT }, ENERGY), undefined, extentOf);
    const text = save(held);
    expect([moleculesIn(save(shown)), moleculesIn(text)]).toEqual([2, 2]);
    expect(text).not.toContain("heldIds");
    const ws = readWorkspace(text)!;
    expect(ws.workflow!.sets.find((b) => b.id === KEPT)!.collection).toHaveLength(2);
    const opened = heldSettled({ ...held, sets: held.sets!.map((b) => (b.id === KEPT ? { ...b, opened: true as const } : b)) }, held, extentOf);
    expect(readWorkspace(save(opened))!.workflow!.sets.find((b) => b.id === KEPT)!.opened).toBe(true);
  });

  it("not held, lays out what a run would: the shown structures of a large set deleted, the next come on in that edit's own step - one undo, all as it was", () => {
    let start = addStep(emptyWorkspaceDocument(), "check-structures", 0, 0);
    start = placeResults(start, start.steps![0], drawn(Array.from({ length: 53 }, (_, k) => ethanol(1 + 10 * k))), W);
    const out = resultOf(start, 1)!.id;
    const shown = setMembers(start, setOf(start, out)).structures;
    const rest = setOf(start, out).drawnCollection!.length;
    expect([shown.length > 0, rest > 0, shown.length + rest]).toEqual([true, true, 53]);
    const d = documented(start);
    d.edit("delete", (s) => withoutAtoms(s, shown.flat()));
    const after = setOf(d.getState(), out);
    expect([setMembers(d.getState(), after).structures.length, after.drawnCollection?.length ?? 0]).toEqual([rest, 0]);
    d.undo();
    expect([setMembers(d.getState(), setOf(d.getState(), out)).structures, setOf(d.getState(), out).drawnCollection!.length]).toEqual([shown, rest]);
  });

  it("holds nothing more where it is held already - each edit after it leaves it as it is", () => {
    const held = heldSettled(connect(page(), { set: KEPT }, ENERGY), undefined, extentOf);
    expect(heldOff(held, KEPT)).toBe(held);
    expect(heldSettled({ ...held, sets: [...held.sets!] }, held, extentOf).sets!.find((b) => b.id === KEPT)).toBe(setOf(held, KEPT));
  });
});
