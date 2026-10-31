import { afterEach, describe, expect, it, vi } from "vitest";

// (the plugin that perceives configurations, as the test has it: every molecule here - water, sulfane, their
//  like - has no stereo, which a run asks before As conformers and Populations; workflow/configurations)
vi.mock("./configurations", async (actual) => ({
  ...(await actual<typeof import("./configurations")>()),
  stereoKnown: () => ({ perceived: true, elements: [], key: "none", by: { plugin: "rdkit", version: "0.1.7" } }),
}));
import { useReaders } from "../../../../lib/calc/workers";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { connectStoreToDocument, createEditorStore } from "../store";
import { addMolecule3d, createWorkspaceDocument, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import type { EntryStereo } from "../../../../lib/entry";
import { setMembers, countOf, setEntries, holdsOf, MARKS_UNREAD } from "./entries";
import { canWire, givesOf, inputKey, inputOf, resultOf, stateOf, stepsBefore } from "./flow";
import { keptApart, notAllMinima, pushTo, runMeno, runMenoInTurns, STATE_FINISHED } from "./meno";
import { boltzmann } from "../../../../lib/boltzmann";
import { factor } from "../../../../lib/units";

const KCAL_PER_HARTREE = factor("Eh", "kcal/mol");
import { rmsd } from "./rmsd";
import { addSet, addStep, connect, fitSets, moveSet, removeSet, removeStep, removeWire, resizeSet, updateStep } from "./model";
import { energiesBy, laidOver, placeResults, resultsOf, runStep, type RunWith } from "./run";
import { offeredSteps } from "./offered";
import { inputsOf } from "./kinds";
import { doerOf } from "./doers";
import { pluginById } from "../../../../lib/calc/catalog";
import { populations } from "../utils/molecule3d";
import { chipWide, selectionFrame } from "./selectionSet";
import { STYLE_3D } from "../../../../lib/chem/style3d";
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

/** The step added last. */
const lastStep = (doc: WorkspaceDocument) => doc.steps![doc.steps!.length - 1].id;
/** A step's exit as a wire's end: the set its first exit makes, or the one named. */
const exitSet = (doc: WorkspaceDocument, step: number, exit?: string) => ({ set: resultOf(doc, step, exit)!.id });

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
    // (one conformer found is a conformer set all the same: the maintainer, 2026-10-21)
    let one = addMolecule3d(emptyWorkspaceDocument(), { ...bent({ x: 0, y: 0 }, 1), conformerSet: true });
    one = addSet(one, { x0: -2, y0: -2, x1: 2, y1: 2 });
    expect(holdsOf(one, one.sets![0])).toBe("conformers");
    expect(countOf(one, one.sets![0])).toEqual({ holds: "conformers", entries: 1, compounds: 1 });
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
  it("join what a set gives to a step's input that takes it, and nothing else", () => {
    let doc = addStep(page(), "populations", 5, 0);
    const window = lastStep(doc);
    doc = addStep(doc, "as-conformers", 5, 5);
    const convert = lastStep(doc);
    // (a compound set does not go into Populations: As conformers goes between)
    expect(canWire(doc, { set: 1 }, window)).toBe(false);
    expect(connect(doc, { set: 1 }, window)).toBe(doc);
    expect(canWire(doc, { set: 1 }, convert)).toBe(true);
    doc = connect(doc, { set: 1 }, convert);
    // (what a step's exit gives before it has run: what its kind makes of what comes in)
    expect(givesOf(doc, exitSet(doc, convert))).toBe("conformers");
    doc = connect(doc, exitSet(doc, convert), window);
    expect(doc.wires!.map((w) => [w.from, w.to])).toEqual([
      [{ set: 1 }, { step: convert, port: "in" }],
      [exitSet(doc, convert), { step: window, port: "in" }],
    ]);
    expect(stepsBefore(doc, window)).toEqual([convert]);
    // (no loop)
    expect(canWire(doc, exitSet(doc, window), convert)).toBe(false);
  });

  it("come out of a step's exits, each a set of its own made with the step - not run yet until it runs", () => {
    let doc = addStep(page(), "duplicates", 5, 0);
    const step = lastStep(doc);
    const kept = resultOf(doc, step, "out")!;
    const rest = resultOf(doc, step, "rest")!;
    // (made with the step: which step and exit made it, and nothing it does not know yet - not what it holds)
    expect(kept.made).toEqual({ step, exit: "out" });
    expect(rest.made).toEqual({ step, exit: "rest" });
    // (to the right of the card, the second under the first)
    expect(kept.x0).toBeGreaterThan(doc.steps![0].x);
    expect(rest.y1).toBeLessThan(kept.y0);
    // (what they will give is not known until something comes in - and then it is what comes in)
    expect(givesOf(doc, { set: kept.id })).toBeNull();
    doc = connect(doc, { set: 1 }, step);
    expect(givesOf(doc, { set: kept.id })).toBe("molecules");
    expect(givesOf(doc, { set: rest.id })).toBe("molecules");
    // (an exit's set can be wired on before its step has run)
    doc = addStep(doc, "as-conformers", 30, 0);
    expect(canWire(doc, { set: rest.id }, lastStep(doc))).toBe(true);
  });

  it("into a step replace the one it had; deleted, go", () => {
    let doc = addStep(page(), "duplicates", 5, 0);
    const step = lastStep(doc);
    doc = addSet(doc, { x0: 30, y0: 0, x1: 31, y1: 1 });
    const other = doc.sets![doc.sets!.length - 1].id;
    doc = connect(doc, { set: 1 }, step);
    doc = connect(doc, { set: other }, step);
    expect(doc.wires!.map((w) => w.from)).toEqual([{ set: other }]);
    doc = removeWire(doc, doc.wires![0].id);
    expect(doc.wires).toEqual([]);
  });

  it("go with the step they join", () => {
    let doc = addStep(page(), "as-conformers", 5, 0);
    const step = lastStep(doc);
    doc = connect(doc, { set: 1 }, step);
    doc = runStep(doc, step, W);
    expect(resultOf(doc, step)).toBeTruthy();
    doc = removeStep(doc, step);
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
    expect(out.said).toBe("3 of 4 kept, on electronic energies");
  });

  it("need energies for a window and for populations", () => {
    const set = entries(bent({ x: 0, y: 0 }, 2), "conformers");
    expect(runMeno("energy-window", set, "conformers")).toEqual({ ok: false, said: "Not every entry has an energy" });
    expect(runMeno("populations", set, "conformers").ok).toBe(false);
  });

  it("refuse a window they cannot keep by, saying why, as Populations does a temperature", () => {
    const set = entries(bent({ x: 0, y: 0 }, 2, [0, kcal(1)]), "conformers");
    for (const window of [-1, Number.NaN, Number.POSITIVE_INFINITY]) expect(runMeno("energy-window", set, "conformers", { window })).toEqual({ ok: false, said: "The window must be 0 kcal/mol or more" });
    // (0: the lowest of each compound alone)
    const none = runMeno("energy-window", set, "conformers", { window: 0 });
    expect(none.ok && none.kept.map((e) => e.number)).toEqual([1]);
  });

  it("give no populations where one conformer is no minimum - its calculation judged it has an imaginary frequency - naming it and its frequency", () => {
    // (the correctness lane's methanol saddle point: xtb, -382.63 cm-1, one significant)
    const set = entries(bent({ x: 0, y: 0 }, 3, [0, kcal(1), kcal(2)]), "conformers").map((e, i) => (i === 1 ? { ...e, imaginary: [-382.63] } : e));
    expect(runMeno("populations", set, "conformers", { temperature: 298.15 })).toEqual({ ok: false, said: "a #2 has 1 imaginary frequency, 382.6i cm⁻¹: it is no minimum - take it out first" });
    expect(notAllMinima(set)).toBe("a #2 has 1 imaginary frequency, 382.6i cm⁻¹: it is no minimum - take it out first");
    // (taken out, as the chemist would: given)
    const minima = set.filter((e) => !e.imaginary);
    expect(runMeno("populations", minima, "conformers", { temperature: 298.15 }).ok).toBe(true);
    expect(notAllMinima(minima)).toBeNull();
    // (nor a window, on electronic energies as on free ones: kept or set aside, a saddle point would stand as a conformer it is not)
    expect(runMeno("energy-window", set, "conformers", { window: 3 })).toEqual({ ok: false, said: "a #2 has 1 imaginary frequency, 382.6i cm⁻¹: it is no minimum - take it out first" });
    expect(runMeno("energy-window", minima, "conformers", { window: 3 }).ok).toBe(true);
  });

  it("give no populations, and no window, where one conformer's optimisation did not converge - naming it", () => {
    const set = entries(bent({ x: 0, y: 0 }, 3, [0, kcal(1), kcal(2)]), "conformers").map((e, i) =>
      i === 2 ? { ...e, failed: { kind: "not-converged" as const, why: "The optimisation did not converge" } } : e,
    );
    const said = `Not every entry is a result to stand on: a #3 not converged - take it out first (a Filter on "${STATE_FINISHED}")`;
    expect(runMeno("populations", set, "conformers", { temperature: 298.15 })).toEqual({ ok: false, said });
    expect(runMeno("energy-window", set, "conformers", { window: 3 })).toEqual({ ok: false, said });
  });

  it("weigh, window, choose and rank none where one failed by any kind - refused, say, its energy no result - naming every one", () => {
    const set = entries(bent({ x: 0, y: 0 }, 4, [kcal(3), kcal(2), kcal(1), 0]), "conformers").map((e, i) =>
      i === 3 ? { ...e, failed: { kind: "refused" as const, why: "x" } } : i === 1 ? { ...e, marksUnread: true as const } : e,
    );
    const said = `Not every entry is a result to stand on: a #2: ${MARKS_UNREAD}; a #4 refused - take them out first (a Filter on "${STATE_FINISHED}")`;
    expect(runMeno("populations", set, "conformers", { temperature: 298.15 })).toEqual({ ok: false, said });
    expect(runMeno("energy-window", set, "conformers", { window: 3 })).toEqual({ ok: false, said });
    expect(runMeno("choose", set, "conformers")).toEqual({ ok: false, said });
    expect(runMeno("duplicates", set, "conformers")).toEqual({ ok: false, said });
  });

  it("choose no lowest, and rank no duplicates by energy, where one is no minimum - not converged, or a saddle point - naming it; by number, any may be chosen", () => {
    // (#3 the lowest, and no minimum)
    const base = entries(bent({ x: 0, y: 0 }, 3, [kcal(2), kcal(1), 0]), "conformers");
    const stopped = base.map((e, i) => (i === 2 ? { ...e, failed: { kind: "not-converged" as const, why: "The optimisation did not converge" } } : e));
    const saddle = base.map((e, i) => (i === 2 ? { ...e, imaginary: [-382.63] } : e));
    for (const [set, said] of [
      [stopped, `Not every entry is a result to stand on: a #3 not converged - take it out first (a Filter on "${STATE_FINISHED}")`],
      [saddle, "a #3 has 1 imaginary frequency, 382.6i cm⁻¹: it is no minimum - take it out first"],
    ] as const) {
      expect(runMeno("choose", set, "conformers")).toEqual({ ok: false, said });
      expect(runMeno("duplicates", set, "conformers")).toEqual({ ok: false, said });
      const chosen = runMeno("choose", set, "conformers", { which: "number", number: 3 });
      expect(chosen.ok && chosen.kept.map((e) => e.number)).toEqual([3]);
    }
    // (all minima: the lowest, #3)
    const lowest = runMeno("choose", base, "conformers");
    expect(lowest.ok && lowest.kept.map((e) => e.number)).toEqual([3]);
  });

  it("carry each conformer's imaginary frequencies, frame by frame - a single geometry's its calculation's, of its last", () => {
    const m = { ...bent({ x: 0, y: 0 }, 3, [0, kcal(1), kcal(2)]), imaginary: [null, [-382.63], null] };
    expect(entries(m, "conformers").map((e) => e.imaginary)).toEqual([undefined, [-382.63], undefined]);
    const one = { ...bent({ x: 0, y: 0 }), calc: { readers: ["xtb 6.7.1"], imaginary: [-382.63] } };
    expect(entries(one, "molecules").map((e) => e.imaginary)).toEqual([[-382.63]]);
    // (an earlier frame of a path: not the geometry the frequencies are of)
    const path = { ...bent({ x: 0, y: 0 }, 2), calc: { readers: ["xtb 6.7.1"], imaginary: [-382.63] }, path: true as const };
    expect(entries(path, "molecules").map((e) => e.imaginary)).toEqual([[-382.63]]);
    expect(setEntries([{ ...bent({ x: 0, y: 0 }, 2), calc: { readers: ["xtb 6.7.1"], imaginary: [-382.63] }, id: 1 }], "molecules").map((e) => e.imaginary)).toEqual([undefined, [-382.63]]);
  });

  it("take an energy that is no number - NaN, or infinite - for none: in a window, in populations, in choosing the lowest and in Duplicates' order", () => {
    // (as a calculation's molecule keeps it, it is never an entry's energy)
    const read = entries(bent({ x: 0, y: 0 }, 3, [0, Number.NaN, Number.NEGATIVE_INFINITY]), "conformers");
    expect(read.map((e) => e.energy)).toEqual([0, undefined, undefined]);
    // (and an entry given one is refused as one with none)
    for (const bad of [Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]) {
      const set = entries(bent({ x: 0, y: 0 }, 2, [0, kcal(1)]), "conformers").map((e, i) => (i === 1 ? { ...e, energy: bad } : e));
      expect(runMeno("energy-window", set, "conformers", { window: 3 })).toEqual({ ok: false, said: "Not every entry has an energy" });
      expect(runMeno("populations", set, "conformers", { temperature: 298.15 })).toEqual({ ok: false, said: "Not every entry has an energy" });
      expect(runMeno("choose", set, "conformers")).toEqual({ ok: false, said: "Not every entry has an energy" });
    }
    // Duplicates: frames 1 and 2 alike, 2 the lower - with an infinite energy, taken in order, so 1 is kept
    const m = bent({ x: 0, y: 0 }, 3, [kcal(1), 0, kcal(2)], 0.01);
    m.frames![1] = [0, 0, 0, 1, 0, 0, -0.3, 2, 0];
    const set = entries(m, "conformers");
    const ranked = runMeno("duplicates", set, "conformers", { rmsd: 0.125 });
    expect(ranked.ok && ranked.kept.map((e) => e.number)).toEqual([2, 3]);
    const lowest = runMeno("duplicates", set.map((e, i) => (i === 0 ? { ...e, energy: Number.NEGATIVE_INFINITY } : e)), "conformers", { rmsd: 0.125 });
    expect(lowest.ok && lowest.kept.map((e) => e.number)).toEqual([1, 3]);
    const nan = runMeno("duplicates", set.map((e, i) => (i === 1 ? { ...e, energy: Number.NaN } : e)), "conformers", { rmsd: 0.125 });
    expect(nan.ok && nan.kept.map((e) => e.number)).toEqual([1, 3]);
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
    for (const temperature of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
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
  /** set 1 → As conformers (step 2; its set 3) → Energy window (step 4; its sets 5, within, and 6, outside), 1 kcal/mol. */
  const [CONVERT, WINDOW] = [2, 4];
  function chain(): WorkspaceDocument {
    let doc = addStep(page(), "as-conformers", 5, 0);
    doc = addStep(doc, "energy-window", 20, 0, { window: 1 });
    expect(doc.steps!.map((s) => s.id)).toEqual([CONVERT, WINDOW]);
    doc = connect(doc, { set: 1 }, CONVERT);
    return connect(doc, exitSet(doc, CONVERT), WINDOW);
  }
  /** What a set holds, as a step would take it in. */
  const held = (doc: WorkspaceDocument, set: number) => inputOf({ ...doc, wires: [{ id: 99, from: { set }, to: { step: WINDOW, port: "in" } }] }, WINDOW)!;

  it("runs the steps before a step first, each making its result set", () => {
    const doc = runStep(chain(), WINDOW, W);
    const by = () => "meno";
    expect(stateOf(doc, doc.steps![0], by())).toBe("done");
    expect(stateOf(doc, doc.steps![1], by())).toBe("done");
    expect(doc.steps![1].ran).toMatchObject({ ok: true, said: "3 of 5 kept, on electronic energies", at: 1000 });
    const made = resultOf(doc, WINDOW)!;
    expect(made.made).toEqual({ step: WINDOW, exit: "out", holds: "conformers" });
    // a conformer set: one molecule, its conformers in play as frames, numbered as they were
    const input = held(doc, made.id);
    expect(input.holds).toBe("conformers");
    expect(input.molecules).toHaveLength(1);
    expect(input.molecules[0]).toMatchObject({ conformerSet: true, numbers: [1, 2, 5] });
    // (to the right of its step, clear of it)
    expect(made.x0).toBeGreaterThan(doc.steps![1].x);
  });

  it("says a step has changed when its options, or what comes in, change", () => {
    let doc = runStep(chain(), WINDOW, W);
    doc = updateStep(doc, WINDOW, { options: { window: 5 } });
    expect(stateOf(doc, doc.steps![1], "meno")).toBe("changed");
    doc = runStep(doc, WINDOW, W);
    expect(stateOf(doc, doc.steps![1], "meno")).toBe("done");
    expect(doc.steps![1].ran!.said).toBe("5 of 5 kept, on electronic energies");
    // (its result sets' entries replaced, not added to: all five within it now, none outside)
    expect(held(doc, resultOf(doc, WINDOW)!.id).molecules[0].numbers).toEqual([1, 2, 3, 4, 5]);
    expect(countOf(doc, resultOf(doc, WINDOW, "rest")!).entries).toBe(0);
    expect(doc.molecules3d!.filter((m) => m.conformerSet)).toHaveLength(2);
  });

  it("runs first a step changed however far back, and every step from it on - each on what the one before it gave anew", () => {
    // (… → Energy window → Duplicates → Populations)
    let doc = addStep(addStep(chain(), "duplicates", 35, 0), "populations", 50, 0);
    const [duplicates, populations] = doc.steps!.slice(2).map((s) => s.id);
    doc = connect(connect(doc, exitSet(doc, WINDOW), duplicates), exitSet(doc, duplicates), populations);
    doc = runStep(doc, populations, W);
    doc = updateStep(doc, WINDOW, { options: { window: 5 } });
    expect(doc.steps!.map((s) => stateOf(doc, s, "meno"))).toEqual(["done", "changed", "done", "done"]);
    doc = runStep(doc, populations, { ...W, now: 2000 });
    expect(doc.steps!.map((s) => stateOf(doc, s, "meno"))).toEqual(["done", "done", "done", "done"]);
    expect(doc.steps!.map((s) => s.ran!.at)).toEqual([1000, 2000, 2000, 2000]);
  });

  it("says a step has changed when what comes in changes only in a charge", () => {
    let doc = runStep(chain(), WINDOW, W);
    expect(stateOf(doc, doc.steps![0], "meno")).toBe("done");
    const m = doc.molecules3d![0];
    doc = { ...doc, molecules3d: [{ ...m, atoms: m.atoms.map((a, i) => (i === 0 ? { ...a, charge: -1 } : a)) }, ...doc.molecules3d!.slice(1)] };
    expect(stateOf(doc, doc.steps![0], "meno")).toBe("changed");
  });

  it("fails, saying why, where it cannot run", () => {
    let doc = addStep(page(), "energy-window", 5, 0);
    doc = runStep(doc, lastStep(doc), W);
    expect(doc.steps![0].ran).toMatchObject({ ok: false, said: "Nothing comes into it" });
    doc = addStep(doc, "as-conformers", 5, 9);
    const convert = lastStep(doc);
    doc = connect(doc, { set: 1 }, convert);
    doc = runStep(doc, convert, { ...W, byOf: () => "some-plugin" });
    expect(doc.steps![1].ran).toMatchObject({ ok: false, said: "Nothing added does this step" });
  });

  it("puts what it set aside in its second exit's set, in plain view - numbered as they were, with their energies", () => {
    const doc = runStep(chain(), WINDOW, W);
    const rest = resultOf(doc, WINDOW, "rest")!;
    expect(rest.made).toEqual({ step: WINDOW, exit: "rest", holds: "conformers" });
    expect(countOf(doc, rest)).toMatchObject({ holds: "conformers", entries: 2, compounds: 1 });
    const outside = held(doc, rest.id).molecules[0];
    expect(outside).toMatchObject({ conformerSet: true, numbers: [3, 4] });
    expect(outside.energies!.map((e) => (e + 76) * KCAL_PER_HARTREE)).toEqual([expect.closeTo(2, 9), expect.closeTo(4, 9)]);
  });
});

describe("a step's exits", () => {
  /** One compound's five conformers, alike in shape to 0.001 Å, at 0, 0.5, 2, 4 and 0.5 kcal/mol above -76 - in set 1 - through As conformers into a step of `kind`, run. */
  function ran(kind: "energy-window" | "duplicates" | "choose", options: Record<string, number | string>) {
    let doc = addMolecule3d(emptyWorkspaceDocument(), bent({ x: 0, y: 0 }, 5, [0, 0.5, 2, 4, 0.5].map((k) => -76 + kcal(k)), 0.001));
    doc = addSet(doc, { x0: -3, y0: -3, x1: 3, y1: 3 });
    doc = addStep(doc, "as-conformers", 5, 0);
    const convert = lastStep(doc);
    doc = addStep(doc, kind, 20, 0, options);
    const step = lastStep(doc);
    doc = connect(connect(doc, { set: 1 }, convert), exitSet(doc, convert), step);
    doc = runStep(doc, step, W);
    /** What one of its exits' sets holds: the kind of set, and each entry's conformer number and energy (kcal/mol above -76). */
    const exit = (id: string) => {
      const set = resultOf(doc, step, id)!;
      const ms = setMembers(doc, set).molecules.map((m) => doc.molecules3d!.find((x) => x.id === m)!);
      const entries = setEntries(ms, set.made!.holds as "molecules" | "conformers");
      return { holds: set.made!.holds, numbers: entries.map((e) => e.number), kcal: entries.map((e) => Math.round((e.energy! + 76) * KCAL_PER_HARTREE * 1000) / 1000) };
    };
    return { doc, step, exit };
  }

  it("say, between them, what became of everything that came in: kept and set aside add up to it, in plain view", () => {
    // (worked out by hand from the energies and shapes above)
    const known = {
      "energy-window": { options: { window: 1 }, out: [1, 2, 5], rest: [3, 4] },
      duplicates: { options: { rmsd: 0.125 }, out: [1], rest: [2, 3, 4, 5] },
      choose: { options: { which: "lowest" }, out: [1], rest: [2, 3, 4, 5] },
    } as const;
    for (const [kind, k] of Object.entries(known) as [keyof typeof known, (typeof known)[keyof typeof known]][]) {
      const { exit } = ran(kind, k.options);
      const out = exit("out");
      const rest = exit("rest");
      expect([kind, out.numbers, rest.numbers]).toEqual([kind, k.out, k.rest]);
      expect(out.numbers.length + rest.numbers.length).toBe(5);
    }
  });

  it("make what is set aside the kind of set the exit says: Choose one's, the conformers not chosen, a conformer set still", () => {
    const { exit } = ran("choose", { which: "lowest" });
    // (the one chosen, a molecule of its own - the lowest, at 0)
    expect(exit("out")).toEqual({ holds: "molecules", numbers: [1], kcal: [0] });
    // (the rest, one compound's conformers still, with their energies)
    expect(exit("rest")).toEqual({ holds: "conformers", numbers: [2, 3, 4, 5], kcal: [0.5, 2, 4, 0.5] });
  });

  it("not run, are read back from a file as not run - and those that never held anything go with their step, with the wires out of them", async () => {
    const { readWorkflow } = await import("./saved");
    let doc = addStep(page(), "duplicates", 5, 0);
    const step = lastStep(doc);
    const saved = JSON.parse(JSON.stringify({ sets: doc.sets, steps: doc.steps, wires: doc.wires }));
    expect(readWorkflow(saved)!.sets.filter((b) => b.made).map((b) => b.made)).toEqual([
      { step, exit: "out" },
      { step, exit: "rest" },
    ]);
    // (its exit wired on, then the step deleted before it ran: both its exits' frames go, and the wire)
    doc = addStep(doc, "as-conformers", 30, 0);
    doc = connect(doc, exitSet(doc, step, "rest"), lastStep(doc));
    expect(doc.wires).toHaveLength(1);
    const gone = removeStep(doc, step);
    expect(gone.sets!.map((b) => b.id)).toEqual([1, resultOf(doc, lastStep(doc))!.id]);
    expect(gone.wires).toEqual([]);
  });
});

describe("what a step on entries alone gives back", () => {
  /** One compound's five conformers, made by a conformer search: what it was made by, what its energies are from, its stereo labels - the first conformer 4 kcal/mol up. */
  function made(): WorkspaceDocument {
    const m = {
      ...bent({ x: 0, y: 0 }, 5, [4, 0, 0.5, 2, 0.5].map((k) => -76 + kcal(k))),
      conformerSet: true as const,
      numbers: [1, 2, 3, 4, 5],
      calc: { readers: [], program: "RDKit", method: "MMFF94", results: [{ id: "x", on: "molecule" as const, group: "G", label: "Last", value: 1 }] },
      made: { method: "ETKDG v3 + MMFF94", how: [{ label: "Made", text: "ETKDG v3" }], energies: "MMFF94" },
      stereo: { atoms: { 0: "R" }, bonds: {} },
    };
    return addSet(addMolecule3d(emptyWorkspaceDocument(), m), { x0: -3, y0: -3, x1: 3, y1: 3 });
  }

  it("keeps what its energies are from and how they were made - the first conformer gone or not", () => {
    let doc = addStep(made(), "energy-window", 5, 0, { window: 1 });
    doc = connect(doc, { set: 1 }, 2);
    doc = runStep(doc, 2, W);
    const out = resultOf(doc, 2)!;
    const m = doc.molecules3d!.find((x) => setMembers(doc, out).molecules.includes(x.id))!;
    // (conformers 2, 3 and 5 within the window - 1, which carried them before, not among them)
    expect(m.numbers).toEqual([2, 3, 5]);
    expect(m.made).toEqual({ method: "ETKDG v3 + MMFF94", how: [{ label: "Made", text: "ETKDG v3" }], energies: "MMFF94" });
    expect(m.calc).toMatchObject({ program: "RDKit", method: "MMFF94" });
    expect(m.stereo).toEqual({ atoms: { 0: "R" }, bonds: {} });
  });

  /** A water as a compound set holds it, worked out by `program`'s `method`, at `energy`, its drawing `drawn` and stereo labels `labels`. */
  const water = (id: number, program: string, method: string, energy: number, drawn: number[], labels: Record<number, string> = {}) =>
    setEntries(
      [
        {
          ...bent({ x: 0, y: 0 }, 1, [energy]),
          id,
          calc: { readers: [], program, method },
          made: { how: [{ label: "Made", text: "ETKDG v3" }], energies: method },
          drawnFrom: drawn,
          stereo: { atoms: labels, bonds: {} },
        },
      ],
      "molecules"
    ).map((e) => ({ ...e, compound: id }));

  it("will not make one compound of entries worked out by different calculations", () => {
    // (the desk's case: water by MMFF94 at -76 Eh and by GFN2-xTB at -75.9 - one list of their energies means nothing)
    const out = runMeno("as-conformers", [...water(1, "RDKit", "MMFF94", -76, [1, 2, 3]), ...water(2, "xtb", "GFN2-xTB", -75.9, [1, 2, 3])], "molecules");
    expect(out).toEqual({ ok: false, said: "Compound a: its entries come from different calculations (RDKit MMFF94; xtb GFN2-xTB)" });
  });

  it("will not make one compound of entries labelled as different stereoisomers", () => {
    const out = runMeno("as-conformers", [...water(1, "RDKit", "MMFF94", -76, [1, 2, 3], { 0: "R" }), ...water(2, "RDKit", "MMFF94", -76.001, [1, 2, 3], { 0: "S" })], "molecules");
    expect(out).toEqual({ ok: false, said: "Compound a: its entries' stereo labels differ: they may be different stereoisomers" });
  });

  /** Which stereoisomer an entry is, as the plugin that perceives configurations answers: `key`, or not perceived, and why. */
  const isomer = (key: string | { why: string }): EntryStereo =>
    typeof key === "string"
      ? { perceived: true, elements: [{ kind: "centre", atoms: [0], specified: true }], key, by: { plugin: "rdkit", version: "0.1.7" } }
      : { perceived: false, why: key.why };

  it("makes a compound of each stereoisomer, read from each entry's own geometry", () => {
    // (four conformers, two of them R and two S, read so from their geometry: two compounds of two - not one of four)
    const all = [1, 2, 3, 4].flatMap((id) => water(id, "RDKit", "MMFF94", -76 - id / 1000, [1, 2, 3]));
    const out = runMeno("as-conformers", all.map((e, i) => ({ ...e, stereo: isomer(i % 2 ? "S" : "R") })), "molecules");
    expect(out.ok && out.kept.map((e) => [e.compound, e.number, e.energy])).toEqual([[0, 1, -76.001], [0, 2, -76.003], [1, 1, -76.002], [1, 2, -76.004]]);
    expect(out.said).toBe("2 compounds · 4");
  });

  it("will not make a compound of entries none of which was asked which stereoisomer it is", () => {
    // (constitution alone would sum diastereomers: not asked is not known, and it fails closed)
    const all = [...water(1, "RDKit", "MMFF94", -76, [1, 2, 3]), ...water(2, "RDKit", "MMFF94", -76.001, [1, 2, 3])].map((e) => ({ ...e, stereo: undefined }));
    expect(runMeno("as-conformers", all, "molecules")).toEqual({ ok: false, said: "Which stereoisomer entry 1 is is not known: it has not been asked" });
  });

  it("will not make a compound of an entry whose stereoisomer is not known", () => {
    const all = [...water(1, "RDKit", "MMFF94", -76, [1, 2, 3]), ...water(2, "RDKit", "MMFF94", -76.001, [1, 2, 3])];
    const out = runMeno("as-conformers", [{ ...all[0], stereo: isomer("R") }, { ...all[1], stereo: isomer({ why: "Nothing added tells stereoisomers apart" }) }], "molecules");
    expect(out).toEqual({ ok: false, said: "Which stereoisomer entry 2 is is not known: Nothing added tells stereoisomers apart" });
  });

  it("makes one compound of entries made alike, keeping only what all of them keep", () => {
    // (one calculation and one source of energies, drawn twice: the drawing each was made from is no one's to keep)
    const out = runMeno("as-conformers", [...water(1, "RDKit", "MMFF94", -76, [1, 2, 3]), ...water(2, "RDKit", "MMFF94", -76.001, [4, 5, 6])], "molecules");
    expect(out.ok).toBe(true);
    const [m] = resultsOf(out as Extract<typeof out, { ok: true }>, "as-conformers").molecules;
    expect(m.energies).toEqual([-76, -76.001]);
    expect(m.calc).toMatchObject({ program: "RDKit", method: "MMFF94" });
    expect(m.made).toEqual({ how: [{ label: "Made", text: "ETKDG v3" }], energies: "MMFF94" });
    expect(m.drawnFrom).toBeUndefined();
  });

  it("gives a compound of entries made unlike no calculation, and no energies in one list", () => {
    // (should a conformer set come with such a compound in it, past As conformers: the first's are not the compound's)
    const kept = [...water(1, "RDKit", "MMFF94", -76, [1, 2, 3]), ...water(2, "xtb", "GFN2-xTB", -75.9, [1, 2, 3])].map((e, i) => ({ ...e, compound: 0, number: i + 1 }));
    const [m] = resultsOf({ ok: true, holds: "conformers", kept, aside: [], said: "" }, "energy-window").molecules;
    expect(m.calc).toBeUndefined();
    expect(m.energies).toBeUndefined();
    expect(m.made).toBeUndefined();
  });

  it("gives what a calculation read of one geometry only to that geometry: the last frame's", () => {
    const entries = setEntries(made().molecules3d!, "conformers");
    expect(entries.map((e) => e.calc?.results?.length ?? 0)).toEqual([0, 0, 0, 0, 1]);
    expect(entries.every((e) => e.calc?.method === "MMFF94")).toBe(true);
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
      sets: [{ id: 1, x0: 2, y0: 2, x1: 0, y1: 0, made: { step: 9, exit: "out", holds: "conformers" } }],
      steps: [{ id: 2, kind: "teleport", x: 0, y: 0 }, { id: 5, kind: "energy", x: 0, y: 0 }],
      // (and wires as Meno wrote them before steps had inputs - into a step by its number, out of a step - not read)
      wires: [{ id: 3, from: { set: 1 }, to: { step: 2, port: "in" } }, { id: 6, from: { set: 1 }, to: 5 }, { id: 7, from: { step: 5 }, to: { step: 5, port: "in" } }],
    });
    expect(odd).toEqual({ sets: [{ id: 1, x0: 0, y0: 0, x1: 2, y1: 2 }], steps: [{ id: 5, kind: "energy", x: 0, y: 0 }], wires: [] });
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
    expect(offered(doc)).toEqual([["Meno", ["energy-window", "duplicates", "populations", "filter", "rank", "take-frames", "choose", "enumerate", "chart", "energy-diagram", "tag", "species", "combine", "measure", "merge", "rebond", "compare-bonding", "join", "barrier", "restraints", "torsion-restraints", "number", "add", "atom-map", "displace", "ensemble"]]]);
    // a compound set's wire: what takes it - a chart of it seen as a table too - and the conversion
    expect(offered(doc, { set: 1 })).toEqual([["Meno", ["energy-window", "duplicates", "filter", "rank", "take-frames", "as-conformers", "chart", "energy-diagram", "tag", "species", "combine", "measure", "merge", "rebond", "compare-bonding", "join", "barrier", "restraints", "torsion-restraints", "add", "atom-map", "displace", "ensemble"]]]);
    // a conformer set's
    expect(offered(doc, exitSet(doc, 2))).toEqual([["Meno", ["energy-window", "duplicates", "populations", "filter", "rank", "choose", "chart", "energy-diagram", "tag", "species", "measure", "merge", "rebond", "compare-bonding", "join", "barrier", "restraints", "torsion-restraints", "add", "atom-map", "displace", "ensemble"]]]);
    // plugins added: theirs first, each under its name - and only those that take what a wire carries
    useReaders.setState({ state: { rdkit: "added", xtb: "added" }, problem: {} });
    expect(offered(doc)).toEqual([
      ["RDKit", ["conformers", "minimise", "check-structures", "stereoisomers", "descriptors"]],
      ["xTB", ["optimise", "energy", "frequencies"]],
      ["Meno", ["energy-window", "duplicates", "populations", "filter", "rank", "take-frames", "choose", "enumerate", "chart", "energy-diagram", "tag", "species", "combine", "measure", "merge", "rebond", "compare-bonding", "join", "barrier", "restraints", "torsion-restraints", "number", "add", "atom-map", "displace", "ensemble"]],
    ]);
    expect(offered(doc, { set: 1 })).toEqual([
      ["RDKit", ["conformers", "minimise"]],
      ["xTB", ["optimise", "energy", "frequencies"]],
      ["Meno", ["energy-window", "duplicates", "filter", "rank", "take-frames", "as-conformers", "chart", "energy-diagram", "tag", "species", "combine", "measure", "merge", "rebond", "compare-bonding", "join", "barrier", "restraints", "torsion-restraints", "add", "atom-map", "displace", "ensemble"]],
    ]);
    // a set of structures drawn: a conformer search made from them - RDKit's, not CREST's, which starts from 3D - and Filter, on their records, and Chart, of them seen as a table
    doc = addSet({ ...doc, model: { atoms: [{ id: 1, x: 40, y: 0, r: 0.9, el: "C" }, { id: 2, x: 41.5, y: 0, r: 0.9, el: "O" }], bonds: [{ id: 1, a: 1, b: 2, order: 1 }] } }, { x0: 38, y0: -2, x1: 44, y1: 2 });
    const drawn = doc.sets![doc.sets!.length - 1].id;
    useReaders.setState({ state: { rdkit: "added", crest: "added" }, problem: {} });
    expect(offered(doc, { set: drawn }).map(([who, kinds]) => [who, kinds])).toEqual([["RDKit", ["conformers", "check-structures", "stereoisomers", "descriptors"]], ["Meno", ["filter", "enumerate", "chart"]]]);
    // an interface to a program installed separately: under the program's name, not the interface's
    useReaders.setState({ state: { orca: "added" }, problem: {} });
    expect(offered(doc)[0]).toEqual(["ORCA", ["optimise", "energy", "frequencies", "path-search", "saddle-point", "reaction-path"]]);
    expect(pluginById("orca")?.name).toBe("ORCA interface");
    expect(doerOf({ kind: "energy", by: "orca" })).toEqual({ id: "orca", name: "ORCA" });
  });

  it("offer a step that takes nothing in on empty space alone - never from a wire, which it has nowhere to take", () => {
    const doc = addStep(page(), "as-conformers", 5, 0);
    useReaders.setState({ state: { reinvent: "added" }, problem: {} });
    expect(offered(doc).find(([who]) => who === "REINVENT 4")).toEqual(["REINVENT 4", ["generate"]]);
    expect(offered(doc, { set: 1 }).find(([who]) => who === "REINVENT 4")).toBeUndefined();
    // (and nothing can be wired into one put down)
    const gen = addStep(doc, "generate", 9, 0, undefined, "reinvent");
    const id = gen.steps![gen.steps!.length - 1].id;
    expect(canWire(gen, { set: 1 }, id)).toBe(false);
    expect(connect(gen, { set: 1 }, id)).toBe(gen);
    expect(inputsOf("generate")).toEqual([]);
  });
});

describe("a workflow's parts in the selection", () => {
  /** A page with a molecule in a set (1), wired into an optimisation (2) whose exits are sets 3 and 4 (Failed) - and the store over it. */
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
    expect(st().selFlow).toEqual({ sets: new Set([1, 3, 4]), steps: new Set([2]) });
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
    const flow = { sets: [{ id: 1, x0: 0, y0: 0, x1: 4, y1: 4 }], steps: [{ id: 2, kind: "energy" as const, x: 6, y: 3, by: "xtb" }], wires: [{ id: 3, from: { set: 1 }, to: { step: 2, port: "in" } }] };
    st().pasteModel({ atoms: [], bonds: [], flow });
    const step = st().steps.find((s) => s.kind === "energy")!;
    // (the step put down given the set for its exit it came without: every step has its exits)
    const exit = resultOf(st(), step.id)!;
    const failed = resultOf(st(), step.id, "failed")!;
    expect(st().sets).toHaveLength(6);
    const set = st().sets.find((b) => !b.made && b.id !== 1)!;
    expect(st().wires.some((w) => w.to.step === step.id && w.from.set === set.id)).toBe(true);
    expect(st().selFlow).toEqual({ sets: new Set([set.id, exit.id, failed.id]), steps: new Set([step.id]) });
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

  it("takes in each molecule's frames chip, as wide as it is - wider than a small molecule - as a result set makes room for it", () => {
    // (HCN read from an optimisation of seven steps, each its energy: its chip "7 / 7 · 0.00 kcal/mol" wider than it)
    const hcn: Molecule3D = {
      id: 5,
      atoms: [{ el: "H", x: -1.066, y: 0, z: 0 }, { el: "C", x: 0, y: 0, z: 0 }, { el: "N", x: 1.153, y: 0, z: 0 }] as never,
      bonds: [{ a1: 0, a2: 1, order: 1 }, { a1: 1, a2: 2, order: 3 }],
      frames: Array.from({ length: 6 }, () => [-1.066, 0, 0, 0, 0, 0, 1.153, 0, 0]),
      energies: Array.from({ length: 7 }, (_, k) => -93.4 - k / 1000),
      at: { x: 40, y: 0 },
    };
    const f = selectionFrame({ atoms: [], bonds: [] }, new Set(), [hcn], new Set([5]), STYLE_3D, {}, {})!;
    expect(f.x0).toBeLessThanOrEqual(40 - chipWide(hcn) / 2);
    expect(f.x1).toBeGreaterThanOrEqual(40 + chipWide(hcn) / 2);
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
    placeResults(doc, doc.steps![0], { molecules: [bent({ x: 0, y: 0 })], rest: [], holds: "molecules" }, w, [[0, 0, 1, 0]]);
    expect(turns).toEqual([[0, 0, 1, 0]]);
  });
});
