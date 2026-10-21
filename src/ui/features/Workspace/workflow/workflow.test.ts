import { afterEach, describe, expect, it } from "vitest";
import { useReaders } from "../../../../lib/calc/workers";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { connectStoreToDocument, createEditorStore } from "../store";
import { addMolecule3d, createWorkspaceDocument, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { setMembers, countOf, setEntries, holdsOf } from "./entries";
import { canWire, givesOf, inputKey, inputOf, resultOf, stateOf, stepsBefore } from "./flow";
import { keptApart, pushTo, runMeno, runMenoInTurns } from "./meno";
import { boltzmann } from "../../../../lib/boltzmann";
import { factor } from "../../../../lib/units";

const KCAL_PER_HARTREE = factor("Eh", "kcal/mol");
import { rmsd } from "./rmsd";
import { addSet, addStep, connect, fitSets, moveSet, removeSet, removeStep, removeWire, resizeSet, updateStep } from "./model";
import { energiesBy, laidOver, placeResults, runStep, type RunWith } from "./run";
import { offeredSteps } from "./offered";
import { doerOf } from "./doers";
import { pluginById } from "../../../../lib/calc/catalog";
import { populations } from "../utils/molecule3d";
import { selectionFrame } from "./selectionSet";
import { readWorkflow } from "./saved";
import { measured } from "../../../../testing/timeouts";

/** Three atoms, bent, at `at` on the page: frame k opened out by k * `step` ångströms, with energies `e` (hartrees). */
function bent(at: { x: number; y: number }, n = 1, e?: number[], step = 0.4, el = "O"): Omit<Molecule3D, "id"> {
  const geo = (k: number) => [0, 0, 0, 1, 0, 0, -0.3, 0.95 + k * step, 0];
  const atoms = [0, 1, 2].map((i) => ({ el: i === 0 ? el : "H", x: geo(0)[3 * i], y: geo(0)[3 * i + 1], z: geo(0)[3 * i + 2] }));
  return {
    atoms,
    bonds: [{ a1: 0, a2: 1, order: 1 }, { a1: 0, a2: 2, order: 1 }],
    at,
    ...(n > 1 ? { frames: Array.from({ length: n - 1 }, (_, k) => geo(k + 1)) } : {}),
    ...(e ? { energies: e } : {}),
  };
}

const kcal = (k: number) => k / KCAL_PER_HARTREE;
const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };

/** A page with one molecule of five frames - energies 0, 0.5, 2, 4 and 0.5 kcal/mol above -76 - in a set: set 1. */
function page(): WorkspaceDocument {
  let doc = addMolecule3d(emptyWorkspaceDocument(), bent({ x: 0, y: 0 }, 5, [0, 0.5, 2, 4, 0.5].map((k) => -76 + kcal(k))));
  doc = addSet(doc, { x0: -3, y0: -3, x1: 3, y1: 3 });
  return doc;
}

describe("what a set holds", () => {
  it("is what lies inside its frame, in the order it lies", () => {
    let doc = addMolecule3d(emptyWorkspaceDocument(), bent({ x: 4, y: 0 }));
    doc = addMolecule3d(doc, bent({ x: 0, y: 5 }));
    doc = addMolecule3d(doc, bent({ x: 20, y: 0 }));
    doc = addSet(doc, { x0: -2, y0: -2, x1: 6, y1: 7 });
    const set = doc.sets![0];
    // (the one higher on the page first; the one outside left out)
    expect(setMembers(doc, set).molecules).toEqual([2, 1]);
    expect(holdsOf(doc, set)).toBe("molecules");
    expect(countOf(doc, set)).toEqual({ holds: "molecules", entries: 2, compounds: 2 });
  });

  it("is one compound's conformers where a molecule's frames are a conformer search's - a file's many geometries many compounds", () => {
    // (a molecule made by 3D structures: its frames conformers, as it says)
    let doc = addMolecule3d(emptyWorkspaceDocument(), { ...bent({ x: 0, y: 0 }, 6), conformerSet: true });
    doc = addSet(doc, { x0: -2, y0: -2, x1: 2, y1: 2 });
    expect(holdsOf(doc, doc.sets![0])).toBe("conformers");
    expect(countOf(doc, doc.sets![0])).toEqual({ holds: "conformers", entries: 6, compounds: 1 });
    // (a file's: each frame a compound of its own)
    let file = addMolecule3d(emptyWorkspaceDocument(), bent({ x: 0, y: 0 }, 6));
    file = addSet(file, { x0: -2, y0: -2, x1: 2, y1: 2 });
    expect(countOf(file, file.sets![0])).toEqual({ holds: "molecules", entries: 6, compounds: 6 });
    // (one conformer alone says nothing of a set)
    let one = addMolecule3d(emptyWorkspaceDocument(), { ...bent({ x: 0, y: 0 }, 1), conformerSet: true });
    one = addSet(one, { x0: -2, y0: -2, x1: 2, y1: 2 });
    expect(holdsOf(one, one.sets![0])).toBe("molecules");
  });

  it("is a set of structures where any is drawn in it", () => {
    let doc = emptyWorkspaceDocument();
    doc = { ...doc, model: { atoms: [{ id: 1, el: "C", x: 0, y: 0, r: 0.9 } as never], bonds: [] }, nextId: 2 };
    doc = addMolecule3d(doc, bent({ x: 1, y: 0 }));
    doc = addSet(doc, { x0: -2, y0: -2, x1: 2, y1: 2 });
    expect(holdsOf(doc, doc.sets![0])).toBe("structures");
  });

  it("goes with it when its set is moved", () => {
    const doc = moveSet(page(), 1, 10, -2);
    expect(doc.sets![0]).toMatchObject({ x0: 7, x1: 13, y0: -5, y1: 1 });
    expect(doc.molecules3d![0].at).toMatchObject({ x: 10, y: -2 });
  });

  it("stays where it is when its set is deleted", () => {
    const doc = removeSet(page(), 1);
    expect(doc.sets).toEqual([]);
    expect(doc.molecules3d).toHaveLength(1);
  });

  it("grows to keep a structure drawn on in it inside it - not one moved whole, nor where the frame is made smaller", () => {
    const doc = createWorkspaceDocument();
    const drawn: WorkspaceDocument["model"] = { atoms: [{ id: 1, x: 0, y: 0, r: 0.9, el: "C" }, { id: 2, x: 1.5, y: 0, r: 0.9, el: "C" }], bonds: [{ id: 1, a: 1, b: 2, order: 1 }] };
    doc.edit("draw", (d) => addSet({ ...d, model: drawn, nextId: 3 }, { x0: -1, y0: -1, x1: 2.5, y1: 2 }));
    const frame = () => {
      const { x0, y0, x1, y1 } = doc.getState().sets![0];
      return { x0, y0, x1, y1 };
    };
    // an O drawn on, past the right edge: the frame takes it in, its label and all
    doc.edit("draw on", (d) => ({ ...d, model: { atoms: [...d.model.atoms, { id: 3, x: 3, y: 0.9, r: 0.9, el: "O" }], bonds: [...d.model.bonds, { id: 2, a: 2, b: 3, order: 1 }] }, nextId: 4 }));
    expect(frame().x1).toBeGreaterThan(3);
    expect(frame().x0).toBe(-1);
    // one step to undo
    doc.undo();
    expect(frame()).toEqual({ x0: -1, y0: -1, x1: 2.5, y1: 2 });
    // moved whole, across its edge: it is dragged out, the frame stays
    doc.edit("move", (d) => ({ ...d, model: { ...d.model, atoms: d.model.atoms.map((a) => ({ ...a, x: a.x + 1 })) } }));
    expect(frame()).toEqual({ x0: -1, y0: -1, x1: 2.5, y1: 2 });
    // made smaller than what it holds: as it was made
    doc.edit("size", (d) => resizeSet(d, 1, { x0: 0, y0: -0.5, x1: 1.5, y1: 1 }));
    expect(frame()).toEqual({ x0: 0, y0: -0.5, x1: 1.5, y1: 1 });
  });

  it("on a page of a thousand structures, is what it is on a page of one - its structures found once for the page, whichever set asks", () => {
    // (chains of seven atoms, forty to a row - their ids the other way round from the order they lie)
    const chains: number[][] = [];
    const drawn: WorkspaceDocument["model"] = { atoms: [], bonds: [] };
    for (let k = 0; k < 1000; k++) {
      const ids = [0, 1, 2, 3, 4, 5, 6].map((i) => 7000 - 7 * k - i);
      ids.forEach((id, i) => drawn.atoms.push({ id, x: (k % 40) * 12 + i * 1.3, y: -Math.floor(k / 40) * 3 + (i % 2) * 0.75, r: 0.9, el: "C" }));
      ids.slice(1).forEach((id, i) => drawn.bonds.push({ id: 7 * k + i + 1, a: ids[i], b: id, order: 1 }));
      chains.push(ids);
    }
    const sorted = (s: number[][]) => s.map((ids) => [...ids].sort((a, b) => a - b));
    const all = { x0: -2, y0: -80, x1: 480, y1: 2 };
    const left = { x0: -2, y0: -80, x1: 238, y1: 2 };
    const page = { ...emptyWorkspaceDocument(), model: drawn };
    // in the order they lie: row by row, each left to right
    expect(sorted(setMembers(page, all).structures)).toEqual(sorted(chains));
    expect(sorted(setMembers(page, left).structures)).toEqual(sorted(chains.filter((_, k) => k % 40 < 20)));
    // the last chain's end drawn on past the frame's right edge: it grows as it would for that chain alone
    const moved = (model: WorkspaceDocument["model"]) => ({ ...model, atoms: model.atoms.map((a) => (a.id === 1 ? { ...a, x: a.x + 5 } : a)) });
    const before = addSet(page, all);
    const grown = fitSets({ ...before, model: moved(before.model) }, before);
    const last = new Set(chains[999]);
    const alone = addSet({ ...page, model: { atoms: drawn.atoms.filter((a) => last.has(a.id)), bonds: drawn.bonds.filter((b) => last.has(b.a)) } }, all);
    const grownAlone = fitSets({ ...alone, model: moved(alone.model) }, alone);
    expect(grown.sets![0].x1).toBeGreaterThan(all.x1);
    // (their frames: what each holds is its own - a thousand structures against one)
    const frame = (s: WorkspaceDocument["sets"]) => s!.map(({ x0, y0, x1, y1 }) => ({ x0, y0, x1, y1 }));
    expect(frame(grown.sets)).toEqual(frame(grownAlone.sets));
    // (the very same structures for every set asking of the page: found once, not again for each set)
    const everything = setMembers(page, all).structures;
    expect(setMembers(page, left).structures.every((ids) => everything.includes(ids))).toBe(true);
  });

  it("finds a drawing's structures once for every set asking, and again only once it is drawn on", () => {
    const drawn: WorkspaceDocument["model"] = {
      atoms: [0, 1, 2, 3].map((i) => ({ id: i + 1, x: i * 1.3, y: 0, r: 0.9, el: "C" })),
      bonds: [1, 2, 3].map((i) => ({ id: 10 + i, a: i, b: i + 1, order: 1 as const })),
    };
    const page = { ...emptyWorkspaceDocument(), model: drawn };
    const one = setMembers(page, { x0: -2, y0: -2, x1: 6, y1: 2 }).structures[0];
    const other = setMembers(page, { x0: -1, y0: -1, x1: 5, y1: 1 }).structures[0];
    // (the very same structure, found once for the two sets)
    expect(other).toBe(one);
    const changed = { ...page, model: { ...drawn, atoms: drawn.atoms.map((a) => ({ ...a })) } };
    expect(setMembers(changed, { x0: -2, y0: -2, x1: 6, y1: 2 }).structures[0]).not.toBe(one);
  });

  it("is a compound per frame, unless it is a conformer set", () => {
    const m = { ...bent({ x: 0, y: 0 }, 3), id: 1 };
    expect(setEntries([m], "molecules").map((e) => [e.compound, e.number])).toEqual([[0, 1], [1, 1], [2, 1]]);
    expect(setEntries([m], "conformers").map((e) => [e.compound, e.number])).toEqual([[0, 1], [0, 2], [0, 3]]);
  });
});

describe("wires", () => {
  it("join what a port gives to a step that takes it, and nothing else", () => {
    let doc = addStep(page(), "energy-window", 5, 0);
    doc = addStep(doc, "as-conformers", 5, 5);
    // (a compound set does not go into an energy window: As conformers goes between)
    expect(canWire(doc, { set: 1 }, 2)).toBe(false);
    expect(connect(doc, { set: 1 }, 2)).toBe(doc);
    expect(canWire(doc, { set: 1 }, 3)).toBe(true);
    doc = connect(doc, { set: 1 }, 3);
    expect(givesOf(doc, { step: 3 })).toBe("conformers");
    doc = connect(doc, { step: 3 }, 2);
    expect(doc.wires!.map((w) => [w.from, w.to])).toEqual([[{ set: 1 }, 3], [{ step: 3 }, 2]]);
    expect(stepsBefore(doc, 2)).toEqual([3]);
    // (no loop)
    expect(canWire(doc, { step: 2 }, 3)).toBe(false);
  });

  it("into a step replace the one it had; deleted, go", () => {
    let doc = addStep(page(), "duplicates", 5, 0);
    doc = addSet(doc, { x0: 30, y0: 0, x1: 31, y1: 1 });
    doc = connect(doc, { set: 1 }, 2);
    doc = connect(doc, { set: 3 }, 2);
    expect(doc.wires!.map((w) => w.from)).toEqual([{ set: 3 }]);
    doc = removeWire(doc, doc.wires![0].id);
    expect(doc.wires).toEqual([]);
  });

  it("go with the step they join", () => {
    let doc = addStep(page(), "as-conformers", 5, 0);
    doc = connect(doc, { set: 1 }, 2);
    doc = runStep(doc, 2, W);
    expect(resultOf(doc, 2)).toBeTruthy();
    doc = removeStep(doc, 2);
    expect(doc.wires).toEqual([]);
    // (what it made stays, a set like any the chemist drew - of conformers still, as its molecule's frames are a conformer search's)
    expect(doc.sets).toHaveLength(2);
    expect(doc.sets![1].made).toBeUndefined();
    expect(holdsOf(doc, doc.sets![1])).toBe("conformers");
  });
});

describe("Meno's own steps", () => {
  it("group entries in place - each group the same one as it grows, never a copy for each entry", () => {
    const groups = new Map<number, number[]>();
    for (let i = 0; i < 2; i++) pushTo(groups, i % 2, i);
    const even = groups.get(0);
    for (let i = 2; i < 6; i++) expect(pushTo(groups, i % 2, i)).toBe(groups);
    expect(groups.get(0)).toBe(even);
    expect([...groups.entries()]).toEqual([[0, [0, 2, 4]], [1, [1, 3, 5]]]);
    // (one compound's 20,000 conformers: each step once copied its group for every entry, and took seconds)
    const one = setEntries([{ ...bent({ x: 0, y: 0 }, 2, [-76, -76.001]), id: 1, conformerSet: true }], "conformers");
    const many = Array.from({ length: 20_000 }, (_, k) => ({ ...one[k % 2], number: k + 1, energy: -76 + (k % 97) * 1e-4 }));
    for (const kind of ["populations", "choose", "energy-window"] as const) expect(runMeno(kind, many, "conformers", kind === "energy-window" ? { window: 3 } : undefined).ok).toBe(true);
  });

  /** `count` conformers of a chain of twelve atoms, each its atoms shaken by up to `shake` Å from the chain's places - by a fixed sequence, the same each run. */
  const shaken = (count: number, shake: number) => {
    let seed = 7;
    const next = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const chain = Array.from({ length: 12 }, (_, i) => [1.25 * i, (i % 2) * 0.85, 0]);
    const one = setEntries([{ ...bent({ x: 0, y: 0 }, 2), id: 1, conformerSet: true }], "conformers")[0];
    return Array.from({ length: count }, (_, k) => ({
      ...one,
      atoms: chain.map(() => ({ ...one.atoms[0], el: "C" })),
      number: k + 1,
      energy: -100 + k * 1e-5,
      xyz: chain.flatMap((p) => p.map((v) => v + shake * next())),
    }));
  };

  it("keep in Duplicates what laying each over every one kept would keep", () => {
    // (two hundred conformers, each also there again a hair away: half alike)
    const some = shaken(200, 0.6);
    const order = some.flatMap((e) => [e, { ...e, xyz: e.xyz.map((v, i) => v + (i % 3 === 0 ? 0.01 : 0)) }]);
    const plainly: typeof order = [];
    for (const e of order) if (!plainly.some((k) => rmsd(k.xyz, e.xyz) <= 0.125)) plainly.push(e);
    expect(keptApart(order, 0.125)).toEqual(plainly);
    expect(plainly).toHaveLength(200);
  });

  it("do Duplicates in turns that let the page go on, saying how far they are - and keep what doing it at once keeps", async () => {
    // (three thousand conformers, each there again a hair away)
    const some = shaken(1_500, 0.6);
    const order = some.flatMap((e) => [e, { ...e, xyz: e.xyz.map((v, i) => v + (i % 3 === 0 ? 0.01 : 0)) }]);
    const done: number[] = [];
    let pauses = 0;
    // (a clock that goes on a millisecond each time it is read: a turn over every few entries)
    let clock = 0;
    const now = () => clock++;
    const out = await runMenoInTurns("duplicates", order, "conformers", undefined, undefined, { onDone: (n) => done.push(n), pause: async () => void pauses++, slice: 20, tell: 100, now });
    expect(pauses).toBeGreaterThan(10);
    const quick = pauses;
    // (said far less often than the turns: at most every hundred of the clock's milliseconds)
    expect(done.length).toBeGreaterThan(1);
    expect(done.length).toBeLessThan(pauses / 2);
    // (further each turn, and never all of it before the last)
    expect(done.every((n, i) => n > (done[i - 1] ?? 0) && n < order.length)).toBe(true);
    expect(out).toEqual(runMeno("duplicates", order, "conformers"));
    expect(out?.ok && out.kept).toHaveLength(1_500);
    // (the other steps, done at once)
    pauses = 0;
    await runMenoInTurns("populations", order, "conformers", undefined, undefined, { pause: async () => void pauses++, slice: 0 });
    expect(pauses).toBe(0);
    // (the page's own turns long - ten of the clock's milliseconds each: the slices four times as long, and so a quarter as many)
    let slow = 0;
    clock = 0;
    await runMenoInTurns("duplicates", order, "conformers", undefined, undefined, { pause: async () => void ((clock += 10), slow++), slice: 20, now });
    expect(slow).toBeLessThan(quick / 1.5);
    // (stopped: given up at the next turn, nothing kept)
    pauses = 0;
    expect(await runMenoInTurns("duplicates", order, "conformers", undefined, undefined, { pause: async () => void pauses++, slice: 20, now, stopped: () => pauses >= 2 })).toBeNull();
    expect(pauses).toBe(2);
  }, measured(390));

  it("lay a conformer in Duplicates over only those kept that could be alike - two thousand distinct ones, not each over every other", () => {
    const many = shaken(2_000, 0.6);
    let laid = 0;
    const kept = keptApart(many, 0.125, (p, q) => (laid++, rmsd(p, q)));
    expect(kept).toHaveLength(2_000);
    // (every one over every one kept before it: 1,999,000 - counted, not timed: a busy machine is slow, not wrong)
    expect(laid).toBeLessThan(20_000);
  });

  const entries = (m: Omit<Molecule3D, "id">, set: "molecules" | "conformers") => setEntries([{ ...m, id: 1 }], set);

  it("make a compound set a conformer set by constitution", () => {
    const water = setEntries([{ ...bent({ x: 0, y: 0 }, 2), id: 1 }], "molecules");
    const sulfane = setEntries([{ ...bent({ x: 0, y: 0 }, 1, undefined, 0.4, "S"), id: 2 }], "molecules").map((e) => ({ ...e, compound: 2 }));
    const out = runMeno("as-conformers", [...water, ...sulfane], "molecules");
    expect(out.ok && out.holds).toBe("conformers");
    expect(out.ok && out.kept.map((e) => [e.compound, e.number])).toEqual([[0, 1], [0, 2], [1, 1]]);
    expect(out.said).toBe("2 compounds · 3");
  });

  it("keep each compound's conformers within the window", () => {
    const out = runMeno("energy-window", entries(bent({ x: 0, y: 0 }, 4, [0, 1, 2.9, 3.1].map(kcal)), "conformers"), "conformers", { window: 3 });
    expect(out.ok && out.kept.map((e) => e.number)).toEqual([1, 2, 3]);
    expect(out.ok && out.aside.map((e) => e.number)).toEqual([4]);
    expect(out.said).toBe("3 of 4 kept");
  });

  it("need energies for a window and for populations", () => {
    const set = entries(bent({ x: 0, y: 0 }, 2), "conformers");
    expect(runMeno("energy-window", set, "conformers")).toEqual({ ok: false, said: "Not every entry has an energy" });
    expect(runMeno("populations", set, "conformers").ok).toBe(false);
  });

  it("set aside entries alike, keeping the lower in energy", () => {
    // frames 1 and 2 0.01 Å apart; frame 3 far from both
    const m = bent({ x: 0, y: 0 }, 3, [kcal(1), 0, kcal(2)], 0.01);
    m.frames![1] = [0, 0, 0, 1, 0, 0, -0.3, 2, 0];
    const out = runMeno("duplicates", entries(m, "conformers"), "conformers", { rmsd: 0.125 });
    expect(out.ok && out.kept.map((e) => e.number)).toEqual([2, 3]);
    expect(out.ok && out.aside.map((e) => e.number)).toEqual([1]);
  });

  it("never take entries of different charge or spin for one compound, nor set one aside as alike to another", () => {
    // (water, and its radical cation in the very same shape)
    const water = setEntries([{ ...bent({ x: 0, y: 0 }), id: 1 }], "molecules");
    const cation = setEntries([{ ...bent({ x: 0, y: 0 }), id: 2 }], "molecules").map((e) => ({
      ...e,
      compound: 1,
      atoms: e.atoms.map((a, i) => (i === 0 ? { ...a, charge: 1 } : a)),
    }));
    const both = runMeno("as-conformers", [...water, ...cation], "molecules");
    expect(both.ok && both.kept.map((e) => [e.compound, e.number])).toEqual([[0, 1], [1, 1]]);
    const kept = runMeno("duplicates", [...water, ...cation], "molecules", { rmsd: 0.125 });
    expect(kept.ok && kept.kept).toHaveLength(2);
    // (in a conformer set too, whatever compound each is said to be)
    const one = [...water, ...cation].map((e, i) => ({ ...e, compound: 0, number: i + 1 }));
    const conformers = runMeno("duplicates", one, "conformers", { rmsd: 0.125 });
    expect(conformers.ok && conformers.kept).toHaveLength(2);
  });

  it("choose one conformer of each compound on purpose - its lowest, or one by its number - and set the rest aside", () => {
    const set = entries(bent({ x: 0, y: 0 }, 3, [kcal(2), 0, kcal(1)]), "conformers");
    const lowest = runMeno("choose", set, "conformers", undefined, "RDKit · MMFF94");
    expect(lowest.ok && lowest.holds).toBe("molecules");
    expect(lowest.ok && lowest.kept.map((e) => [e.compound, e.number])).toEqual([[0, 2]]);
    expect(lowest.ok && lowest.aside.map((e) => e.number)).toEqual([1, 3]);
    // (it says which, of how many, and what the energies it ranked by are)
    expect(lowest.said).toBe("#2 of 3, lowest · RDKit · MMFF94");
    const third = runMeno("choose", set, "conformers", { which: "number", number: 3 });
    expect(third.ok && third.kept.map((e) => e.number)).toEqual([3]);
    expect(third.said).toBe("#3 of 3, chosen");
    expect(runMeno("choose", set, "conformers", { which: "number", number: 7 })).toEqual({ ok: false, said: "a has no conformer 7" });
    expect(runMeno("choose", entries(bent({ x: 0, y: 0 }, 2), "conformers"), "conformers")).toEqual({ ok: false, said: "Not every entry has an energy" });
  });

  it("say what the energies they rank by are: the calculation that worked them out", () => {
    expect(energiesBy([{ energies: [-1], calc: { readers: [], program: "xtb", method: "GFN2-xTB" } }])).toBe("xtb · GFN2-xTB");
    expect(energiesBy([{ energies: [-1], calc: { readers: [], program: "ORCA", method: "B3LYP", basis: "def2-SVP" } }])).toBe("ORCA · B3LYP/def2-SVP");
    expect(energiesBy([{ energies: [-1] }])).toBeUndefined();
  });

  it("find each conformer's population at the temperature asked", () => {
    const out = runMeno("populations", entries(bent({ x: 0, y: 0 }, 2, [0, kcal(1)]), "conformers"), "conformers", { temperature: 298.15 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.shares![0] + out.shares![1]).toBeCloseTo(1, 10);
    // exp(-1 kcal/mol / RT) at 298.15 K: 0.1849
    expect(out.shares![1] / out.shares![0]).toBeCloseTo(0.1849, 3);
    const hot = boltzmann([0, kcal(1)], 1000);
    expect(hot[1]).toBeGreaterThan(out.shares![1]);
  });

  it("count each conformer's rotamers in, where its search said how many - as CREST's own weights do", () => {
    // (n-butane by GFN-FF, as CREST 2.12 found it: anti, and gauche 0.4527 kcal/mol above, found twice alike; CREGEN's weights 0.51759 and 0.48241)
    const crest = [0.51759, 0.48241];
    // (to 3e-4: the energies here are CREST's own, rounded as it prints them)
    const near = (got: number[]) => got.forEach((p, i) => expect(Math.abs(p - crest[i])).toBeLessThan(3e-4));
    near(boltzmann([0, kcal(0.4527)], 298.15, [1, 2]));
    // (counted once each, the gauche form's share is half as much)
    expect(boltzmann([0, kcal(0.4527)], 298.15)[1]).toBeCloseTo(0.318, 3);
    // a Populations step over CREST's conformers counts them in too: its shares, CREST's
    const m = { ...bent({ x: 0, y: 0 }, 2, [0, kcal(0.4527)]), conformerSet: true, degeneracies: [1, 2] };
    const out = runMeno("populations", entries(m, "conformers"), "conformers", { temperature: 298.15 });
    if (!out.ok) throw new Error(out.said);
    near(out.shares!);
    // (and the canvas's own shares, where no step found them)
    near(populations(m.energies!, m.degeneracies));
  });

  it("give no populations at 0 K or below - none to give, rather than NaN or the highest energy the most", () => {
    for (const temperature of [0, -5]) {
      const out = runMeno("populations", entries(bent({ x: 0, y: 0 }, 2, [0, kcal(1)]), "conformers"), "conformers", { temperature });
      expect(out.ok).toBe(false);
    }
  });

  it("give shares of a long run of energies - three hundred thousand - without overrunning the stack", () => {
    const many = Array.from({ length: 300_000 }, (_, i) => kcal(i % 7));
    const w = boltzmann(many, 298.15);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(w[0]).toBeGreaterThan(w[1]);
  });
});

describe("running", () => {
  /** set 1 → As conformers (2) → Energy window (3), 1 kcal/mol. */
  function chain(): WorkspaceDocument {
    let doc = addStep(page(), "as-conformers", 5, 0);
    doc = addStep(doc, "energy-window", 20, 0, { window: 1 });
    doc = connect(doc, { set: 1 }, 2);
    return connect(doc, { step: 2 }, 3);
  }

  it("runs the steps before a step first, each making its result set", () => {
    const doc = runStep(chain(), 3, W);
    const by = () => "meno";
    expect(stateOf(doc, doc.steps![0], by())).toBe("done");
    expect(stateOf(doc, doc.steps![1], by())).toBe("done");
    expect(doc.steps![1].ran).toMatchObject({ ok: true, said: "3 of 5 kept", at: 1000 });
    const made = resultOf(doc, 3)!;
    expect(made.made).toEqual({ step: 3, holds: "conformers" });
    expect(made.aside).toEqual([
      { compound: 0, number: 3, energy: -76 + kcal(2) },
      { compound: 0, number: 4, energy: -76 + kcal(4) },
    ]);
    // a conformer set: one molecule, its conformers in play as frames, numbered as they were
    const input = inputOf({ ...doc, wires: [{ id: 99, from: { set: made.id }, to: 3 }] }, 3)!;
    expect(input.holds).toBe("conformers");
    expect(input.molecules).toHaveLength(1);
    expect(input.molecules[0]).toMatchObject({ conformerSet: true, numbers: [1, 2, 5] });
    // (to the right of its step, clear of it)
    expect(made.x0).toBeGreaterThan(doc.steps![1].x);
  });

  it("says a step has changed when its options, or what comes in, change", () => {
    let doc = runStep(chain(), 3, W);
    doc = updateStep(doc, 3, { options: { window: 5 } });
    expect(stateOf(doc, doc.steps![1], "meno")).toBe("changed");
    const before = doc.molecules3d!.length;
    doc = runStep(doc, 3, W);
    expect(stateOf(doc, doc.steps![1], "meno")).toBe("done");
    expect(doc.steps![1].ran!.said).toBe("5 of 5 kept");
    // (its result set's entries replaced, not added to)
    expect(doc.molecules3d!.length).toBe(before);
    expect(resultOf(doc, 3)!.aside).toBeUndefined();
  });

  it("runs first a step changed however far back, and every step from it on - each on what the one before it gave anew", () => {
    // (… → Energy window (3) → Duplicates → Populations)
    let doc = addStep(addStep(chain(), "duplicates", 35, 0), "populations", 50, 0);
    const [duplicates, populations] = doc.steps!.slice(2).map((s) => s.id);
    doc = connect(connect(doc, { step: 3 }, duplicates), { step: duplicates }, populations);
    doc = runStep(doc, populations, W);
    doc = updateStep(doc, 3, { options: { window: 5 } });
    expect(doc.steps!.map((s) => stateOf(doc, s, "meno"))).toEqual(["done", "changed", "done", "done"]);
    doc = runStep(doc, populations, { ...W, now: 2000 });
    expect(doc.steps!.map((s) => stateOf(doc, s, "meno"))).toEqual(["done", "done", "done", "done"]);
    expect(doc.steps!.map((s) => s.ran!.at)).toEqual([1000, 2000, 2000, 2000]);
  });

  it("says a step has changed when what comes in changes only in a charge", () => {
    let doc = runStep(chain(), 3, W);
    expect(stateOf(doc, doc.steps![0], "meno")).toBe("done");
    const m = doc.molecules3d![0];
    doc = { ...doc, molecules3d: [{ ...m, atoms: m.atoms.map((a, i) => (i === 0 ? { ...a, charge: -1 } : a)) }, ...doc.molecules3d!.slice(1)] };
    expect(stateOf(doc, doc.steps![0], "meno")).toBe("changed");
  });

  it("fails, saying why, where it cannot run", () => {
    let doc = addStep(page(), "energy-window", 5, 0);
    doc = runStep(doc, 2, W);
    expect(doc.steps![0].ran).toMatchObject({ ok: false, said: "Nothing comes into it" });
    doc = connect(addStep(doc, "as-conformers", 5, 9), { set: 1 }, 3);
    doc = runStep(doc, 3, { ...W, byOf: () => "some-plugin" });
    expect(doc.steps![1].ran).toMatchObject({ ok: false, said: "Nothing added does this step" });
  });

  it("keeps a conformer set's entries set aside with it, by number", () => {
    const doc = runStep(chain(), 3, W);
    const made = resultOf(doc, 3)!;
    expect(made.aside!.map((a) => [a.compound, a.number])).toEqual([
      [0, 3],
      [0, 4],
    ]);
  });
});

describe("a step's key, on structures drawn", () => {
  type Drawn = { id: number; el: string; x: number; y: number; r: number };
  const atom = (id: number, el: string, x: number, y: number): Drawn => ({ id, el, x, y, r: 0.9 });
  /** (Z)-but-2-ene, its methyls above the double bond; and CHFClBr, a wedge from C to F: both drawn in one set, wired into a conformer search. */
  function drawn(atoms: Drawn[] = [
    atom(1, "C", -0.5, 0.87),
    atom(2, "C", 0, 0),
    atom(3, "C", 1, 0),
    atom(4, "C", 1.5, 0.87),
    atom(5, "C", 5, 0),
    atom(6, "F", 5, 1),
    atom(7, "Cl", 5.87, -0.5),
    atom(8, "Br", 4.13, -0.5),
  ]): WorkspaceDocument {
    const bonds = [
      { id: 1, a: 1, b: 2, order: 1 },
      { id: 2, a: 2, b: 3, order: 2 },
      { id: 3, a: 3, b: 4, order: 1 },
      { id: 4, a: 5, b: 6, order: 1, stereo: "up" },
      { id: 5, a: 5, b: 7, order: 1 },
      { id: 6, a: 5, b: 8, order: 1 },
    ];
    let doc: WorkspaceDocument = { ...emptyWorkspaceDocument(), model: { atoms: atoms as never, bonds: bonds as never }, nextId: 9 };
    doc = addSet(doc, { x0: -3, y0: -3, x1: 8, y1: 3 });
    doc = addStep(doc, "conformers", 12, 0);
    return connect(doc, { set: 1 }, 2);
  }
  const keyOf = (doc: WorkspaceDocument) => inputKey(doc, doc.steps![0], "rdkit");
  const moved = (doc: WorkspaceDocument, f: (a: Drawn) => Drawn) => ({ ...doc, model: { ...doc.model, atoms: (doc.model.atoms as unknown as Drawn[]).map(f) as never } });

  it("changes with an atom's element", () => {
    const doc = drawn();
    expect(inputOf(doc, 2)!.structures).toHaveLength(2);
    expect(keyOf(moved(doc, (a) => (a.id === 1 ? { ...a, el: "N" } : a)))).not.toBe(keyOf(doc));
  });

  it("changes with an atom moved across a double bond, or a wedged centre's neighbours mirrored - what the drawing says changed", () => {
    const doc = drawn();
    // (a methyl moved below the double bond: E, not Z)
    expect(keyOf(moved(doc, (a) => (a.id === 4 ? { ...a, y: -0.87 } : a)))).not.toBe(keyOf(doc));
    // (Cl and Br swapped round the wedged carbon: its other enantiomer)
    expect(keyOf(moved(doc, (a) => (a.id === 7 ? { ...a, x: 4.13 } : a.id === 8 ? { ...a, x: 5.87 } : a)))).not.toBe(keyOf(doc));
  });

  it("stays the same where the drawing says the same: moved whole, turned, an atom nudged - or the page looked at anew", () => {
    const doc = drawn();
    const key = keyOf(doc);
    expect(keyOf(moved(doc, (a) => ({ ...a, x: a.x + 0.4, y: a.y - 0.3 })))).toBe(key);
    // (each turned a quarter round its own middle)
    const turned = (a: Drawn, cx: number, cy: number) => ({ ...a, x: cx - (a.y - cy), y: cy + (a.x - cx) });
    expect(keyOf(moved(doc, (a) => (a.id <= 4 ? turned(a, 0.5, 0.435) : turned(a, 5, 0))))).toBe(key);
    expect(keyOf(moved(doc, (a) => (a.id === 4 ? { ...a, x: a.x + 0.2, y: a.y - 0.3 } : a)))).toBe(key);
    // (asked again, of the same page: the same)
    expect(keyOf({ ...doc })).toBe(key);
  });
});

describe("saving", () => {
  it("keeps sets, steps and wires as they are, and leaves out what does not read", async () => {
    const { readWorkflow, nextIdAfter } = await import("./saved");
    const doc = runStep(
      connect(addStep(page(), "as-conformers", 5, 0), { set: 1 }, 2),
      2,
      W,
    );
    const saved = JSON.parse(JSON.stringify({ sets: doc.sets, steps: doc.steps, wires: doc.wires }));
    expect(readWorkflow(saved)).toEqual({ sets: doc.sets, steps: doc.steps, wires: doc.wires });
    expect(nextIdAfter(readWorkflow(saved)!)).toBe(doc.nextWorkflowId);
    // a wire into a step not there, a step of a kind Meno does not know, a set made by nothing there
    const odd = readWorkflow({
      sets: [{ id: 1, x0: 2, y0: 2, x1: 0, y1: 0, made: { step: 9, holds: "conformers" } }],
      steps: [{ id: 2, kind: "teleport", x: 0, y: 0 }],
      wires: [{ id: 3, from: { set: 1 }, to: 2 }],
    });
    expect(odd).toEqual({ sets: [{ id: 1, x0: 0, y0: 0, x1: 2, y1: 2 }], steps: [], wires: [] });
    expect(readWorkflow({})).toBeUndefined();
  });

  it("reads back the name a set was given", () => {
    const saved = JSON.parse(JSON.stringify({ sets: [{ id: 1, x0: 0, y0: 0, x1: 2, y1: 2, name: "Ligands" }, { id: 2, x0: 0, y0: 0, x1: 2, y1: 2, name: 7 }] }));
    expect(readWorkflow(saved)!.sets.map((b) => b.name)).toEqual(["Ligands", undefined]);
  });

  it("reads back a step's earlier runs, each with what it gave - a molecule that does not read left out", () => {
    const m = bent({ x: 9, y: 9 });
    const saved = readWorkflow({
      steps: [
        {
          id: 1,
          kind: "optimise",
          x: 0,
          y: 0,
          by: "xtb",
          runs: [
            { at: 5, ok: true, said: "0:04", input: "k", kind: "optimise", options: { method: "gfn1" }, results: { molecules: [m, { atoms: "no" }], aside: [], holds: "molecules" } },
            { at: 4, ok: false, said: "Stopped", input: "k", kind: "teleport" },
          ],
        },
      ],
    })!;
    const runs = saved.steps[0].runs!;
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ kind: "optimise", options: { method: "gfn1" }, results: { holds: "molecules" } });
    expect(runs[0].results!.molecules).toHaveLength(1);
    expect(runs[0].results!.molecules[0]).not.toHaveProperty("at");
  });
});

describe("Quick Add's calculations", () => {
  const offered = (...a: Parameters<typeof offeredSteps>) => offeredSteps(...a).map((g) => [g.name, g.steps.map((k) => k.kind)]);
  afterEach(() => useReaders.setState({ state: {}, problem: {} }));

  it("put down, start with the defaults Settings has for their kind, done by what does them", () => {
    useAppSettings.getState().rememberOptions("step:meno:energy-window", { window: 1.5 });
    try {
      const doc = createWorkspaceDocument();
      const store = createEditorStore(doc);
      connectStoreToDocument(store, doc);
      const id = store.getState().addStep("energy-window", "meno", 0, 0);
      expect(store.getState().steps.find((s) => s.id === id)).toMatchObject({ by: "meno", options: { window: 1.5 } });
    } finally {
      useAppSettings.setState({ options: {} });
    }
  });

  it("are by who does them - each plugin added, then Meno - each with the kinds it fills; As conformers only from a compound set's wire", () => {
    let doc = addStep(page(), "as-conformers", 5, 0);
    doc = connect(doc, { set: 1 }, 2);
    // (no plugin added: Meno's own steps on entries)
    expect(offered(doc)).toEqual([["Meno", ["energy-window", "duplicates", "populations", "choose"]]]);
    // a compound set's wire: what takes it, then the conversion
    expect(offered(doc, { set: 1 })).toEqual([["Meno", ["duplicates", "as-conformers"]]]);
    // a conformer set's
    expect(offered(doc, { step: 2 })).toEqual([["Meno", ["energy-window", "duplicates", "populations", "choose"]]]);
    // plugins added: theirs first, each under its name - and only those that take what a wire carries
    useReaders.setState({ state: { rdkit: "added", xtb: "added" }, problem: {} });
    expect(offered(doc)).toEqual([
      ["RDKit", ["conformers", "duplicates"]],
      ["xTB", ["optimise", "energy", "frequencies"]],
      ["Meno", ["energy-window", "duplicates", "populations", "choose"]],
    ]);
    expect(offered(doc, { set: 1 })).toEqual([
      ["RDKit", ["conformers", "duplicates"]],
      ["xTB", ["optimise", "energy", "frequencies"]],
      ["Meno", ["duplicates", "as-conformers"]],
    ]);
    // a set of structures drawn: a conformer search made from them - RDKit's, not CREST's, which starts from 3D
    doc = addSet({ ...doc, model: { atoms: [{ id: 1, x: 40, y: 0, r: 0.9, el: "C" }, { id: 2, x: 41.5, y: 0, r: 0.9, el: "O" }], bonds: [{ id: 1, a: 1, b: 2, order: 1 }] } }, { x0: 38, y0: -2, x1: 44, y1: 2 });
    const drawn = doc.sets![doc.sets!.length - 1].id;
    useReaders.setState({ state: { rdkit: "added", crest: "added" }, problem: {} });
    expect(offered(doc, { set: drawn }).map(([who, kinds]) => [who, kinds])).toEqual([["RDKit", ["conformers"]]]);
    // an interface to a program installed separately: under the program's name, not the interface's
    useReaders.setState({ state: { orca: "added" }, problem: {} });
    expect(offered(doc)[0]).toEqual(["ORCA", ["optimise", "energy", "frequencies"]]);
    expect(pluginById("orca")?.name).toBe("ORCA interface");
    expect(doerOf({ kind: "energy", by: "orca" })).toEqual({ id: "orca", name: "ORCA" });
  });
});

describe("a workflow's parts in the selection", () => {
  /** A page with a molecule in a set (1), wired (3) into an optimisation (2) - and the store over it. */
  function selecting() {
    const doc = createWorkspaceDocument();
    doc.edit("page", () => connect(addStep(page(), "optimise", 6, 3, { method: "gfn2" }, "xtb"), { set: 1 }, 2));
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    return { doc, st: () => store.getState() };
  }

  it("are taken by Select all, by Ctrl or ⌘ and a click - in, and out again - and let go with the rest", () => {
    const { st } = selecting();
    st().selectAll();
    expect(st().selFlow).toEqual({ sets: new Set([1]), steps: new Set([2]) });
    st().clearSel();
    expect(st().selFlow).toEqual({ sets: new Set(), steps: new Set() });
    st().toggleFlowSel({ step: 2 });
    st().toggleFlowSel({ set: 1 });
    st().toggleFlowSel({ set: 1 });
    expect(st().selFlow).toEqual({ sets: new Set(), steps: new Set([2]) });
  });

  it("are deleted with the rest, as one step to undo - and what was deleted leaves the selection", () => {
    const { doc, st } = selecting();
    st().selectAll();
    st().deleteSelection();
    expect(st().sets).toEqual([]);
    expect(st().steps).toEqual([]);
    expect(st().wires).toEqual([]);
    expect(st().molecules3d).toEqual([]);
    expect(st().selFlow).toEqual({ sets: new Set(), steps: new Set() });
    doc.undo();
    expect(st().steps.map((s) => s.kind)).toEqual(["optimise"]);
    expect(st().wires).toHaveLength(1);
  });

  it("are pasted numbered on, wired as they were, and selected", () => {
    const { st } = selecting();
    const flow = { sets: [{ id: 1, x0: 0, y0: 0, x1: 4, y1: 4 }], steps: [{ id: 2, kind: "energy" as const, x: 6, y: 3, by: "xtb" }], wires: [{ id: 3, from: { set: 1 }, to: 2 }] };
    st().pasteModel({ atoms: [], bonds: [], flow });
    expect(st().sets).toHaveLength(2);
    const step = st().steps.find((s) => s.kind === "energy")!;
    const set = st().sets[1];
    expect(st().wires.some((w) => w.to === step.id && "set" in w.from && w.from.set === set.id)).toBe(true);
    expect(st().selFlow).toEqual({ sets: new Set([set.id]), steps: new Set([step.id]) });
  });
});

describe("the selection as a set", () => {
  it("takes whole structures, not a few atoms of one", () => {
    const model = {
      atoms: [
        { id: 1, el: "C", x: 0, y: 0 },
        { id: 2, el: "C", x: 1.8, y: 0 },
      ] as never[],
      bonds: [{ id: 3, a: 1, b: 2, order: 1 }] as never[],
    };
    const style = {} as never;
    expect(selectionFrame(model, new Set([1]), [], new Set(), style, {}, {})).toBeNull();
    const f = selectionFrame(model, new Set([1, 2]), [], new Set(), style, {}, {})!;
    expect(f.x0).toBeLessThan(0);
    expect(f.x1).toBeGreaterThan(1.8);
    // (room under its tab)
    expect(f.y1 - 0).toBeGreaterThan(0 - f.y0);
  });
});

describe("results laid over what went in", () => {
  const into = (m: Omit<Molecule3D, "id">, id: number) => setEntries([{ ...m, id }], "molecules");

  it("turns each the way that lays it over the entry of its atoms nearest to it - then as that one's molecule is turned", () => {
    const water = bent({ x: 0, y: 0 });
    const more = into(bent({ x: 0, y: 0 }, 2), 7)[1];
    const entries = [...into(water, 4), more, ...into(bent({ x: 0, y: 0 }, 1, undefined, 0.4, "S"), 9)];
    // (water given back turned a half turn about z: its atoms where the half turn takes them)
    const back = { atoms: water.atoms.map((a) => ({ ...a, x: -a.x, y: -a.y })) };
    const [t] = laidOver([back], entries, () => undefined);
    expect(t![0]).toBeCloseTo(0, 6);
    expect(t![1]).toBeCloseTo(0, 6);
    expect(Math.abs(t![2])).toBeCloseTo(1, 6);
    // (as the molecule it came from is turned, after: a turn of its own composed with the half turn)
    const [u] = laidOver([back], entries, (e) => (e.from === 4 ? [1, 0, 0, 0] : undefined));
    expect(u!.map((v) => Math.abs(v))).toEqual([expect.closeTo(0, 6), expect.closeTo(1, 6), expect.closeTo(0, 6), expect.closeTo(0, 6)]);
    // (no entry of its atoms: left as it is)
    expect(laidOver([{ atoms: back.atoms.map((a) => ({ ...a, el: "C" })) }], entries, () => undefined)).toEqual([undefined]);
  });

  it("gives each molecule room as it will be turned", () => {
    let doc = addStep(page(), "optimise", 20, 0);
    doc = connect(doc, { set: 1 }, 2);
    const turns: unknown[] = [];
    const w = { extentOf: (_m: unknown, turn?: unknown) => (turns.push(turn), { x0: -1, x1: 1, y0: -1, y1: 1 }) };
    placeResults(doc, doc.steps![0], { molecules: [bent({ x: 0, y: 0 })], aside: [], holds: "molecules" }, w, [[0, 0, 1, 0]]);
    expect(turns).toEqual([[0, 0, 1, 0]]);
  });
});
