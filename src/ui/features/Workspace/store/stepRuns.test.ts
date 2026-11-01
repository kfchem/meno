import { jobStateSaid } from "../utils/texts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job, JobAsk } from "../../../../lib/jobs";

/** The jobs, as the test has them: each one's record, its log and its files; and what was asked. */
const jobs = new Map<string, Job & { log: string; files: Record<string, string> }>();
/** Where set, how long a job's log takes to read, in ms: a log read late. */
const logDelay = new Map<string, number>();
const asked = { started: [] as JobAsk[], stopped: [] as string[], removed: [] as string[] };
let next = 1;
/** A file's text, as the test has it, that stands for one too large to read. */
const TOO_LARGE = "(too large)";
/** Where set, what each job's start waits on once its folder is made - a step's jobs started one by one, as the runner does. */
let holdStart: Promise<void> | null = null;
const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** What a job gave, as one digest - of its log and files, as the test has them: 64 hex digits, as the runner's. */
function digestOf(id: string): string {
  const j = jobs.get(id)!;
  let h = 7;
  for (const c of JSON.stringify([j.log, Object.entries(j.files).sort()])) h = (h * 31 + c.charCodeAt(0)) | 0;
  return (h >>> 0).toString(16).padStart(64, "0");
}
/** Each program installed separately as it is now (its stamp), by where it is; one not there cannot be told. */
const stamps: Record<string, string> = {};
/** The computer's physical cores, as a test has them: as many as its cores, unless it says. */
const physicalCores = vi.hoisted(() => ({ n: 8 }));

vi.mock("../../../../lib/jobs", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/jobs")>()),
  startJob: async (ask: JobAsk) => {
    asked.started.push(ask);
    const id = idOf(next++);
    jobs.set(id, { id, plugin: ask.plugin, program: ask.program, state: "waiting", created: Date.now(), log: "", files: {}, ...(ask.key ? { key: ask.key } : {}) });
    if (holdStart) await holdStart;
    return id;
  },
  listJobs: async () => [...jobs.values()],
  jobOf: async (id: string) => jobs.get(id)!,
  readJobLog: async (id: string, from: number) => {
    const wait = logDelay.get(id);
    if (wait) await new Promise((go) => setTimeout(go, wait));
    const log = jobs.get(id)?.log ?? "";
    return { text: log.slice(from), next: log.length };
  },
  jobFiles: async (id: string) => Object.keys(jobs.get(id)?.files ?? {}),
  jobDigest: async (id: string) => digestOf(id),
  programStamp: async (path: string) => {
    if (!stamps[path]) throw `${path}: not there`;
    return stamps[path];
  },
  readJobFile: async (id: string, name: string) => {
    const text = jobs.get(id)!.files[name];
    if (text === TOO_LARGE) throw `${name} is too large to read: 300 MB, past 256 MB`;
    return text;
  },
  stopJob: async (id: string) => void asked.stopped.push(id),
  removeJob: async (id: string) => void asked.removed.push(id),
  jobFolder: async (id: string) => `/jobs/${id}`,
  // (a computer of 8 cores and 32 GB: jobs may use 24 GB of it, Settings unsaid - its physical cores as a test has them)
  computerResources: async () => ({ cores: 8, physical: physicalCores.n, memory: 32 * 1024 }),
}));

/** The files a job made that Meno reads itself, as the test has them: a render's pictures, by where they are. */
const madeFiles = new Map<string, Uint8Array>();
vi.mock("@tauri-apps/plugin-fs", async (actual) => ({
  ...(await actual<typeof import("@tauri-apps/plugin-fs")>()),
  readFile: async (path: string) => madeFiles.get(path) ?? new Uint8Array(),
}));
vi.mock("@tauri-apps/api/path", async (actual) => ({
  ...(await actual<typeof import("@tauri-apps/api/path")>()),
  join: async (...parts: string[]) => parts.join("/"),
}));

/** A PNG's signature, its header for `w` by `h`, and its end: what Meno takes to be a picture, `seed` making each its own. */
function png(w: number, h: number, seed = 0): Uint8Array {
  const be = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be(w), ...be(h), 8, 6, 0, 0, 0, seed, 0, 0, 0, 0, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0]);
}

/** The xTB plugin's worker, as the test has it: what it prepared and read back, and what it was asked. */
const worker = {
  prepare: vi.fn(async (step: string, entries: unknown[]) => ({
    jobs: entries.map((_, i) => ({
      entries: [i],
      program: "xtb",
      args: step === "optimise" ? ["input.xyz", "--opt", "normal"] : ["input.xyz", "--gfn", "2"],
      files: [{ name: "input.xyz", text: "3\n\n" }],
      reads: ["xtbopt.log"],
    })),
  })),
  run: vi.fn(async (_step: string, entries: unknown[]) => ({ kept: entries.length > 1 ? [0] : [] })),
  collect: vi.fn(async (_step: string, entries: { atoms: { el: string; x: number; y: number; z: number }[] }[], _o: unknown, files: Record<string, string>, _log: string, ended: string) =>
    ended !== "done"
      ? { why: "Some atoms are very close" }
      : {
          outputs: entries.map((e) => ({
            schema: 1,
            program: "xtb",
            version: "6.7.1",
            method: "GFN2-xTB",
            atoms: e.atoms.map((a) => a.el),
            frames: [e.atoms.flatMap((a) => [a.x, a.y, a.z]), e.atoms.flatMap((a) => [a.x, a.y + 0.01, a.z])],
            energies: [-5.0703, Number(files["xtbopt.log"])],
            optimised: true,
          })),
        },
  ),
};
/** Where the programs installed separately are, as the test has them; and what Meno's readers read, as the test has it. */
const installedAt: Record<string, string | null> = {};
vi.mock("../../../../lib/plugins/installed", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/plugins/installed")>()),
  lookFor: vi.fn(async (_plugin: string, name: string) => installedAt[name] ?? null),
}));
const readOutput = vi.fn(async (_name: string, _text: string, _kind: { id: string }, _sha: string) => ({
  output: {
    schema: 1,
    program: "ORCA",
    version: "6.1.0",
    method: "B3LYP",
    atoms: ["O", "H", "H"],
    frames: [[0, 0, 0, 0, 0.76, 0.59, 0, -0.76, 0.59]],
    energies: [-76.4],
  },
  readers: ["cclib 1.9rc1"],
}));
vi.mock("../../../../lib/calc/read", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/calc/read")>()),
  readOutput: (...args: Parameters<typeof readOutput>) => readOutput(...args),
}));
vi.mock("../../../../lib/calc/workers", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/calc/workers")>()),
  pluginClient: async () => worker,
}));
/** What the plugin that perceives configurations was asked, MOL blocks each time; it answers each a centre, keyed by its molecule (by how long its block is: conformers of one molecule are one stereoisomer here). */
const configured: string[][] = [];
vi.mock("../../../../lib/roles/worker", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/roles/worker")>()),
  rolePlugin: (role: string) => (role === "configurations" ? { id: "rdkit", version: "0.1.7", name: "RDKit" } : undefined),
  pluginWorker: async () => ({
    request: async (_op: string, args: { molblocks: string[] }) => {
      configured.push(args.molblocks);
      return { molecules: args.molblocks.map((b) => ({ elements: [{ kind: "centre", atoms: [0], specified: true }], key: `k${b.split("\n").length}` })) };
    },
  }),
}));
/** Why the next outputs kept with the workspace fail to be, as the test has it: none, kept as Meno keeps them. */
const keepFails: string[] = [];
vi.mock("../../../../lib/calc/asks", async (actual) => {
  const real = await actual<typeof import("../../../../lib/calc/asks")>();
  return {
    ...real,
    rememberOutput: async (...args: Parameters<typeof real.rememberOutput>) => {
      const why = keepFails.shift();
      if (why) throw new Error(why);
      return real.rememberOutput(...args);
    },
  };
});

import { connectStoreToDocument, createEditorStore } from ".";
import { useReaders } from "../../../../lib/calc/workers";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { useInstalled } from "../../../../lib/plugins/installed";
import { createWorkspaceDocument, addMolecule3d } from "../document";
import { readWorkflow } from "../workflow/saved";
import { readWorkspace, workspaceFile, workspaceText } from "../utils/workspace";
import { calcLine } from "../../../../lib/calc/output";
import { heldOutput } from "../../../../lib/calc/asks";
import { readMenoFile } from "../../../../lib/doc/menoFile";
import { registerKinds } from "../../../../lib/io/kinds";
import { MANIFESTS } from "../../../../lib/plugins/known";
import { canWire, resultOf, stateOf } from "../workflow/flow";
import { MOST_PAIRS } from "../workflow/pairs";
import { byOf, optionsFor } from "../workflow/doers";
import { CARD_W } from "../workflow/look";
import { countOf, entryOfSet, setEntries, setMembers } from "../workflow/entries";
import { forgetStereo } from "../workflow/configurations";

// (the plugins Meno carries, added: the kinds their outputs are read as registered)
registerKinds(MANIFESTS);

/** A page with water in a set, wired into a step that optimises it, done by xTB. */
function editor() {
  const doc = createWorkspaceDocument();
  doc.edit("water", (d) =>
    addMolecule3d(d, {
      atoms: [
        { el: "O", x: 0, y: 0, z: 0 },
        { el: "H", x: 0, y: 0.76, z: 0.59 },
        { el: "H", x: 0, y: -0.76, z: 0.59 },
      ],
      bonds: [
        { a1: 0, a2: 1, order: 1 },
        { a1: 0, a2: 2, order: 1 },
      ],
      at: { x: 0, y: 0 },
    }),
  );
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  const set = st().addSet({ x0: -3, y0: -3, x1: 3, y1: 3 });
  const step = st().addStep("optimise", "xtb", 10, 0);
  st().connect({ set }, step);
  doc.markSaved();
  return { doc, st, step };
}

const settle = () => new Promise((go) => setTimeout(go, 0));

/** The page of `editor`, with `n` waters in its set: `n` entries, a job each. */
function waters(n: number) {
  const made = editor();
  for (let i = 1; i < n; i++) made.doc.edit("water", (d) => addMolecule3d(d, { ...d.molecules3d![0], at: { x: i % 2 ? 1 : -1, y: 1 } }));
  return made;
}

/** A job of the test's ended: done with what it wrote, or as `state` says. */
const end = (n: number, state: Job["state"] = "done", more: Partial<Job & { files: Record<string, string>; log: string }> = {}) =>
  Object.assign(jobs.get(idOf(n))!, { state, started: 1000, ended: 2000, ...(state === "done" ? { files: { "xtbopt.log": "-5.0705" } } : {}), ...more });

describe("a step that runs a plugin's program", () => {
  beforeEach(() => {
    jobs.clear();
    next = 1;
    asked.started = [];
    asked.stopped = [];
    asked.removed = [];
    keepFails.length = 0;
    worker.prepare.mockClear();
    worker.collect.mockClear();
    useReaders.setState({ state: { xtb: "added" }, problem: {} });
  });

  it("runs a job for its entry, apart from Meno - kept with the page, no step to undo - and brings its results in as one", async () => {
    const { doc, st, step } = editor();
    const ran = st().runStep(step);
    await settle();
    await settle();
    // prepared by the plugin with what came in, its job started - with the cores it takes
    expect(worker.prepare).toHaveBeenCalledWith("optimise", [expect.objectContaining({ charge: 0, multiplicity: 1 })], { method: "gfn2", solvent: "none", level: "normal" }, expect.any(Number), {});
    expect(asked.started).toEqual([expect.objectContaining({ plugin: "xtb", program: "xtb", args: ["input.xyz", "--opt", "normal"], cores: expect.any(Number) })]);
    const running = st().steps.find((s) => s.id === step)!.running!;
    expect(running.jobs).toEqual([{ id: idOf(1), entries: [0], reads: ["xtbopt.log"], key: expect.stringMatching(/^[0-9a-f]{64}$/) }]);
    // (to be saved - and read back, so that a workspace opened again picks it up - but nothing to undo)
    expect(doc.history()).toMatchObject({ dirty: true, undoLabel: "wire" });
    expect(readWorkflow({ sets: st().sets, steps: st().steps, wires: st().wires })?.steps[0].running).toEqual(running);

    // its job running: the card says so, and what its log says last
    Object.assign(jobs.get(idOf(1))!, { state: "running", started: Date.now(), log: "cycle 1\n   cycle 2  \n" });
    await st().lookAtJobs();
    expect(st().jobsSeen[idOf(1)]).toMatchObject({ state: "running", line: "cycle 2" });

    // done: read back by the plugin, and brought in
    Object.assign(jobs.get(idOf(1))!, { state: "done", ended: Date.now() + 12_000, files: { "xtbopt.log": "-5.0705" } });
    await st().lookAtJobs();
    await ran;
    const after = st().steps.find((s) => s.id === step)!;
    expect(after.running).toBeUndefined();
    expect(after.ran).toMatchObject({ ok: true, jobs: [idOf(1)], said: expect.stringContaining("−5.070500 Eh") });
    const made = st().sets.find((b) => b.made?.step === step)!;
    expect(made.made).toEqual({ step, exit: "out", holds: "molecules" });
    // the molecule optimised: its path as its frames, ending at it, shown at its end; what the calculation was
    const m = st().molecules3d[1];
    expect(m).toMatchObject({ path: true, energies: [-5.0703, -5.0705], calc: { program: "xtb", method: "GFN2-xTB", optimised: true } });
    expect(m.frames).toHaveLength(1);
    expect(st().frames3d[m.id]).toBe(1);
    // its results one step to undo: undone, the run stays over
    expect(doc.history().undoLabel).toBe("results");
    doc.undo();
    expect(st().molecules3d).toHaveLength(1);
    expect(st().steps.find((s) => s.id === step)!.running).toBeUndefined();
  });

  it("passes a lone atom through as it came where its plugin's program takes none - never sent, said on its line and on it - and sends one where it takes one", async () => {
    useReaders.setState({ state: { xtb: "added", crest: "added" }, problem: {} });
    // (water and a sodium ion, the ion of a salt drawn as ions, in one set)
    const page = (kind: "optimise" | "conformers", by: string, water = true) => {
      const made = editor();
      if (!water) made.doc.edit("ion", (d) => ({ ...d, molecules3d: [] }));
      made.doc.edit("ion", (d) => addMolecule3d(d, { atoms: [{ el: "Na", x: 0.5, y: 0.5, z: 0, charge: 1 }], bonds: [], at: { x: 1, y: 1 } }));
      const step = made.st().addStep(kind, by, 20, 0);
      made.st().connect({ set: made.st().sets[0].id }, step);
      return { ...made, step };
    };
    const ion = (st: () => ReturnType<ReturnType<typeof editor>["st"]>, step: number) =>
      setMembers(st(), st().sets.find((b) => b.made?.step === step && b.made.exit === "out")!)
        .molecules.map((id) => st().molecules3d.find((m) => m.id === id)!)
        .find((m) => m.atoms.length === 1)!;

    // CREST's Optimise: the water sent, the ion not - where it was, no energy, no calculation, said so
    {
      const { st, step } = page("optimise", "crest");
      const ran = st().runStep(step);
      await settle();
      await settle();
      expect(worker.prepare).toHaveBeenCalledWith("optimise", [expect.objectContaining({ atoms: [expect.objectContaining({ el: "O" }), expect.anything(), expect.anything()] })], expect.anything(), expect.any(Number), {});
      const running = st().steps.find((s) => s.id === step)!.running!;
      expect(running.passed).toHaveLength(1);
      // (kept with the workspace: opened again, the ion still comes in when the job ends)
      expect(readWorkflow({ sets: st().sets, steps: st().steps, wires: st().wires })?.steps.find((s) => s.id === step)!.running).toEqual(running);
      end(1);
      await st().lookAtJobs();
      await ran;
      const after = st().steps.find((s) => s.id === step)!;
      expect(after.ran).toMatchObject({ ok: true, said: expect.stringContaining("one atom: nothing to optimise, no energy") });
      const na = ion(st, step);
      expect(na.atoms[0]).toMatchObject({ el: "Na", x: 0.5, y: 0.5, z: 0 });
      expect(na.energies).toBeUndefined();
      expect(na.calc).toBeUndefined();
      expect(na.made?.how).toEqual([{ label: "Optimise", text: "one atom: nothing to optimise, no energy" }]);
    }
    worker.prepare.mockClear();
    jobs.clear();
    asked.started = [];
    next = 1;

    // the ion alone: nothing asked of its plugin, no job - its only conformer, at once
    {
      const { st, step } = page("conformers", "crest", false);
      await st().runStep(step);
      expect(worker.prepare).not.toHaveBeenCalled();
      expect(asked.started).toEqual([]);
      const after = st().steps.find((s) => s.id === step)!;
      expect(after.running).toBeUndefined();
      expect(after.ran).toMatchObject({ ok: true, said: expect.stringContaining("one atom: its only conformer") });
      expect(ion(st, step).made?.how).toEqual([{ label: "Conformers", text: "one atom: its only conformer" }]);
    }

    // xTB's Optimise, whose program takes one: the ion sent with the water, as before
    {
      const { st, step } = page("optimise", "xtb");
      const ran = st().runStep(step);
      await settle();
      await settle();
      const sent = worker.prepare.mock.lastCall![1] as { atoms: { el: string }[] }[];
      expect(sent.map((e) => e.atoms.length).sort()).toEqual([1, 3]);
      expect(st().steps.find((s) => s.id === step)!.running!.passed).toBeUndefined();
      for (const j of [...jobs.keys()]) Object.assign(jobs.get(j)!, { state: "done", started: 1000, ended: 2000, files: { "xtbopt.log": "-5.0705" } });
      await st().lookAtJobs();
      await ran;
    }
  });

  it("ends on what came in when it started - its wire undone while it runs - and is changed once its results are in", async () => {
    const { doc, st, step } = editor();
    const ran = st().runStep(step);
    await settle();
    await settle();
    // (its wire undone while its job runs: nothing comes into it now)
    expect(doc.history().undoLabel).toBe("wire");
    doc.undo();
    expect(st().wires).toHaveLength(0);
    end(1);
    await st().lookAtJobs();
    await ran;
    const after = st().steps.find((s) => s.id === step)!;
    expect(after.ran).toMatchObject({ ok: true, said: expect.stringContaining("\u22125.070500 Eh") });
    expect(st().sets.find((b) => b.made?.step === step)?.made).toEqual({ step, exit: "out", holds: "molecules" });
    expect(st().molecules3d[1]).toMatchObject({ energies: [-5.0703, -5.0705] });
    expect(stateOf(doc.getState(), after, byOf(after))).toBe("changed");
  });

  it("reads how far its job is, and what it says last, from whole lines - a line read in part waits for the rest", async () => {
    const { st, step } = editor();
    const ran = st().runStep(step);
    await settle();
    await settle();
    const job = jobs.get(idOf(1))!;
    // ("progress 12/240" read as far as "progress 12/24": not taken for how far it is)
    Object.assign(job, { state: "running", started: Date.now(), log: "cycle 1\nprogress 3/240\nprogress 12/24" });
    await st().lookAtJobs();
    expect(st().jobsSeen[idOf(1)]).toMatchObject({ line: "cycle 1", progress: { done: 3, total: 240 } });
    job.log += "0\ncycle 2\n";
    await st().lookAtJobs();
    expect(st().jobsSeen[idOf(1)]).toMatchObject({ line: "cycle 2", progress: { done: 12, total: 240 } });
    Object.assign(job, { state: "done", ended: Date.now() + 1000, files: { "xtbopt.log": "-5.0705" } });
    await st().lookAtJobs();
    await ran;
  });

  it("saved while its job runs and opened again, picks the job up where it is - and brings its results in once it is done", async () => {
    const { st, step } = editor();
    void st().runStep(step);
    await settle();
    await settle();
    expect(st().steps.find((s) => s.id === step)!.running).toBeDefined();
    // (saved as the app saves it, then opened in a tab of its own as the app opens one - the first one gone)
    const saved = readWorkspace(workspaceText(st()));
    if (!saved) throw new Error("the workspace did not read back");
    const doc2 = createWorkspaceDocument();
    const store2 = createEditorStore(doc2);
    connectStoreToDocument(store2, doc2);
    store2.getState().openWorkspace(saved, true);
    const st2 = () => store2.getState();
    expect(st2().steps.find((s) => s.id === step)!.running?.jobs.map((j) => j.id)).toEqual([idOf(1)]);
    // (the job still running: seen so, nothing brought in yet)
    Object.assign(jobs.get(idOf(1))!, { state: "running", started: Date.now(), log: "cycle 3\n" });
    await st2().lookAtJobs();
    expect(st2().jobsSeen[idOf(1)]).toMatchObject({ state: "running" });
    expect(st2().sets.find((b) => b.made?.step === step)?.made?.holds).toBeUndefined();
    // (done while the workspace was open again: read back and brought in, as if it had never been closed)
    Object.assign(jobs.get(idOf(1))!, { state: "done", ended: Date.now() + 5000, files: { "xtbopt.log": "-5.0705" } });
    await st2().lookAtJobs();
    await settle();
    const after = st2().steps.find((s) => s.id === step)!;
    expect(after.running).toBeUndefined();
    expect(after.ran).toMatchObject({ ok: true, jobs: [idOf(1)] });
    expect(st2().sets.find((b) => b.made?.step === step)?.made).toEqual({ step, exit: "out", holds: "molecules" });
  });

  it("saved while its job runs and opened again only once it has gone - its folder cleared - says so, and brings nothing in", async () => {
    const { st, step } = editor();
    void st().runStep(step);
    await settle();
    await settle();
    const saved = readWorkspace(workspaceText(st()))!;
    jobs.delete(idOf(1));
    const doc2 = createWorkspaceDocument();
    const store2 = createEditorStore(doc2);
    connectStoreToDocument(store2, doc2);
    store2.getState().openWorkspace(saved, true);
    await store2.getState().lookAtJobs();
    await settle();
    const after = store2.getState().steps.find((s) => s.id === step)!;
    expect(after.running).toBeUndefined();
    expect(after.ran).toMatchObject({ ok: false });
    expect(store2.getState().sets.find((b) => b.made?.step === step)?.made?.holds).toBeUndefined();
  });

  it("given an empty set, starts nothing and says so - for each kind of step a plugin does", async () => {
    const { st } = editor();
    const empty = st().addSet({ x0: 40, y0: -3, x1: 46, y1: 3 });
    for (const [kind, by] of [["optimise", "xtb"], ["energy", "xtb"], ["frequencies", "xtb"], ["conformers", "crest"]] as const) {
      useReaders.setState({ state: { xtb: "added", crest: "added" }, problem: {} });
      const step = st().addStep(kind, by, 60, 0);
      st().connect({ set: empty }, step);
      await st().runStep(step);
      expect(asked.started).toEqual([]);
      expect(st().steps.find((s) => s.id === step)!.ran, kind).toMatchObject({ ok: false });
      expect(st().steps.find((s) => s.id === step)!.running, kind).toBeUndefined();
    }
  });

  it("gives a program running as processes one to each physical core, however many cores Settings gives - a program of threads all of them", async () => {
    useReaders.setState({ state: { orca: "added", xtb: "added" }, problem: {} });
    installedAt.orca = "/Applications/orca_6/orca";
    // (a computer running two threads on each of its 4 physical cores - whatever computer the test runs on: the cores
    //  the webview tells, too - and Settings giving each job all 8)
    physicalCores.n = 4;
    Object.defineProperty(globalThis.navigator, "hardwareConcurrency", { value: 8, configurable: true });
    const calculations = useAppSettings.getState().calculations;
    useAppSettings.setState({ calculations: { ...calculations, cores: 8 } });
    try {
      worker.prepare.mockImplementationOnce(async () => ({ jobs: [{ entries: [0], program: "orca", args: ["input.inp"], files: [{ name: "input.inp", text: "! SP\n" }], reads: [] }] }) as never);
      const { st } = editor();
      const orca = st().addStep("energy", "orca", 10, 10);
      st().connect({ set: st().sets[0].id }, orca);
      void st().runStep(orca);
      await settle();
      await settle();
      // (ORCA, whose manifest says it runs as processes: 4 - its %pal written so, and its job counted so)
      expect((worker.prepare.mock.calls[worker.prepare.mock.calls.length - 1] as unknown[])[3]).toBe(4);
      expect(asked.started[asked.started.length - 1]).toMatchObject({ program: "orca", cores: 4 });
      // (xtb, of threads: all 8)
      const xtb = st().addStep("optimise", "xtb", 10, 30);
      st().connect({ set: st().sets[0].id }, xtb);
      void st().runStep(xtb);
      await settle();
      await settle();
      expect((worker.prepare.mock.calls[worker.prepare.mock.calls.length - 1] as unknown[])[3]).toBe(8);
    } finally {
      physicalCores.n = 8;
      delete (globalThis.navigator as { hardwareConcurrency?: number }).hardwareConcurrency;
      useAppSettings.setState({ calculations });
    }
  });

  it("runs a job on the fewer cores its plugin says it takes - ORCA with no MPI, one - and says why once, on the step's line", async () => {
    useReaders.setState({ state: { orca: "added" }, problem: {} });
    installedAt.orca = "/Applications/orca_6/orca";
    const calculations = useAppSettings.getState().calculations;
    useAppSettings.setState({ calculations: { ...calculations, cores: 8 } });
    try {
      const NO_MPI = "run on one core: no MPI on this computer";
      const one = { program: "orca", args: ["input.inp"], files: [{ name: "input.inp", text: "! SP\n" }], reads: [], cores: 1 };
      worker.prepare.mockImplementationOnce(async () => ({ jobs: [{ entries: [0], ...one }], note: NO_MPI }) as never);
      worker.collect.mockImplementationOnce(async () => ({ read: [{ kind: "orca", log: true, name: "water.out" }] }) as never);
      const { st } = editor();
      const step = st().addStep("energy", "orca", 10, 10);
      st().connect({ set: st().sets[0].id }, step);
      const ran = st().runStep(step);
      await settle();
      await settle();
      // (its plugin told where ORCA was found: its jobs' PATH begins with that folder, where it looks for MPI's launcher)
      expect((worker.prepare.mock.calls[worker.prepare.mock.calls.length - 1] as unknown[])[4]).toEqual({ orca: "/Applications/orca_6/orca" });
      // (Settings give each job 8: this one is asked for, and counted by the queue, at 1)
      expect(asked.started[asked.started.length - 1]).toMatchObject({ program: "orca", cores: 1 });
      Object.assign(jobs.get(idOf(asked.started.length))!, { state: "done", started: 1000, ended: 61_000, log: "ORCA's output" });
      await st().lookAtJobs();
      await ran;
      const said = st().steps.find((s) => s.id === step)!.ran!.said!;
      expect(said.split(NO_MPI).length - 1).toBe(1);
    } finally {
      useAppSettings.setState({ calculations });
    }
  });

  it("runs a program installed separately where it was found - and has Meno's readers read what it wrote", async () => {
    useReaders.setState({ state: { orca: "added" }, problem: {} });
    installedAt.orca = "/Applications/orca_6/orca";
    worker.prepare.mockImplementationOnce(async () => ({ jobs: [{ entries: [0], program: "orca", args: ["input.inp"], files: [{ name: "input.inp", text: "! SP\n" }], reads: [] }] }) as never);
    worker.collect.mockImplementationOnce(async () => ({ read: [{ kind: "orca", log: true, name: "water.out" }] }) as never);
    const { st } = editor();
    const step = st().addStep("energy", "orca", 10, 10);
    st().connect({ set: st().sets[0].id }, step);
    const ran = st().runStep(step);
    await settle();
    await settle();
    // started with where it is
    expect(asked.started).toEqual([expect.objectContaining({ plugin: "orca", program: "orca", path: "/Applications/orca_6/orca" })]);
    Object.assign(jobs.get(idOf(1))!, { state: "done", started: 1000, ended: 61_000, log: "ORCA's output" });
    await st().lookAtJobs();
    await ran;
    // what it printed read by Meno's readers, as an output opened is - ORCA's kind - and kept, by that kind
    expect(readOutput).toHaveBeenCalledWith("water.out", "ORCA's output", expect.objectContaining({ id: "orca" }), expect.any(String));
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: true, said: "1:00 · E −76.400000 Eh" });
    const m = st().molecules3d[st().molecules3d.length - 1];
    expect(m.calc).toMatchObject({ program: "ORCA", readers: ["cclib 1.9rc1"], source: { name: "water.out", kind: "orca" } });
  });

  it("asks for another plugin's program where its plugin's job needs it - the xTB plugin's xtb, for ORCA's xTB methods - and, that plugin not added, starts nothing and says so - the plugin otherwise running as it does", async () => {
    installedAt.orca = "/Applications/orca_6/orca";
    const needing = async () => ({ jobs: [{ entries: [0], program: "orca", args: ["input.inp"], files: [{ name: "input.inp", text: "! XTB2 Opt\n" }], reads: [], needs: ["xtb"] }] }) as never;
    // (the xTB plugin not added: refused before any job is made)
    useReaders.setState({ state: { orca: "added" }, problem: {} });
    worker.prepare.mockImplementationOnce(needing);
    const first = editor();
    const step = first.st().addStep("energy", "orca", 10, 10);
    first.st().connect({ set: first.st().sets[0].id }, step);
    await first.st().runStep(step);
    expect(asked.started).toEqual([]);
    expect(first.st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: false, said: "Needs xTB, which is not added." });
    // (added: the job asks for it, by the plugin's id)
    useReaders.setState({ state: { orca: "added", xtb: "added" }, problem: {} });
    worker.prepare.mockImplementationOnce(needing);
    const again = editor();
    const next = again.st().addStep("energy", "orca", 10, 10);
    again.st().connect({ set: again.st().sets[0].id }, next);
    void again.st().runStep(next);
    await settle();
    await settle();
    expect(asked.started).toEqual([expect.objectContaining({ plugin: "orca", program: "orca", needs: ["xtb"] })]);
  });

  it("runs the programs installed beside it after it, and keeps the wavefunction it wrote with what was read - saved with the workspace", async () => {
    useReaders.setState({ state: { orca: "added" }, problem: {} });
    installedAt.orca = "/Applications/orca_6/orca";
    const then = [{ program: "orca_2mkl", args: ["input", "-molden"] }];
    worker.prepare.mockImplementationOnce(async () => ({ jobs: [{ entries: [0], program: "orca", args: ["input.inp"], files: [{ name: "input.inp", text: "! SP\n" }], then, reads: ["input.molden.input"] }] }) as never);
    const wavefunction = { kind: "molden", file: "input.molden.input", name: "water.molden" };
    worker.collect.mockImplementationOnce(async () => ({ read: [{ kind: "orca", log: true, name: "water.out", wavefunction }] }) as never);
    const { st } = editor();
    const step = st().addStep("energy", "orca", 10, 10);
    st().connect({ set: st().sets[0].id }, step);
    const ran = st().runStep(step);
    await settle();
    await settle();
    expect(asked.started).toEqual([expect.objectContaining({ program: "orca", then })]);
    Object.assign(jobs.get(idOf(1))!, { state: "done", started: 1000, ended: 61_000, log: "ORCA's output", files: { "input.molden.input": "[Molden Format]\n" } });
    await st().lookAtJobs();
    await ran;
    const m = st().molecules3d[st().molecules3d.length - 1];
    expect(m.calc?.wavefunction).toMatchObject({ name: "water.molden", kind: "molden" });
    // (held, for a step after it to be given; and kept in the workspace's file)
    expect((await heldOutput(m.calc!.wavefunction!.sha256))?.text).toBe("[Molden Format]\n");
    const file = readMenoFile((await workspaceFile(st())).bytes);
    expect(file.files.map((f) => f.sha256)).toContain(m.calc!.wavefunction!.sha256);
  });

  it("keeps no wavefunction where the job wrote none", async () => {
    useReaders.setState({ state: { orca: "added" }, problem: {} });
    installedAt.orca = "/Applications/orca_6/orca";
    worker.prepare.mockImplementationOnce(async () => ({ jobs: [{ entries: [0], program: "orca", args: ["input.inp"], files: [{ name: "input.inp", text: "! SP\n" }], reads: ["input.molden.input"] }] }) as never);
    worker.collect.mockImplementationOnce(async () => ({ read: [{ kind: "orca", log: true, name: "water.out", wavefunction: { kind: "molden", file: "input.molden.input", name: "water.molden" } }] }) as never);
    const { st } = editor();
    const step = st().addStep("energy", "orca", 10, 10);
    st().connect({ set: st().sets[0].id }, step);
    const ran = st().runStep(step);
    await settle();
    await settle();
    Object.assign(jobs.get(idOf(1))!, { state: "done", started: 1000, ended: 2000, log: "ORCA's output" });
    await st().lookAtJobs();
    await ran;
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: true });
    expect(st().molecules3d[st().molecules3d.length - 1].calc?.wavefunction).toBeUndefined();
  });

  it("gives a program one of its files to read, and lays what it gave back turned over what went in - as that is turned", async () => {
    useReaders.setState({ state: { gaussian: "added" }, problem: {} });
    installedAt.g16 = "/Applications/g16/g16";
    worker.prepare.mockImplementationOnce(
      async () => ({ jobs: [{ entries: [0], program: "g16", args: [], files: [{ name: "input.gjf", text: "# SP\n" }], stdin: "input.gjf", reads: [] }] }) as never,
    );
    worker.collect.mockImplementationOnce(async () => ({ read: [{ kind: "gaussian", log: true, name: "water.log" }] }) as never);
    // (water as Gaussian gives it back: in its standard orientation - turned a half turn about z, and moved)
    readOutput.mockImplementationOnce(async () => ({
      output: { schema: 1, program: "Gaussian", version: "2016+B.01", method: "B3LYP", atoms: ["O", "H", "H"], frames: [[0.1, 0, 0, 0.1, -0.76, 0.59, 0.1, 0.76, 0.59]], energies: [-76.4] },
      readers: ["cclib 1.9rc1"],
    }));
    const { st } = editor();
    const water = st().molecules3d[0].id;
    // (water turned on the page a quarter turn about x)
    const quarter: [number, number, number, number] = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];
    st().setTurn3d(water, quarter);
    const step = st().addStep("optimise", "gaussian", 10, 10);
    st().connect({ set: st().sets[0].id }, step);
    const ran = st().runStep(step);
    await settle();
    await settle();
    expect(asked.started).toEqual([expect.objectContaining({ program: "g16", args: [], stdin: "input.gjf" })]);
    Object.assign(jobs.get(idOf(1))!, { state: "done", started: 1000, ended: 61_000, log: "Gaussian's output" });
    await st().lookAtJobs();
    await ran;
    const m = st().molecules3d[st().molecules3d.length - 1];
    // (its geometry as Gaussian gave it - shown turned back, then as the water that went in is)
    expect(m.atoms[1]).toMatchObject({ x: 0.1, y: -0.76 });
    const [x, y, z, w] = st().turns3d[m.id];
    const half: [number, number, number, number] = [0, 0, 1, 0];
    const want = [
      quarter[3] * half[0] + quarter[0] * half[3] + quarter[1] * half[2] - quarter[2] * half[1],
      quarter[3] * half[1] - quarter[0] * half[2] + quarter[1] * half[3] + quarter[2] * half[0],
      quarter[3] * half[2] + quarter[0] * half[1] - quarter[1] * half[0] + quarter[2] * half[3],
      quarter[3] * half[3] - quarter[0] * half[0] - quarter[1] * half[1] - quarter[2] * half[2],
    ];
    const sign = Math.sign(w * want[3] + x * want[0] + y * want[1] + z * want[2]);
    [x, y, z, w].forEach((v, i) => expect(v).toBeCloseTo(sign * want[i], 6));
  });

  it("keeps a single point's geometry as it went in, and turned as it is, though Gaussian gave it back in its own orientation", async () => {
    useReaders.setState({ state: { gaussian: "added" }, problem: {} });
    installedAt.g16 = "/Applications/g16/g16";
    worker.prepare.mockImplementationOnce(
      async () => ({ jobs: [{ entries: [0], program: "g16", args: [], files: [{ name: "input.gjf", text: "# SP\n" }], stdin: "input.gjf", reads: [] }] }) as never,
    );
    worker.collect.mockImplementationOnce(async () => ({ read: [{ kind: "gaussian", log: true, name: "water.log" }] }) as never);
    const { st } = editor();
    const water = st().molecules3d[0];
    // (water as Gaussian gives it back: in its standard orientation - turned a half turn about z, and moved)
    const turned = water.atoms.flatMap((a) => [0.1 - a.x, -a.y, a.z]);
    readOutput.mockImplementationOnce(async () => ({
      output: { schema: 1, program: "Gaussian", version: "2016+B.01", method: "B3LYP", atoms: ["O", "H", "H"], frames: [turned], energies: [-76.4] },
      readers: ["cclib 1.9rc1"],
    }));
    const quarter: [number, number, number, number] = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];
    st().setTurn3d(water.id, quarter);
    const step = st().addStep("energy", "gaussian", 10, 10);
    st().connect({ set: st().sets[0].id }, step);
    const ran = st().runStep(step);
    await settle();
    await settle();
    Object.assign(jobs.get(idOf(1))!, { state: "done", started: 1000, ended: 61_000, log: "Gaussian's output" });
    await st().lookAtJobs();
    await ran;
    const m = st().molecules3d[st().molecules3d.length - 1];
    expect(m.id).not.toBe(water.id);
    expect(m.energies).toEqual([-76.4]);
    expect(m.atoms.map((a) => [a.x, a.y, a.z])).toEqual(water.atoms.map((a) => [a.x, a.y, a.z]));
    st().turns3d[m.id].forEach((v, i) => expect(Math.abs(v)).toBeCloseTo(Math.abs(quarter[i]), 6));
  });

  it("says where to locate a program installed separately that is found nowhere - and starts nothing", async () => {
    useReaders.setState({ state: { orca: "added" }, problem: {} });
    installedAt.orca = null;
    const { st } = editor();
    const step = st().addStep("energy", "orca", 10, 10);
    st().connect({ set: st().sets[0].id }, step);
    await st().runStep(step);
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: false, said: "ORCA is not found: locate it in Settings, Plugins" });
    expect(asked.started).toEqual([]);
  });

  it("says why a program installed separately found only too old will not do - and starts nothing", async () => {
    useReaders.setState({ state: { orca: "added" }, problem: {} });
    installedAt.orca = null;
    const why = "Meno needs ORCA 6.0 or later; this one is 5.0.4";
    useInstalled.setState({ chosen: { "orca:orca": { path: "/opt/orca_5/orca", version: "5.0.4", why } } });
    const { st } = editor();
    const step = st().addStep("energy", "orca", 10, 10);
    st().connect({ set: st().sets[0].id }, step);
    await st().runStep(step);
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: false, said: why });
    expect(asked.started).toEqual([]);
    useInstalled.setState({ chosen: {} });
  });

  it("starts its jobs once, however often Run is pressed before they have started", async () => {
    const { st, step } = editor();
    const a = st().runStep(step);
    const b = st().runStep(step);
    const c = st().runAll();
    await settle();
    await settle();
    expect(asked.started).toHaveLength(1);
    expect(st().steps.find((s) => s.id === step)!.running!.jobs.map((j) => j.id)).toEqual([idOf(1)]);
    Object.assign(jobs.get(idOf(1))!, { state: "done", started: 1000, ended: 2000, files: { "xtbopt.log": "-5.0705" } });
    await st().lookAtJobs();
    await Promise.all([a, b, c]);
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: true });
  });

  it("runs a path search on conformer sets, each conformer an entry - paired in order, a job each, each sent its end - and refuses each with each past its most pairs", async () => {
    useReaders.setState({ state: { orca: "added", xtb: "added" }, problem: {} });
    installedAt.orca = "/Applications/orca_6/orca";
    worker.prepare.mockImplementationOnce(async () => ({ jobs: [0, 1].map((k) => ({ entries: [k], program: "orca", args: ["input.inp"], files: [{ name: "input.inp", text: "! XTB2 NEB-TS\n" }], reads: [] })) }) as never);
    const { doc, st } = editor();
    const calc = { readers: ["cclib 1.9rc1"], program: "ORCA", method: "GFN2-xTB", optimised: true };
    // (two conformer sets of water, each of two conformers optimised at one level: the starts, and their ends beside them)
    const conformers = (dy: number, k: number, at: { x: number; y: number }) => {
      const w = doc.getState().molecules3d![0];
      const xyz = (d: number) => w.atoms.flatMap((a, i) => [a.x, i === 1 ? a.y + d : a.y, a.z]);
      return { atoms: w.atoms, bonds: w.bonds, frames: Array.from({ length: k - 1 }, (_, j) => xyz(dy + 0.01 * (j + 1))), conformerSet: true as const, calc, at };
    };
    doc.edit("sets of conformers", (d) => addMolecule3d(addMolecule3d({ ...d, molecules3d: [] }, conformers(0, 2, { x: 0, y: 0 })), conformers(0.3, 2, { x: 20, y: 0 })));
    const starts = st().addSet({ x0: -3, y0: -3, x1: 3, y1: 3 });
    const ends = st().addSet({ x0: 17, y0: -3, x1: 23, y1: 3 });
    const step = st().addStep("path-search", "orca", 40, 0);
    expect(st().connect({ set: starts }, step, "start")).toBe(true);
    expect(st().connect({ set: ends }, step, "end")).toBe(true);
    void st().runStep(step);
    await settle();
    await settle();
    const sent = worker.prepare.mock.calls[worker.prepare.mock.calls.length - 1];
    expect(sent[0]).toBe("path-search");
    // (each conformer of the starts paired with the end in its place: two pairs, each with its end)
    expect((sent[1] as { end?: { atoms: unknown[] } }[]).map((e) => e.end?.atoms.length)).toEqual([3, 3]);
    expect(asked.started).toHaveLength(2);
    // (each paired by its place - kept with it, and said on the step's line when it ends: never taken for a match)
    expect(st().steps.find((x) => x.id === step)!.running?.paired).toBe("paired in order, by place");

    // (each with each of 11 conformers and 10: 110 pairs, past the most - refused before any job, saying how many)
    const big = editor();
    big.doc.edit("sets of conformers", (d) => addMolecule3d(addMolecule3d({ ...d, molecules3d: [] }, { ...conformers(0, 11, { x: 0, y: 0 }) }), { ...conformers(0.3, 10, { x: 20, y: 0 }) }));
    const s2 = big.st().addSet({ x0: -3, y0: -3, x1: 3, y1: 3 });
    const e2 = big.st().addSet({ x0: 17, y0: -3, x1: 23, y1: 3 });
    const step2 = big.st().addStep("path-search", "orca", 40, 0);
    big.st().updateStep(step2, { options: { pairs: "each" } });
    big.st().connect({ set: s2 }, step2, "start");
    big.st().connect({ set: e2 }, step2, "end");
    const before = asked.started.length;
    await big.st().runStep(step2);
    expect(big.st().steps.find((x) => x.id === step2)!.ran).toMatchObject({ ok: false, said: `Start holds 11 and End 10: each with each makes 110 pairs, and it makes at most ${MOST_PAIRS} - match them on a property instead, or raise At most` });
    expect(asked.started).toHaveLength(before);
  });

  it("runs a step of two inputs once each step before it is done, not after the first of them alone", async () => {
    const { st, step: a } = editor();
    // (two optimisations of the one set, each into Merge's inputs: the second's job ends last)
    const b = st().addStep("optimise", "xtb", 10, 10);
    st().connect({ set: st().sets[0].id }, b);
    const merge = st().addStep("merge", "meno", 30, 0);
    expect(st().connect({ set: resultOf(st(), a)!.id }, merge, "first")).toBe(true);
    expect(st().connect({ set: resultOf(st(), b)!.id }, merge, "second")).toBe(true);
    const all = st().runAll();
    for (let k = 0; k < 4; k++) await settle();
    expect(asked.started).toHaveLength(2);
    const done = (n: number) => Object.assign(jobs.get(idOf(n))!, { state: "done", started: 1000, ended: 2000, files: { "xtbopt.log": "-5.0705" } });
    done(1);
    await st().lookAtJobs();
    for (let k = 0; k < 4; k++) await settle();
    // (the first done, the second still running: Merge waits - never "the step before it failed")
    expect(st().steps.find((s) => s.id === merge)!.ran).toBeUndefined();
    done(2);
    await st().lookAtJobs();
    await all;
    expect(st().steps.find((s) => s.id === merge)!.ran).toMatchObject({ ok: true });
  });

  it("runs, of a step of two inputs, the side not done - never again the side done, nearer though it is: no job asked for anew", async () => {
    const { st, step: a } = editor();
    const ran = (id: number) => st().steps.find((s) => s.id === id)!.ran;
    // (the optimisation run, its job done)
    const first = st().runStep(a);
    for (let k = 0; k < 4; k++) await settle();
    Object.assign(jobs.get(idOf(1))!, { state: "done", started: 1000, ended: 2000, files: { "xtbopt.log": "-5.0705" } });
    await st().lookAtJobs();
    await first;
    const done = ran(a);
    expect(done).toMatchObject({ ok: true });
    // (the other side: two Filters, neither run - the first further back than the optimisation - then Merge of both)
    const filter = (from: number, x: number) => {
      const f = st().addStep("filter", "meno", x, 20);
      st().updateStep(f, { options: { conditions: "number ≥ 1", match: "all" } });
      st().connect({ set: from }, f);
      return f;
    };
    const p = filter(st().sets[0].id, 10);
    const q = filter(resultOf(st(), p)!.id, 20);
    const merge = st().addStep("merge", "meno", 30, 0);
    expect(st().connect({ set: resultOf(st(), a)!.id }, merge, "first")).toBe(true);
    expect(st().connect({ set: resultOf(st(), q)!.id }, merge, "second")).toBe(true);
    await st().runAll();
    expect(asked.started).toHaveLength(1);
    expect(ran(a)).toBe(done);
    expect([p, q, merge].map((id) => ran(id)?.ok)).toEqual([true, true, true]);
  });

  it("ends a step a branch gave nothing this time ok, its exits empty, saying which input came empty - through rounds whose last holds none, to a Merge of what they gave and one of the rests with them", async () => {
    const { st, step: a } = editor();
    const exit = (id: number, e: string) => st().sets.find((s) => s.made?.step === id && s.made.exit === e)!.id;
    const ran = (id: number) => st().steps.find((s) => s.id === id)!.ran;
    const holds = (id: number, e: string) => st().sets.find((s) => s.id === exit(id, e))!.members?.length ?? 0;
    // (three rounds, each a Filter: the first two keep the water, the last none - every entry done with already)
    const round = (from: number, conditions: string, x: number) => {
      const f = st().addStep("filter", "meno", x, 0);
      st().updateStep(f, { options: { conditions, match: "all" } });
      st().connect({ set: from }, f);
      return f;
    };
    const r1 = round(resultOf(st(), a)!.id, "number \u2265 1", 30);
    const r2 = round(exit(r1, "out"), "number \u2265 1", 50);
    const r3 = round(exit(r2, "out"), "number \u2265 2", 70);
    // (the last round's own: a program's step, then a step of two inputs - nothing comes into either)
    const o3 = st().addStep("optimise", "xtb", 90, 0);
    st().connect({ set: exit(r3, "out") }, o3);
    const t3 = st().addStep("torsion-restraints", "meno", 110, 0);
    expect(st().connect({ set: exit(o3, "out") }, t3, "molecules")).toBe(true);
    expect(st().connect({ set: st().sets[0].id }, t3, "reference")).toBe(true);
    // (the Merge after the rounds - each round's empty out, the last's restraints and what came into them: nothing from either)
    const merge = st().addStep("merge", "meno", 130, 0);
    expect(st().connect({ set: exit(r3, "out") }, merge, "first")).toBe(true);
    expect(st().connect({ set: exit(t3, "out") }, merge, "second")).toBe(true);
    // (and the Merge of the rounds' rests - what the first round gave, not empty - with the last round's restraints, empty:
    //  Merge's own rule, the rests' entries, never ended at once)
    const rests = st().addStep("merge", "meno", 130, 20);
    expect(st().connect({ set: exit(r1, "out") }, rests, "first")).toBe(true);
    expect(st().connect({ set: exit(t3, "out") }, rests, "second")).toBe(true);
    const all = st().runAll();
    for (let k = 0; k < 4; k++) await settle();
    expect(asked.started).toHaveLength(1);
    Object.assign(jobs.get(idOf(1))!, { state: "done", started: 1000, ended: 2000, files: { "xtbopt.log": "-5.0705" } });
    await st().lookAtJobs();
    await all;
    expect(ran(r3)).toMatchObject({ ok: true });
    expect(holds(r3, "out")).toBe(0);
    // (no job for it, no worker asked: ended ok at once)
    expect(asked.started).toHaveLength(1);
    expect(ran(o3)).toMatchObject({ ok: true, said: "Nothing came in" });
    expect(holds(o3, "out")).toBe(0);
    expect(ran(t3)).toMatchObject({ ok: true, said: "Nothing came into Molecules" });
    expect(holds(t3, "out")).toBe(0);
    expect(ran(merge)).toMatchObject({ ok: true, said: "Nothing came into First and Second" });
    expect(holds(merge, "out")).toBe(0);
    expect(ran(rests)).toMatchObject({ ok: true, said: expect.stringMatching(/ · nothing came from Second$/) });
    expect(holds(rests, "out")).toBe(1);
  });

  it("still fails a step whose empty input no step gave, or whose step before it failed", async () => {
    const { st } = editor();
    // (a set drawn round nothing, wired by hand)
    const empty = st().addSet({ x0: 50, y0: 50, x1: 56, y1: 56 });
    const o = st().addStep("optimise", "xtb", 70, 50);
    st().connect({ set: empty }, o);
    await st().runStep(o);
    expect(st().steps.find((s) => s.id === o)!.ran).toMatchObject({ ok: false });
    expect(asked.started).toHaveLength(0);
  });

  it("runs a path search on pairs - each start with the end in its place - sending each its end, and a pair it cannot work out out of Failed, saying why", async () => {
    useReaders.setState({ state: { orca: "added", xtb: "added" }, problem: {} });
    installedAt.orca = "/Applications/orca_6/orca";
    worker.prepare.mockImplementationOnce(async () => ({ jobs: [{ entries: [0], program: "orca", args: ["input.inp"], files: [{ name: "input.inp", text: "! XTB2 NEB-TS FREQ\n" }], reads: [] }] }) as never);
    const { doc, st } = editor();
    // (each an optimisation, converged, at one level: a path's ends must be - and a second set beside the first: water
    //  again, its hydrogens elsewhere - and a hydrogen molecule, another molecule)
    const calc = { readers: ["cclib 1.9rc1"], program: "ORCA", method: "GFN2-xTB", optimised: true };
    doc.edit("ends", (d) => {
      // (the start carrying how an earlier pair was made: replaced by this path's, said on the line)
      const water = { ...d.molecules3d![0], calc, properties: [{ "path.paired": { value: "matched on an earlier tag", unit: "none" as const, status: "computed" as const } }] };
      const withWater = { ...d, molecules3d: [water, ...d.molecules3d!.slice(1)] };
      return addMolecule3d(addMolecule3d(withWater, { ...water, atoms: water.atoms.map((a, i) => (i === 1 ? { ...a, y: 0.9 } : a)), at: { x: 20, y: 0 } }), { atoms: [{ el: "H", x: 0, y: 0, z: 0 }, { el: "H", x: 0.74, y: 0, z: 0 }], bonds: [{ a1: 0, a2: 1, order: 1 }], calc, at: { x: 24, y: 0 } });
    });
    const ends = st().addSet({ x0: 17, y0: -3, x1: 27, y1: 3 });
    const starts = st().addSet({ x0: -3, y0: -3, x1: 3, y1: 6 });
    // (each with each: water onto water, and water onto the hydrogen molecule - which no path joins)
    const step = st().addStep("path-search", "orca", 40, 0);
    st().updateStep(step, { options: { pairs: "each" } });
    st().connect({ set: starts }, step, "start");
    st().connect({ set: ends }, step, "end");
    const ran = st().runStep(step);
    await settle();
    await settle();
    const sent = worker.prepare.mock.calls[worker.prepare.mock.calls.length - 1];
    expect(sent[0]).toBe("path-search");
    // (only the pair that can be worked out sent, with its end beside it)
    expect((sent[1] as { end?: { atoms: unknown[] } }[]).map((e) => e.end?.atoms.length)).toEqual([3]);
    expect(asked.started).toEqual([expect.objectContaining({ plugin: "orca", program: "orca" })]);

    // (done: its path read back - two images, the point refined, the last - and brought in, shown at the point refined)
    const water = st().molecules3d[0];
    const at = water.atoms.flatMap((a) => [a.x, a.y, a.z]);
    const frames = [0, 0.1, 0.2, 0.3].map((dy) => at.map((v, i) => (i % 3 === 1 ? v + dy : v)));
    worker.collect.mockImplementationOnce(
      async () =>
        ({
          outputs: [
            { schema: 1, program: "ORCA", method: "GFN2-xTB", atoms: water.atoms.map((a) => a.el), frames, energies: [-5.07, -5.06, -5.05, -5.069], converged: [false, false, true, false] },
          ],
        }) as never,
    );
    Object.assign(jobs.get(idOf(1))!, { state: "done", started: 1000, ended: 2000, files: {} });
    await st().lookAtJobs();
    await ran;
    const path = st().molecules3d.find((m) => m.entryFrames?.length)!;
    expect(path.entryFrames).toEqual([2]);
    expect(st().frames3d[path.id]).toBe(2);
    expect(st().steps.find((x) => x.id === step)!.ran?.said).toMatch(/ · the path\.paired a pair carried replaced$/);
    expect(path.properties?.[2]?.["path.paired"]?.value).toBe("each with each");
  });

  it("optimises guesses to saddle points - with their sides where both are wired, each paired as its options say; one side alone runs nothing", async () => {
    useReaders.setState({ state: { orca: "added", xtb: "added" }, problem: {} });
    installedAt.orca = "/Applications/orca_6/orca";
    const { doc, st } = editor();
    // (water to guess from, water again on each side - its hydrogens elsewhere - and a hydrogen molecule among the reactant sides)
    doc.edit("sides", (d) => {
      const water = d.molecules3d![0];
      const moved = (dy: number, x: number) => ({ ...water, atoms: water.atoms.map((a, i) => (i === 1 ? { ...a, y: a.y + dy } : a)), at: { x, y: 0 } });
      return addMolecule3d(addMolecule3d(addMolecule3d(d, moved(0.2, 20)), { atoms: [{ el: "H", x: 0, y: 0, z: 0 }, { el: "H", x: 0.74, y: 0, z: 0 }], bonds: [{ a1: 0, a2: 1, order: 1 }], at: { x: 24, y: 0 } }), moved(-0.2, 40));
    });
    const guesses = st().addSet({ x0: -3, y0: -3, x1: 3, y1: 6 });
    const reactants = st().addSet({ x0: 17, y0: -3, x1: 27, y1: 3 });
    const products = st().addSet({ x0: 37, y0: -3, x1: 43, y1: 3 });
    const step = st().addStep("saddle-point", "orca", 60, 0);
    st().connect({ set: guesses }, step, "guesses");
    // (one side alone: none of it runs, saying why)
    st().connect({ set: reactants }, step, "reactant");
    await st().runStep(step);
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: false, said: "Reactant side is wired: wire Product side too, or neither" });
    // (both, each with each: the guess with each reactant side and the product side - the hydrogen molecule no side of it, out of Failed)
    st().connect({ set: products }, step, "product");
    st().updateStep(step, { options: { pairs: "each" } });
    worker.prepare.mockImplementationOnce(async () => ({ jobs: [{ entries: [0], program: "orca", args: ["input.inp"], files: [{ name: "input.inp", text: "! OPTTS\n" }], reads: [] }] }) as never);
    const ran = st().runStep(step);
    await settle();
    await settle();
    const sent = worker.prepare.mock.calls[worker.prepare.mock.calls.length - 1];
    expect(sent[0]).toBe("saddle-point");
    const given = sent[1] as { atoms: { y: number }[]; sides?: { reactant: { atoms: { y: number }[] }; product: { atoms: { y: number }[] } } }[];
    expect(given).toHaveLength(1);
    const water = st().molecules3d[0];
    expect([given[0].sides?.reactant.atoms[1].y, given[0].sides?.product.atoms[1].y].map((y) => Math.round((y! - water.atoms[1].y) * 10) / 10)).toEqual([0.2, -0.2]);
    Object.assign(jobs.get(idOf(1))!, { state: "failed", started: 1000, ended: 2000, files: {} });
    await st().lookAtJobs();
    await ran;
    const failed = st().steps.find((s) => s.id === step)!.ran;
    expect(failed?.said).toContain("not the same atoms in one numbering");
  });

  it("puts an optimisation that stopped under way out of Failed at the geometry it reached, from which a step after it starts afresh - saying so", async () => {
    useReaders.setState({ state: { orca: "added" }, problem: {} });
    installedAt.orca = "/Applications/orca_6/orca";
    const { st } = editor();
    const water = st().molecules3d[0];
    const at = water.atoms.flatMap((a) => [a.x, a.y, a.z]);
    const moved = (dy: number) => at.map((v, i) => (i === 4 ? v + dy : v));
    const step = st().addStep("optimise", "orca", 10, 10);
    st().connect({ set: st().sets[0].id }, step);
    worker.prepare.mockImplementationOnce(async () => ({ jobs: [{ entries: [0], program: "orca", args: ["input.inp"], files: [{ name: "input.inp", text: "! OPT\n" }], reads: [] }] }) as never);
    // (its SCF failed at its third step: ORCA's words, and its output to read for where it got to)
    worker.collect.mockImplementationOnce(async () => ({ why: "ORCA finished by error termination in SCF", partial: [{ kind: "orca", log: true, name: "water.out" }] }) as never);
    readOutput.mockImplementationOnce(async () => ({
      output: { schema: 1, program: "ORCA", version: "6.1.1", method: "B3LYP", atoms: ["O", "H", "H"], frames: [moved(0.05), moved(0.1)], energies: [-76.40, -76.41] },
      readers: ["cclib 1.9rc1"],
    }));
    const ran = st().runStep(step);
    await settle();
    await settle();
    Object.assign(jobs.get(idOf(1))!, { state: "done", started: 1000, ended: 61_000, log: "GEOMETRY OPTIMIZATION CYCLE 3" });
    await st().lookAtJobs();
    await ran;
    const failedSet = st().sets.find((b) => b.made?.step === step && b.made.exit === "failed")!;
    const stopped = st().molecules3d.find((m) => m.failed?.some((f) => f))!;
    // (its way there as frames, from the geometry it came in with to the last it reached; no energy of it a result)
    expect(stopped.frames?.length).toBe(2);
    expect([stopped.atoms[1].y - water.atoms[1].y, stopped.energies]).toEqual([0, undefined]);
    expect(stopped.failed?.[stopped.failed.length - 1]?.why).toBe("ORCA finished by error termination in SCF");
    const [entry] = setEntries([stopped], "molecules");
    expect(entry.xyz[4] - at[4]).toBeCloseTo(0.1, 9);
    expect([entry.energy, entryOfSet(entry, "x").properties.failure?.value]).toEqual([undefined, "ORCA finished by error termination in SCF"]);
    // (an optimisation after it, from its Failed exit: started from where it stopped, nothing of it a result - and said)
    const again = st().addStep("optimise", "orca", 40, 10);
    st().connect({ set: failedSet.id }, again);
    worker.prepare.mockImplementationOnce(async () => ({ jobs: [{ entries: [0], program: "orca", args: ["input.inp"], files: [{ name: "input.inp", text: "! OPT SlowConv\n" }], reads: [] }] }) as never);
    worker.collect.mockImplementationOnce(async () => ({ read: [{ kind: "orca", log: true, name: "water.out" }] }) as never);
    readOutput.mockImplementationOnce(async () => ({
      output: { schema: 1, program: "ORCA", version: "6.1.1", method: "B3LYP", atoms: ["O", "H", "H"], frames: [moved(0.1), moved(0.12)], energies: [-76.41, -76.42], optimised: true } as never,
      readers: ["cclib 1.9rc1"],
    }));
    const calls = worker.prepare.mock.calls.length;
    const ran2 = st().runStep(again);
    for (let i = 0; i < 20 && worker.prepare.mock.calls.length === calls; i++) await settle();
    await settle();
    expect(worker.prepare.mock.calls.length).toBe(calls + 1);
    expect((worker.prepare.mock.calls[worker.prepare.mock.calls.length - 1][1] as { atoms: { y: number }[] }[])[0].atoms[1].y - water.atoms[1].y).toBeCloseTo(0.1, 6);
    Object.assign(jobs.get(idOf(2))!, { state: "done", started: 1000, ended: 31_000, log: "ORCA TERMINATED NORMALLY" });
    await st().lookAtJobs();
    await ran2;
    const said = st().steps.find((s) => s.id === again)!.ran;
    expect(said).toMatchObject({ ok: true });
    expect(said?.said).toContain("started from a failed run's geometry");
    const done = st().molecules3d[st().molecules3d.length - 1];
    expect([done.energies?.[done.energies.length - 1], done.failed?.some((f) => f) ?? false]).toEqual([-76.42, false]);
  });

  it("says it was stopped, and brings nothing in", async () => {
    const { st, step } = editor();
    const ran = st().runStep(step);
    await settle();
    await settle();
    st().stopStep(step);
    expect(asked.stopped).toEqual([idOf(1)]);
    Object.assign(jobs.get(idOf(1))!, { state: "stopped", started: 1000, ended: 32_000 });
    await st().lookAtJobs();
    await ran;
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: false, stopped: true, said: "Stopped after 0:31" });
    expect(st().molecules3d).toHaveLength(1);
  });

  it("says why where a file it wrote could not be read - never taking it for one written empty", async () => {
    const { st, step } = editor();
    const ran = st().runStep(step);
    await settle();
    await settle();
    Object.assign(jobs.get(idOf(1))!, { state: "done", started: 1000, ended: 2000, files: { "xtbopt.log": TOO_LARGE } });
    await st().lookAtJobs();
    await ran;
    expect(worker.collect).not.toHaveBeenCalled();
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: false, said: "xtbopt.log is too large to read: 300 MB, past 256 MB" });
  });

  it("says why it failed, in the plugin's words", async () => {
    const { st, step } = editor();
    const ran = st().runStep(step);
    await settle();
    await settle();
    Object.assign(jobs.get(idOf(1))!, { state: "failed", started: 1000, ended: 2000, code: 1 });
    await st().lookAtJobs();
    await ran;
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: false, said: "Some atoms are very close" });
  });

  it("fails where its plugin read back a geometry it could not read - and holds up no other step, nor itself", async () => {
    const { st, step } = editor();
    const other = st().addStep("energy", "xtb", 10, 20);
    st().connect({ set: st().sets[0].id }, other);
    const ran = st().runAll();
    for (let i = 0; i < 5; i++) await settle();
    const stepOf = (id: number) => st().steps.find((s) => s.id === id)!;
    const jobOf = (id: number) => jobs.get(stepOf(id).running!.jobs[0].id)!;
    // both jobs ended well; the first one's output read back with a frame given as null
    worker.collect.mockImplementationOnce(async () => ({ outputs: [{ schema: 1, atoms: ["O", "H", "H"], frames: [null, [0, 0, 0, 0, 0.76, 0.59, 0, -0.76, 0.59]] }] }) as never);
    Object.assign(jobOf(step), { state: "done", started: 1000, ended: 2000, files: { "xtbopt.log": "-5.0705" } });
    Object.assign(jobOf(other), { state: "done", started: 1000, ended: 2000, files: { "xtbopt.log": "-5.0705" } });
    // (looked at once a second, as Workflow2D does)
    for (let i = 0; i < 3; i++) await st().lookAtJobs();
    await ran;
    expect(stepOf(step).running).toBeUndefined();
    expect(stepOf(step).ran).toMatchObject({ ok: false, said: "It read back a geometry Meno cannot read" });
    expect(stepOf(other).running).toBeUndefined();
    expect(stepOf(other).ran).toMatchObject({ ok: true });
    // (each job read back once, not once a second)
    expect(worker.collect).toHaveBeenCalledTimes(2);
  });

  it("says what went wrong where its results cannot be brought in - and its run ends, its jobs looked at no more", async () => {
    const { st, step } = editor();
    const ran = st().runStep(step);
    await settle();
    await settle();
    keepFails.push("The disk is full");
    Object.assign(jobs.get(idOf(1))!, { state: "done", started: 1000, ended: 2000, files: { "xtbopt.log": "-5.0705" } });
    await st().lookAtJobs();
    await ran;
    const after = st().steps.find((s) => s.id === step)!;
    expect(after.running).toBeUndefined();
    expect(after.ran).toMatchObject({ ok: false, said: "Its results could not be brought in: The disk is full", jobs: [idOf(1)] });
    expect(st().molecules3d).toHaveLength(1);
    await st().lookAtJobs();
    expect(worker.collect).toHaveBeenCalledTimes(1);
  });

  it("shows its log in the column, rising out of its step - its step its body, kept with the workspace", async () => {
    const { st, step } = editor();
    const ran = st().runStep(step);
    await settle();
    await settle();
    Object.assign(jobs.get(idOf(1))!, { state: "failed", started: 1000, ended: 2000, code: 1, log: "cycle 1\nfailed\n" });
    await st().lookAtJobs();
    await ran;
    await st().showStepLog(step);
    const log = st().texts.find((t) => t.name.endsWith("log"))!;
    expect(log).toMatchObject({ text: "cycle 1\nfailed\n", of: { step } });
    expect(log.at).toBeUndefined();
    expect(st()).toMatchObject({ textShown: log.id, textsOpen: true, textFlight: { id: log.id, to: "column" } });
    st().endTextFlight();
    // (shown again, the column showing it already: nothing rises)
    await st().showStepLog(step);
    expect(st().texts.filter((t) => t.name.endsWith("log"))).toHaveLength(1);
    expect(st().textFlight).toBeNull();
    const ws = readWorkspace(workspaceText(st(), new Set(), st().texts.map(() => "a".repeat(64))));
    expect(ws?.texts.find((t) => t.name === log.name)?.of).toEqual({ step });
  });

  it("shows the log of a step of several jobs in one text - the first, then another chosen - never a text for each", async () => {
    const { st, step, doc } = editor();
    // (three waters in its set: a job each)
    for (const x of [-1.5, 1.5])
      doc.edit("water", (d) =>
        addMolecule3d(d, {
          atoms: [
            { el: "O", x: 0, y: 0, z: 0 },
            { el: "H", x: 0, y: 0.76, z: 0.59 },
            { el: "H", x: 0, y: -0.76, z: 0.59 },
          ],
          bonds: [
            { a1: 0, a2: 1, order: 1 },
            { a1: 0, a2: 2, order: 1 },
          ],
          at: { x, y: 0 },
        }),
      );
    const ran = st().runStep(step);
    for (let k = 0; k < 6; k++) await settle();
    const ids = [...jobs.keys()];
    expect(ids).toHaveLength(3);
    ids.forEach((id, k) => Object.assign(jobs.get(id)!, { state: "failed", started: 1000, ended: 2000, code: 1, log: `job ${k + 1}\n` }));
    await st().lookAtJobs();
    await ran;
    await st().showStepLog(step);
    const logs = st().texts.filter((t) => t.name.endsWith("log"));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ text: "job 1\n", of: { step, jobs: ids, job: 0 } });
    await st().showStepLogJob(logs[0].id, 2);
    expect(st().texts.find((t) => t.id === logs[0].id)).toMatchObject({ text: "job 3\n", of: { step, jobs: ids, job: 2 } });
    // (shown again: the same text, still one)
    await st().showStepLog(step);
    expect(st().texts.filter((t) => t.name.endsWith("log"))).toHaveLength(1);
    // (kept with the workspace: its jobs and the one shown)
    const ws = readWorkspace(workspaceText(st(), new Set(), st().texts.map(() => "a".repeat(64))));
    expect(ws?.texts.find((t) => t.name === logs[0].name)?.of).toEqual({ step, jobs: ids, job: 2 });
    // (how each ended, kept with its run: said in its chooser in a workspace reopened, none looked at there)
    const ended = st().steps.find((x) => x.id === step)!.ran!;
    expect(ended.states).toEqual(["failed", "failed", "failed"]);
    const reopened = ws!.workflow!.steps.find((x) => x.id === step)!.ran!;
    expect(reopened.states).toEqual(["failed", "failed", "failed"]);
    expect(jobStateSaid(ids[1], {}, reopened)).toBe("failed");
    // (looked at in this session: as last looked at)
    expect(jobStateSaid(ids[1], { [ids[1]]: { state: "running" } }, reopened)).toBe("running");
    // (two chosen quickly, the first read late: the last chosen is the one shown)
    logDelay.set(ids[0], 50);
    const first = st().showStepLogJob(logs[0].id, 0);
    const second = st().showStepLogJob(logs[0].id, 1);
    await Promise.all([first, second]);
    logDelay.clear();
    expect(st().texts.find((t) => t.id === logs[0].id)).toMatchObject({ text: "job 2\n", of: { job: 1 } });
    // (a log of one of several jobs as it was named before, shown again: named as the step's log)
    doc.amend((x) => ({ ...x, texts: (x.texts ?? []).map((t) => (t.id === logs[0].id ? { ...t, name: `${t.name} 1` } : t)) }));
    await st().showStepLog(step);
    expect(st().texts.find((t) => t.id === logs[0].id)!.name).toBe(logs[0].name);
  });

  it("reads a step's log as a file keeps it: its jobs where they are jobs' ids and the one shown among them - else a log of one job, as one before them was", () => {
    const read = (of: unknown) => readWorkspace(JSON.stringify({ format: "meno-workspace", version: 2, atoms: [], bonds: [], texts: [{ name: "Optimise log", sha256: "a".repeat(64), text: "x", of }] }))?.texts[0]?.of;
    const good = [idOf(1), idOf(2)];
    expect(read({ step: 3, jobs: good, job: 1 })).toEqual({ step: 3, jobs: good, job: 1 });
    // (the one shown past its jobs: the first)
    expect(read({ step: 3, jobs: good, job: 5 })).toEqual({ step: 3, jobs: good, job: 0 });
    // (a job's id not as jobs are named - a path, markup: none of them taken)
    expect(read({ step: 3, jobs: [idOf(1), "../../etc"], job: 0 })).toEqual({ step: 3 });
    expect(read({ step: 3, jobs: [idOf(1), "<b>x</b>"] })).toEqual({ step: 3 });
    // (from before: a step's log with no jobs)
    expect(read({ step: 3 })).toEqual({ step: 3 });
  });

  it("is its plugin's: its calculation changed to another the plugin does, with the options it takes for that one, those they share kept - never to one it does not", () => {
    const { st, step } = editor();
    st().updateStep(step, { options: { method: "gfn1", solvent: "water", level: "tight" } });
    // (the step's own: the defaults are Settings', and stay as they were)
    expect(useAppSettings.getState().options["step:xtb:optimise"]).toBeUndefined();
    st().updateStep(step, { kind: "frequencies" });
    const s = st().steps.find((x) => x.id === step)!;
    expect(s.kind).toBe("frequencies");
    expect(s.by).toBe("xtb");
    expect(s.options).toEqual({ method: "gfn1", solvent: "water" });
    st().updateStep(step, { kind: "duplicates" });
    expect(st().steps.find((x) => x.id === step)!.kind).toBe("frequencies");
  });

  it("asks before a running step is deleted - and, deleted, stops its jobs, their files left until finished jobs are cleared", async () => {
    const { st, step } = editor();
    void st().runStep(step);
    await settle();
    await settle();
    st().removeStep(step);
    expect(st().askDeleteStep).toBe(step);
    expect(st().steps).toHaveLength(1);
    st().removeStep(step, true);
    expect(st().steps).toHaveLength(0);
    expect(st().askDeleteStep).toBeNull();
    await settle();
    expect(asked.stopped).toEqual([idOf(1)]);
    expect(asked.removed).toEqual([]);
  });

  it("deleted while it runs - the only step running, its jobs looked at no more - ends its run: nothing waits on it for good", async () => {
    const { st, step } = editor();
    const ran = st().runStep(step);
    await settle();
    await settle();
    st().removeStep(step, true);
    const ended = await Promise.race([ran.then(() => "ended"), new Promise((go) => setTimeout(() => go("waits"), 200))]);
    expect(ended).toBe("ended");
  });

  it("run again straight after it was stopped, runs anew once the stop has come through", async () => {
    const { st, step } = editor();
    const first = st().runStep(step);
    await settle();
    await settle();
    st().stopStep(step);
    Object.assign(jobs.get(idOf(1))!, { state: "stopped", started: 1000, ended: 2000 });
    const again = st().runStep(step);
    await st().lookAtJobs();
    await first;
    await settle();
    await settle();
    expect(asked.started).toHaveLength(2);
    Object.assign(jobs.get(idOf(2))!, { state: "done", started: 3000, ended: 4000, files: { "xtbopt.log": "-5.0705" } });
    await st().lookAtJobs();
    await again;
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: true });
  });

  it("deleted while its jobs are being started, starts no more - and stops those started, and takes them away", async () => {
    const { st, step } = waters(3);
    let go = () => {};
    holdStart = new Promise((r) => (go = r));
    const ran = st().runStep(step);
    for (let i = 0; i < 8 && !asked.started.length; i++) await settle();
    expect(asked.started).toHaveLength(1);
    st().removeStep(step, true);
    holdStart = null;
    // (the runner stops it as soon as it is asked)
    end(1, "stopped");
    go();
    await ran;
    for (let i = 0; i < 4; i++) await settle();
    expect(asked.started).toHaveLength(1);
    expect(asked.stopped).toEqual([idOf(1)]);
    expect(asked.removed).toEqual([idOf(1)]);
    expect(st().steps).toHaveLength(0);
  });

  it("deleted while its jobs are being started, takes away only those it started - never one taken up again", async () => {
    const { st, step } = waters(2);
    const first = st().runStep(step);
    await settle();
    await settle();
    end(1);
    end(2);
    await st().lookAtJobs();
    await first;
    expect(asked.started).toHaveLength(2);
    // (run again: the first entry's job the same - taken up again - the second's another, held as it starts)
    const job = (entry: number, level: string) => ({ entries: [entry], program: "xtb", args: ["input.xyz", "--opt", level], files: [{ name: "input.xyz", text: "3\n\n" }], reads: ["xtbopt.log"] });
    worker.prepare.mockImplementationOnce(async () => ({ jobs: [job(0, "normal"), job(1, "tight")] }) as never);
    let go = () => {};
    holdStart = new Promise((r) => (go = r));
    const ran = st().runStep(step);
    for (let i = 0; i < 8 && asked.started.length < 3; i++) await settle();
    expect(asked.started).toHaveLength(3);
    st().removeStep(step, true);
    holdStart = null;
    end(3, "stopped");
    go();
    await ran;
    for (let i = 0; i < 4; i++) await settle();
    expect(asked.removed).toEqual([idOf(3)]);
    expect(asked.stopped).toEqual([idOf(3)]);
  });

  it("brings in what the jobs done gave where another went without finishing - that one out of its Failed exit, with why", async () => {
    const { st, step } = waters(3);
    const ran = st().runStep(step);
    await settle();
    await settle();
    expect(asked.started).toHaveLength(3);
    end(1);
    end(2, "gone");
    end(3);
    await st().lookAtJobs();
    await ran;
    // (done, on what was done - what follows runs on it - the one that failed counted by why)
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: true, said: "0:01 \u00b7 2 of 3 \u00b7 1 of 3 failed (1: stopped before it finished)" });
    expect(st().molecules3d).toHaveLength(3 + 2 + 1);
    // (it, as it came in, in the step's Failed exit's set, saying why)
    const failedSet = resultOf(st(), step, "failed")!;
    const failedOnes = setMembers(st(), failedSet).molecules.map((id) => st().molecules3d.find((m) => m.id === id)!);
    expect(failedOnes.map((m) => m.failed)).toEqual([[{ kind: "stopped", why: "It stopped without finishing" }]]);
  });

  it("counts a job that failed as each entry it was for - and says why in its runner's words, where the runner said", async () => {
    const { st, step } = waters(3);
    const two = { program: "xtb", args: [], files: [], reads: ["xtbopt.log"] };
    worker.prepare.mockImplementationOnce(async () => ({ jobs: [{ entries: [0, 1], ...two }, { entries: [2], ...two }] }) as never);
    const ran = st().runStep(step);
    await settle();
    await settle();
    end(1, "failed", { why: "xtb could not be started" });
    end(2);
    await st().lookAtJobs();
    await ran;
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: true, said: "0:01 \u00b7 1 of 3 \u00b7 2 of 3 failed (2: not started)" });
    expect(st().molecules3d).toHaveLength(3 + 1 + 2);
    // (where it did not: the plugin's, for each entry of the job)
    worker.prepare.mockImplementationOnce(async () => ({ jobs: [{ entries: [0, 1], ...two }, { entries: [2], ...two }] }) as never);
    const again = st().runStep(step);
    await settle();
    await settle();
    end(3, "failed");
    end(4);
    await st().lookAtJobs();
    await again;
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: true, said: "0:01 \u00b7 1 of 3 \u00b7 2 of 3 failed (2: the program stopped with an error)" });
  });

  it("runs the jobs its plugin prepared, and sends an entry it refused out of its Failed exit, with why - kept with the workspace while it runs", async () => {
    const { st, step } = waters(3);
    const one = { program: "xtb", args: [], files: [], reads: ["xtbopt.log"] };
    const why = "xTB: xTB's frequencies here take no isotope's mass: 2H would be given as H of natural mass.";
    worker.prepare.mockImplementationOnce(async () => ({ jobs: [{ entries: [0], ...one }, { entries: [2], ...one }], refused: [{ entry: 1, why }] }) as never);
    const ran = st().runStep(step);
    await settle();
    await settle();
    expect(asked.started).toHaveLength(2);
    // (saved while it runs: what was refused is kept, to be said when it ends)
    const saved = readWorkspace(workspaceText(st()))!;
    expect(saved.workflow?.steps.find((s) => s.id === step)?.running?.refused).toEqual([{ entry: 1, kind: "refused", why }]);
    end(1);
    end(2);
    await st().lookAtJobs();
    await ran;
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: true, said: "0:01 \u00b7 2 of 3 \u00b7 1 of 3 failed (1: refused)" });
    const failedSet = resultOf(st(), step, "failed")!;
    const failedOnes = setMembers(st(), failedSet).molecules.map((id) => st().molecules3d.find((m) => m.id === id)!);
    expect(failedOnes.map((m) => m.failed)).toEqual([[{ kind: "refused", why }]]);
  });

  it("refuses a skeleton among what came in - its hydrogens not there - out of its Failed exit, never sent; the rest run", async () => {
    const made = waters(3);
    const { st, step } = made;
    // (the second water's oxygen alone: no hydrogens, not said to be whole without any)
    made.doc.edit("skeleton", (d) => ({ ...d, molecules3d: d.molecules3d!.map((m, i) => (i === 1 ? { ...m, atoms: [m.atoms[0]], bonds: [], bondOrders: "unknown" as const } : m)) }));
    const ran = st().runStep(step);
    await settle();
    await settle();
    expect(worker.prepare.mock.calls[0][1]).toHaveLength(2);
    expect(asked.started).toHaveLength(2);
    end(1);
    end(2);
    await st().lookAtJobs();
    await ran;
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: true, said: "0:01 \u00b7 2 of 3 \u00b7 1 of 3 failed (1: refused)" });
    const failedOnes = setMembers(st(), resultOf(st(), step, "failed")!).molecules.map((id) => st().molecules3d.find((m) => m.id === id)!);
    expect(failedOnes.map((m) => [m.atoms.length, m.failed?.[0]?.kind, m.failed?.[0]?.why])).toEqual([[1, "refused", expect.stringMatching(/^This molecule has no hydrogens/)]]);
  });

  it("sends an optimisation that did not converge out of its Failed exit - its path and the last geometry it reached, never passed on as done - kept so when saved", async () => {
    const { st, step } = waters(2);
    const base = worker.collect.getMockImplementation()!;
    worker.collect.mockImplementationOnce(base).mockImplementationOnce(async (...args: Parameters<typeof base>) => {
      const r = await base(...args);
      return r.outputs ? { outputs: r.outputs.map((o) => ({ ...o, optimised: false })) } : r;
    });
    const ran = st().runStep(step);
    await settle();
    await settle();
    end(1);
    end(2);
    await st().lookAtJobs();
    await ran;
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: true, said: "0:01 \u00b7 1 of 2 \u00b7 1 of 2 failed (1: not converged)" });
    const done = setMembers(st(), resultOf(st(), step)!).molecules;
    const failedIds = setMembers(st(), resultOf(st(), step, "failed")!).molecules;
    expect([done.length, failedIds.length]).toEqual([1, 1]);
    const failed = st().molecules3d.find((m) => m.id === failedIds[0])!;
    // (its path, ending at the last geometry it reached - the failure that one's)
    expect(failed.frames).toHaveLength(1);
    expect(failed.failed).toEqual([null, { kind: "not-converged", why: "The optimisation did not converge" }]);
    // (taken on from its Failed exit: one entry, the last geometry, saying why)
    expect(setEntries([failed], "molecules").map((e) => e.failed)).toEqual([{ kind: "not-converged", why: "The optimisation did not converge" }]);
    // (saved and opened again, as it was)
    const saved = readWorkspace(workspaceText(st()))!;
    const doc2 = createWorkspaceDocument();
    const store2 = createEditorStore(doc2);
    connectStoreToDocument(store2, doc2);
    store2.getState().openWorkspace(saved, true);
    expect(store2.getState().molecules3d.map((m) => m.failed ?? null)).toEqual(st().molecules3d.map((m) => m.failed ?? null));
  });

  it("says where a job asks for more memory than jobs may use - nothing else that declares memory runs beside it - kept with the workspace while it runs", async () => {
    const { st, step } = waters(2);
    const job = { program: "xtb", args: [], files: [], reads: ["xtbopt.log"] };
    worker.prepare.mockImplementationOnce(async () => ({ jobs: [{ entries: [0], ...job, memory: 30 * 1024 }, { entries: [1], ...job, memory: 1000 }] }) as never);
    const ran = st().runStep(step);
    await settle();
    await settle();
    expect(asked.started.map((a) => a.memory)).toEqual([30 * 1024, 1000]);
    const over = "1 job asks for more memory (30.0 GB) than jobs may use (24.0 GB): nothing else that declares memory runs beside it";
    expect(st().steps.find((s) => s.id === step)!.running?.over).toBe(over);
    end(1);
    end(2);
    await st().lookAtJobs();
    await ran;
    expect(st().steps.find((s) => s.id === step)!.ran!.said).toBe(`0:01 \u00b7 2 of 2 \u00b7 ${over}`);
  });

  it("takes up again a job it ran to the end, its key the same - starting none - and runs one whose key changed", async () => {
    const { st, step } = editor();
    const first = st().runStep(step);
    await settle();
    await settle();
    end(1);
    await st().lookAtJobs();
    await first;
    const ran = st().steps.find((s) => s.id === step)!.ran!;
    expect(ran.keys).toHaveLength(1);
    expect(asked.started).toHaveLength(1);
    // (run again, nothing changed: its job's key ran to the end - not run again, what it gave taken up again)
    await st().runStep(step);
    await settle();
    await settle();
    await st().lookAtJobs();
    await settle();
    expect(asked.started).toHaveLength(1);
    const again = st().steps.find((s) => s.id === step)!.ran!;
    expect(again).toMatchObject({ ok: true, jobs: [idOf(1)], keys: ran.keys });
    expect(again.said).toMatch(/ \u00b7 Reused$/);
    // (another level: its plugin asks for another run - another key, run)
    st().updateStep(step, { options: { level: "tight" } });
    worker.prepare.mockImplementationOnce(async () => ({ jobs: [{ entries: [0], program: "xtb", args: ["input.xyz", "--opt", "tight"], files: [{ name: "input.xyz", text: "3\n\n" }], reads: ["xtbopt.log"] }] }) as never);
    const third = st().runStep(step);
    await settle();
    await settle();
    expect(asked.started).toHaveLength(2);
    end(2);
    await st().lookAtJobs();
    await third;
    expect(st().steps.find((s) => s.id === step)!.ran!.keys).not.toEqual(ran.keys);
  });

  it("takes a job up again only while it gives what it gave: its files changed since, the step stops on it", async () => {
    const { st, step } = editor();
    const first = st().runStep(step);
    await settle();
    await settle();
    end(1);
    await st().lookAtJobs();
    await first;
    expect(st().steps.find((s) => s.id === step)!.ran!.gave).toEqual([digestOf(idOf(1))]);
    // (kept with the workspace, beside its key)
    expect(readWorkspace(workspaceText(st()))!.workflow!.steps.find((s) => s.id === step)!.ran!.gave).toEqual([digestOf(idOf(1))]);
    // (its output written over since - by hand, say, or by another program: taken up again, it is not what was read)
    jobs.get(idOf(1))!.files["xtbopt.log"] = "-9.9999";
    await st().runStep(step);
    await settle();
    await settle();
    await st().lookAtJobs();
    await settle();
    expect(asked.started).toHaveLength(1);
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({
      ok: false,
      said: `Output Meno cannot account for: ${idOf(1)} (its files have changed since they were read)`,
      unaccounted: [idOf(1)],
    });
  });

  it("keys a program installed separately by itself as it is now: replaced, its job runs again; not to be told, none is taken up again", async () => {
    useReaders.setState({ state: { orca: "added" }, problem: {} });
    installedAt.orca = "/Applications/orca_6/orca";
    stamps["/Applications/orca_6/orca"] = "/Applications/orca_6/orca\n1000\n1";
    const orca = () => ({ jobs: [{ entries: [0], program: "orca", args: ["input.inp"], files: [{ name: "input.inp", text: "! SP\n" }], reads: [] }] }) as never;
    const [prepare, collect] = [worker.prepare.getMockImplementation()!, worker.collect.getMockImplementation()!];
    worker.prepare.mockImplementation(async () => orca());
    worker.collect.mockImplementation(async () => ({ read: [{ kind: "orca", log: true, name: "water.out" }] }) as never);
    try {
      const { st } = editor();
      const step = st().addStep("energy", "orca", 10, 10);
      st().connect({ set: st().sets[0].id }, step);
      const runOnce = async (n: number) => {
        const ran = st().runStep(step);
        await settle();
        await settle();
        if (jobs.has(idOf(n)) && jobs.get(idOf(n))!.state === "waiting") end(n, "done", { log: "ORCA's output" });
        await st().lookAtJobs();
        await ran;
        return st().steps.find((s) => s.id === step)!.ran!;
      };
      const once = await runOnce(1);
      expect(once.ok).toBe(true);
      // (the same program as it was: taken up again)
      expect((await runOnce(2)).said).toMatch(/ \u00b7 Reused$/);
      expect(asked.started).toHaveLength(1);
      // (replaced - though it says the same version: another key, run)
      stamps["/Applications/orca_6/orca"] = "/Applications/orca_6/orca\n1000\n2";
      const replaced = await runOnce(2);
      expect(asked.started).toHaveLength(2);
      expect(replaced.keys).not.toEqual(once.keys);
      // (not to be told: run, nothing taken up again)
      delete stamps["/Applications/orca_6/orca"];
      await runOnce(3);
      expect(asked.started).toHaveLength(3);
    } finally {
      worker.prepare.mockImplementation(prepare);
      worker.collect.mockImplementation(collect);
    }
  });

  it("stops on output it cannot account for - a job whose key is not its own, or one made before its run began - naming it, bringing nothing in", async () => {
    const { st, step } = waters(2);
    const ran = st().runStep(step);
    await settle();
    await settle();
    // (one job's folder holding another job's - its key not the one asked for - and the other made long before)
    Object.assign(jobs.get(idOf(1))!, { key: "0".repeat(64) });
    end(1);
    end(2, "done", { created: Date.now() - 3_600_000 });
    await st().lookAtJobs();
    await ran;
    const done = st().steps.find((s) => s.id === step)!.ran!;
    expect(done.ok).toBe(false);
    expect(done.said).toBe(`Output Meno cannot account for: ${idOf(1)} (its key is not the one it was asked for with); ${idOf(2)} (made before this run began)`);
    expect(st().molecules3d).toHaveLength(2);
    // (adopted one at a time, on purpose: the other still stops it - kept so in the workspace's file)
    await st().adoptJob(step, idOf(1));
    const one = st().steps.find((s) => s.id === step)!.ran!;
    expect(one.said).toBe(`Output Meno cannot account for: ${idOf(2)} (made before this run began)`);
    expect(Object.keys(one.held!.adopted!)).toEqual([idOf(1)]);
    const saved = readWorkspace(workspaceText(st()))!;
    expect(saved.workflow!.steps.find((s) => s.id === step)!.ran).toMatchObject({ unaccounted: [idOf(2)], held: { adopted: { [idOf(1)]: expect.any(Number) } } });
    // (the second adopted: what they gave comes in, said adopted, each with when)
    await st().adoptJob(step, idOf(2));
    const both = st().steps.find((s) => s.id === step)!.ran!;
    expect(both.ok).toBe(true);
    expect(both.said).toMatch(/ \u00b7 2 adopted$/);
    expect(Object.keys(both.adopted!)).toEqual([idOf(1), idOf(2)]);
    expect(st().molecules3d).toHaveLength(4);
    // (what they gave says so, wherever its calculation is shown)
    const made = setMembers(st(), resultOf(st(), step)!).molecules.map((m) => st().molecules3d.find((x) => x.id === m)!);
    expect(made.map((m) => m.calc?.adopted)).toEqual([both.adopted![idOf(1)], both.adopted![idOf(2)]]);
    expect(calcLine(made[0].calc!)).toMatch(/^adopted output \u00b7 xtb 6\.7\.1/);
    // (a job never stopped on is not adopted)
    await st().adoptJob(step, idOf(9));
    expect(st().steps.find((s) => s.id === step)!.ran).toBe(both);
  });

  it("stops on a job folder with no record of how it ran - and, adopted, reads it as one done", async () => {
    const { st, step } = editor();
    const ran = st().runStep(step);
    await settle();
    await settle();
    end(1, "gone", { why: "it has no record of how it ran", files: { "xtbopt.log": "-5.0705" } });
    await st().lookAtJobs();
    await ran;
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: false, said: `Output Meno cannot account for: ${idOf(1)} (its folder has no record of how it ran)`, unaccounted: [idOf(1)] });
    await st().adoptJob(step, idOf(1));
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: true, adopted: { [idOf(1)]: expect.any(Number) } });
    expect(st().steps.find((s) => s.id === step)!.ran!.said).toMatch(/ \u00b7 1 adopted$/);
  });

  it("deleted, keeps the folder of a job another step's run took up again", async () => {
    const { st, step } = editor();
    const run = st().runStep(step);
    await settle();
    await settle();
    end(1);
    await st().lookAtJobs();
    await run;
    // (a second step on the same set, the same: it takes the first's job up again)
    const set = st().sets[0].id;
    const twin = st().addStep("optimise", "xtb", 10, 30);
    st().connect({ set }, twin);
    await st().runStep(twin);
    await settle();
    await settle();
    await st().lookAtJobs();
    await settle();
    expect(st().steps.find((s) => s.id === twin)!.ran).toMatchObject({ jobs: [idOf(1)] });
    st().removeStep(step);
    await settle();
    expect(asked.removed).not.toContain(idOf(1));
  });

  it("keeps what a conformer stands for through an optimisation: its degeneracy, and its mirror image's atoms where Duplicates counted one in", async () => {
    const { doc, st, step } = editor();
    // (water as a conformer set of two, the first standing for its mirror image too - its hydrogens swapped)
    doc.edit("conformers", (d) => ({
      ...d,
      molecules3d: d.molecules3d!.map((m) => ({ ...m, frames: [[0, 0, 0.01, 0, 0.77, 0.6, 0, -0.75, 0.58]], conformerSet: true, degeneracies: [2, 1], mirrors: [[0, 2, 1], null] })),
    }));
    expect(setEntries(st().molecules3d, "conformers").map((e) => [e.degeneracy, e.mirror ?? null])).toEqual([
      [2, [0, 2, 1]],
      [1, null],
    ]);
    const ran = st().runStep(step);
    await settle();
    await settle();
    end(1);
    end(2);
    await st().lookAtJobs();
    await ran;
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: true });
    const out = setMembers(st(), resultOf(st(), step)!).molecules.map((id) => st().molecules3d.find((m) => m.id === id)!);
    expect(out.map((m) => [m.degeneracies, m.mirrors])).toEqual([[[2, 1], [[0, 2, 1], null]]]);
  });

  it("deleted while it runs and then undone, comes back no longer running: its jobs were stopped", async () => {
    const { doc, st, step } = editor();
    const ran = st().runStep(step);
    await settle();
    await settle();
    st().removeStep(step, true);
    await settle();
    // (stopped by the deletion: the runner says so)
    Object.assign(jobs.get(idOf(1))!, { state: "stopped", started: 1000, ended: 2000 });
    doc.undo();
    expect(st().steps.find((s) => s.id === step)).toBeTruthy();
    await st().lookAtJobs();
    await ran;
    const back = st().steps.find((s) => s.id === step)!;
    expect(back.running).toBeUndefined();
    expect(back.ran).toMatchObject({ ok: false, stopped: true });
  });
});

/** A page with three conformers of water, energies apart, in a set: wired into As conformers, then Energy window, then Populations - Meno's. */
function chain() {
  const doc = createWorkspaceDocument();
  const geo = (k: number) => [0, 0, 0, 0, 0.76 + 0.02 * k, 0.59, 0, -0.76, 0.59];
  doc.edit("water", (d) =>
    addMolecule3d(d, {
      atoms: [
        { el: "O", x: 0, y: 0, z: 0 },
        { el: "H", x: 0, y: 0.76, z: 0.59 },
        { el: "H", x: 0, y: -0.76, z: 0.59 },
      ],
      bonds: [
        { a1: 0, a2: 1, order: 1 },
        { a1: 0, a2: 2, order: 1 },
      ],
      frames: [geo(1), geo(2)],
      energies: [-76, -76 + 1 / 627.5, -76 + 5 / 627.5],
      at: { x: 0, y: 0 },
    }),
  );
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  const set = st().addSet({ x0: -3, y0: -3, x1: 3, y1: 3 });
  const a = st().addStep("as-conformers", "meno", 10, 0);
  st().connect({ set }, a);
  const b = st().addStep("energy-window", "meno", 30, 0);
  // (each step's exit, the set it makes, into the next)
  st().connect({ set: resultOf(st(), a)!.id }, b);
  const c = st().addStep("populations", "meno", 50, 0);
  st().connect({ set: resultOf(st(), b)!.id }, c);
  return { doc, st, a, b, c };
}

describe("running a workflow's steps", () => {
  beforeEach(() => {
    jobs.clear();
    next = 1;
    asked.started = [];
    useReaders.setState({ state: { xtb: "added" }, problem: {} });
  });

  it("runs a step from here: it, and every step after it, in order", async () => {
    const { st, a, b, c } = chain();
    await st().runFrom(a);
    expect([a, b, c].map((id) => st().steps.find((s) => s.id === id)!.ran?.ok)).toEqual([true, true, true]);
    // (Populations on what the window kept: the conformer 5 kcal/mol up set aside)
    expect(st().steps.find((s) => s.id === b)!.ran!.said).toBe("2 of 3 kept, on electronic energies");
  });

  it("asks first which stereoisomer each entry is, for As conformers and Populations - every conformer its own - and its entries carry it", async () => {
    forgetStereo();
    configured.length = 0;
    const { st, b, c } = chain();
    await st().runFrom(c);
    // (asked once, by As conformers, for all three, each its own geometry; Populations' two, the window's, known by then)
    const kept = setEntries(st().molecules3d.filter((m) => setMembers(st(), st().sets.find((x) => x.made?.step === b)!).molecules.includes(m.id)), "conformers");
    expect(configured.map((blocks) => blocks.length)).toEqual([3]);
    expect(kept).toHaveLength(2);
    expect(kept.map((e) => (e.stereo?.perceived ? e.stereo.key : null))).toEqual(kept.map(() => `k${configured[0][0].split("\n").length}`));
  });

  it("runs all that have not run or have changed - and leaves those done as they are", async () => {
    const { st, a, b, c } = chain();
    await st().runStep(b);
    const before = st().steps.find((s) => s.id === a)!.ran!.at;
    await st().runAll();
    expect(st().steps.find((s) => s.id === c)!.ran?.ok).toBe(true);
    expect(st().steps.find((s) => s.id === a)!.ran!.at).toBe(before);
  });

  /** The chain with Duplicates between Energy window and Populations, all run; and what each step's card says, in the chain's order. */
  async function longer() {
    const { doc, st, a, b, c } = chain();
    const d = st().addStep("duplicates", "meno", 40, 0);
    st().connect({ set: resultOf(st(), b)!.id }, d);
    st().connect({ set: resultOf(st(), d)!.id }, c);
    await st().runFrom(a);
    const stepOf = (id: number) => st().steps.find((s) => s.id === id)!;
    const states = () => [a, b, d, c].map((id) => stateOf(doc.getState(), stepOf(id), byOf(stepOf(id))));
    const reruns = () => [a, b, d, c].map((id) => stepOf(id).runs?.length ?? 0);
    expect(states()).toEqual(["done", "done", "done", "done"]);
    return { st, a, b, c, states, reruns };
  }

  it("runs a step changed two links back, and every step between, before the step it runs - in order", async () => {
    const { st, b, c, states, reruns } = await longer();
    // Energy window's options changed: it reads as changed, the steps after it as done
    st().updateStep(b, { options: { window: 0.5 } });
    expect(states()).toEqual(["done", "changed", "done", "done"]);
    await st().runStep(c);
    // each run again on what the one before it gave anew; As conformers, before it, left as it was
    expect(states()).toEqual(["done", "done", "done", "done"]);
    expect(reruns()).toEqual([0, 1, 1, 1]);
  });

  it("runs all: a step changed, and every step after it - those before it left as they are", async () => {
    const { st, b, states, reruns } = await longer();
    st().updateStep(b, { options: { window: 0.5 } });
    await st().runAll();
    expect(states()).toEqual(["done", "done", "done", "done"]);
    expect(reruns()).toEqual([0, 1, 1, 1]);
  });

  it("runs steps that do not wait on one another at once", async () => {
    const { st } = editor();
    const set = st().sets[0].id;
    const other = st().addStep("energy", "xtb", 10, 20);
    st().connect({ set }, other);
    void st().runAll();
    await settle();
    await settle();
    await settle();
    // (both prepared and started before either has ended)
    expect(asked.started.map((x) => x.args?.slice(0, 2))).toEqual(expect.arrayContaining([["input.xyz", "--opt"]]));
    expect(asked.started).toHaveLength(2);
    st().stopAll();
  });

  it("keeps its earlier runs, each with what it gave, and shows one again - one step to undo", async () => {
    const { doc, st, a, b } = chain();
    await st().runFrom(a);
    st().updateStep(b, { options: { window: 0.5 } });
    await st().runStep(b);
    const step = () => st().steps.find((s) => s.id === b)!;
    expect(step().ran!.said).toBe("1 of 3 kept, on electronic energies");
    expect(step().runs).toHaveLength(1);
    expect(step().runs![0]).toMatchObject({ options: { window: 3 }, kind: "energy-window" });
    expect(step().runs![0].results!.holds).toBe("conformers");
    // shown again: its results back in the set, the later run kept in its place
    st().showRun(b, 0);
    expect(step().ran!.said).toBe("2 of 3 kept, on electronic energies");
    expect(step().runs![0].options).toEqual({ window: 0.5 });
    // (and what it set aside then back in its second exit's set)
    expect(countOf(st(), resultOf(st(), b, "rest")!).entries).toBe(1);
    expect(doc.history().undoLabel).toBe("show run");
    doc.undo();
    expect(step().ran!.said).toBe("1 of 3 kept, on electronic energies");
  });
});

describe("a plugin's conformer search, and its duplicates", () => {
  beforeEach(() => {
    jobs.clear();
    next = 1;
    useReaders.setState({ state: { rdkit: "added" }, problem: {} });
  });

  it("brings each compound's conformers in as a conformer set - numbered, with their energies", async () => {
    const { st } = editor();
    const set = st().sets[0].id;
    const step = st().addStep("conformers", "rdkit", 10, 20);
    st().connect({ set }, step);
    const ran = st().runStep(step);
    await settle();
    await settle();
    Object.assign(jobs.get(idOf(1))!, { state: "done", started: 1000, ended: 9000, files: { "xtbopt.log": "-5.0705" } });
    await st().lookAtJobs();
    await ran;
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: true, said: "0:08 \u00b7 2 conformers" });
    const made = st().sets.find((b) => b.made?.step === step)!;
    expect(made.made!.holds).toBe("conformers");
    const m = st().molecules3d[1];
    expect(m).toMatchObject({ conformerSet: true, numbers: [1, 2], energies: [-5.0703, -5.0705] });
    expect(m.frames).toHaveLength(1);
  });

  it("says a plugin does not do a step it fills no more, before it asks it anything (a workspace's step from before)", async () => {
    const { doc, st } = editor();
    doc.edit("water", (d) => addMolecule3d(d, { ...d.molecules3d![0], at: { x: 1, y: 1 } }));
    const set = st().sets[0].id;
    // (RDKit's Duplicates, as a workspace saved before RDKit plugin 0.1.16 has it)
    const step = st().addStep("duplicates", "rdkit", 10, 20);
    st().connect({ set }, step);
    worker.run.mockClear();
    await st().runStep(step);
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: false, said: "RDKit does not do Duplicates" });
    expect(worker.run).not.toHaveBeenCalled();
  });

});

describe("Render as a step", () => {
  beforeEach(() => {
    jobs.clear();
    next = 1;
    asked.started = [];
    worker.prepare.mockClear();
    worker.collect.mockClear();
    madeFiles.clear();
    useReaders.setState({ state: { blender: "added" }, problem: {} });
    installedAt.blender = "/Applications/Blender.app/Contents/MacOS/Blender";
  });

  /** The Blender plugin's worker, as the test has it: a job for the scene, and the picture it made. */
  const rendering = () => {
    worker.prepare.mockImplementationOnce(async () => ({ jobs: [{ entries: [0], program: "blender", args: ["-b", "-P", "render.py"], files: [{ name: "render.json", text: "{}" }], reads: [] }] }) as never);
    worker.collect.mockImplementationOnce(async () => ({ made: [{ entry: 0, file: "picture.png", media: "image/png" }] }) as never);
  };

  it("renders each entry as a picture of its own, in a set of pictures wired from the step - and run again, makes it anew in that set, one step to undo", async () => {
    const { doc, st } = editor();
    const step = st().addStep("render", "blender", 10, 0);
    st().connect({ set: st().sets[0].id }, step);
    // (Meno's own choices first, then Blender's - the role's, asked as a step)
    expect(optionsFor("render", "blender").map((o) => o.id).slice(0, 5)).toEqual(["width", "shape", "look", "molecules", "surfaces"]);
    expect(optionsFor("render", "blender").map((o) => o.id)).toContain("engine");
    // (it gives pictures, which no step takes: nothing is wired from it)
    expect(canWire(st(), { set: resultOf(st(), step)!.id }, st().addStep("energy", "xtb", 30, 0))).toBe(false);

    rendering();
    let ran = st().runStep(step);
    await settle();
    await settle();
    // the scene Meno wrote put in the job's folder; the plugin given its own options alone
    expect(asked.started[0]).toMatchObject({ plugin: "blender", program: "blender" });
    expect(asked.started[0].files!.map((f) => f.name)).toEqual(["render.json", "scene.gltf"]);
    expect(JSON.parse(asked.started[0].files![1].text).asset.version).toBe("2.0");
    const given = (worker.prepare.mock.calls[0] as unknown[])[2];
    expect(given).not.toHaveProperty("width");
    expect(given).toHaveProperty("engine");
    madeFiles.set(`/jobs/${idOf(1)}/picture.png`, png(240, 120, 1));
    Object.assign(jobs.get(idOf(1))!, { state: "done", started: 1000, ended: 13_000 });
    await st().lookAtJobs();
    await ran;
    const first = st().pictures;
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ media: "image/png", px: [240, 120] });
    // (in the step's result set - a set of pictures, to its right - as a calculation's molecules are in theirs)
    const set = st().sets.find((b) => b.made?.step === step)!;
    expect(set.made).toEqual({ step, exit: "out", holds: "pictures" });
    expect(setMembers(st(), set).pictures).toEqual([first[0].id]);
    expect(set.x0).toBeGreaterThan(st().steps.find((s) => s.id === step)!.x + CARD_W);
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: true, said: "0:12 \u00b7 1 picture" });
    expect(doc.history().undoLabel).toBe("render");

    // run again: its picture made anew, the earlier one gone - one step to undo
    rendering();
    ran = st().runStep(step);
    await settle();
    await settle();
    madeFiles.set(`/jobs/${idOf(2)}/picture.png`, png(240, 120, 2));
    Object.assign(jobs.get(idOf(2))!, { state: "done", started: 1000, ended: 2000 });
    await st().lookAtJobs();
    await ran;
    expect(st().pictures).toHaveLength(1);
    expect(st().pictures[0].sha256).not.toBe(first[0].sha256);
    expect(st().sets.filter((b) => b.made?.step === step).map((b) => b.id)).toEqual([set.id]);
    expect(setMembers(st(), st().sets.find((b) => b.id === set.id)!).pictures).toEqual([st().pictures[0].id]);
    doc.undo();
    expect(st().pictures.map((p) => p.sha256)).toEqual([first[0].sha256]);
  });

  it("says why, and keeps the pictures it made before, where it made none", async () => {
    const { st } = editor();
    const step = st().addStep("render", "blender", 10, 0);
    st().connect({ set: st().sets[0].id }, step);
    worker.prepare.mockImplementationOnce(async () => ({ jobs: [{ entries: [0], program: "blender", args: [], files: [], reads: [] }] }) as never);
    worker.collect.mockImplementationOnce(async () => ({ why: "Blender quit" }) as never);
    const ran = st().runStep(step);
    await settle();
    await settle();
    Object.assign(jobs.get(idOf(1))!, { state: "failed", started: 1000, ended: 2000 });
    await st().lookAtJobs();
    await ran;
    expect(st().pictures).toEqual([]);
    expect(st().sets.find((b) => b.made?.step === step)?.made?.holds).toBeUndefined();
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: false, said: "Blender quit" });
  });

  it("says in small words that it rendered on the processor where the plugin says it fell back to it - and nothing otherwise", async () => {
    const { st } = editor();
    const step = st().addStep("render", "blender", 10, 0);
    st().connect({ set: st().sets[0].id }, step);
    rendering();
    worker.collect.mockReset();
    worker.collect.mockImplementationOnce(async () => ({ made: [{ entry: 0, file: "picture.png", media: "image/png" }], note: "Rendered on the processor" }) as never);
    const ran = st().runStep(step);
    await settle();
    await settle();
    madeFiles.set(`/jobs/${idOf(1)}/picture.png`, png(240, 120, 5));
    Object.assign(jobs.get(idOf(1))!, { state: "done", started: 1000, ended: 13_000 });
    await st().lookAtJobs();
    await ran;
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: true, said: "0:12 \u00b7 1 picture \u00b7 Rendered on the processor" });
  });

  it("makes the pictures of the jobs done where another went without finishing - that one said failed", async () => {
    const { st } = waters(2);
    const step = st().addStep("render", "blender", 10, 0);
    st().connect({ set: st().sets[0].id }, step);
    const one = { program: "blender", args: [], files: [], reads: [] };
    // (a job prepared for each entry, one by one)
    for (let i = 0; i < 2; i++) worker.prepare.mockImplementationOnce(async () => ({ jobs: [{ entries: [0], ...one }] }) as never);
    worker.collect.mockImplementationOnce(async () => ({ made: [{ entry: 0, file: "picture.png", media: "image/png" }] }) as never);
    const ran = st().runStep(step);
    // (each scene written before its job starts)
    for (let i = 0; i < 20 && asked.started.length < 2; i++) await settle();
    madeFiles.set(`/jobs/${idOf(2)}/picture.png`, png(240, 120, 3));
    end(1, "gone");
    end(2);
    await st().lookAtJobs();
    await ran;
    expect(st().pictures).toHaveLength(1);
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: false, said: "1 of 2 failed \u00b7 It stopped without finishing" });
  });
});
