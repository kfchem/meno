import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job, JobAsk } from "../../../../lib/jobs";

/** The jobs, as the test has them: each one's record, its log and its files; and what was asked. */
const jobs = new Map<string, Job & { log: string; files: Record<string, string> }>();
const asked = { started: [] as JobAsk[], stopped: [] as string[], removed: [] as string[] };
let next = 1;
/** A file's text, as the test has it, that stands for one too large to read. */
const TOO_LARGE = "(too large)";
/** Where set, what each job's start waits on once its folder is made - a step's jobs started one by one, as the runner does. */
let holdStart: Promise<void> | null = null;
const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

vi.mock("../../../../lib/jobs", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/jobs")>()),
  startJob: async (ask: JobAsk) => {
    asked.started.push(ask);
    const id = idOf(next++);
    jobs.set(id, { id, plugin: ask.plugin, program: ask.program, state: "waiting", created: Date.now(), log: "", files: {} });
    if (holdStart) await holdStart;
    return id;
  },
  listJobs: async () => [...jobs.values()],
  jobOf: async (id: string) => jobs.get(id)!,
  readJobLog: async (id: string, from: number) => {
    const log = jobs.get(id)?.log ?? "";
    return { text: log.slice(from), next: log.length };
  },
  jobFiles: async (id: string) => Object.keys(jobs.get(id)?.files ?? {}),
  readJobFile: async (id: string, name: string) => {
    const text = jobs.get(id)!.files[name];
    if (text === TOO_LARGE) throw `${name} is too large to read: 300 MB, past 256 MB`;
    return text;
  },
  stopJob: async (id: string) => void asked.stopped.push(id),
  removeJob: async (id: string) => void asked.removed.push(id),
  jobFolder: async (id: string) => `/jobs/${id}`,
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
import { heldOutput } from "../../../../lib/calc/asks";
import { readMenoFile } from "../../../../lib/doc/menoFile";
import { registerKinds } from "../../../../lib/io/kinds";
import { MANIFESTS } from "../../../../lib/plugins/known";
import { canWire, resultOf, stateOf } from "../workflow/flow";
import { byOf, optionsFor } from "../workflow/doers";
import { CARD_W } from "../workflow/look";
import { countOf, setEntries, setMembers } from "../workflow/entries";
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
const end = (n: number, state: Job["state"] = "done", more: Partial<Job> = {}) =>
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
    // prepared by the plugin with what came in, its job started - with how many may run at once, and the cores each may use
    expect(worker.prepare).toHaveBeenCalledWith("optimise", [expect.objectContaining({ charge: 0, multiplicity: 1 })], { method: "gfn2", solvent: "none", level: "normal" }, expect.any(Number));
    expect(asked.started).toEqual([expect.objectContaining({ plugin: "xtb", program: "xtb", args: ["input.xyz", "--opt", "normal"], slots: 1 })]);
    const running = st().steps.find((s) => s.id === step)!.running!;
    expect(running.jobs).toEqual([{ id: idOf(1), entries: [0], reads: ["xtbopt.log"] }]);
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
    const file = readMenoFile(await workspaceFile(st()));
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
    const step = st().addStep("energy", "gaussian", 10, 10);
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

  it("asks before a running step is deleted - and, deleted, stops its jobs and takes their files away", async () => {
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

  it("brings in what the jobs done gave where another went without finishing - that one said failed", async () => {
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
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: false, said: "1 of 3 failed \u00b7 It stopped without finishing" });
    expect(st().molecules3d).toHaveLength(3 + 2);
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
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: false, said: "2 of 3 failed \u00b7 xtb could not be started" });
    expect(st().molecules3d).toHaveLength(3 + 1);
    // (where it did not: the plugin's, for each entry of the job)
    worker.prepare.mockImplementationOnce(async () => ({ jobs: [{ entries: [0, 1], ...two }, { entries: [2], ...two }] }) as never);
    const again = st().runStep(step);
    await settle();
    await settle();
    end(3, "failed");
    end(4);
    await st().lookAtJobs();
    await again;
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: false, said: "2 of 3 failed \u00b7 Some atoms are very close" });
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
    expect(st().steps.find((s) => s.id === b)!.ran!.said).toBe("2 of 3 kept");
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
    expect(step().ran!.said).toBe("1 of 3 kept");
    expect(step().runs).toHaveLength(1);
    expect(step().runs![0]).toMatchObject({ options: { window: 3 }, kind: "energy-window" });
    expect(step().runs![0].results!.holds).toBe("conformers");
    // shown again: its results back in the set, the later run kept in its place
    st().showRun(b, 0);
    expect(step().ran!.said).toBe("2 of 3 kept");
    expect(step().runs![0].options).toEqual({ window: 0.5 });
    // (and what it set aside then back in its second exit's set)
    expect(countOf(st(), resultOf(st(), b, "rest")!).entries).toBe(1);
    expect(doc.history().undoLabel).toBe("show run");
    doc.undo();
    expect(step().ran!.said).toBe("1 of 3 kept");
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

  it("sets aside what a plugin's Duplicates says is alike, at once", async () => {
    const { doc, st } = editor();
    // (a second water in the set: two entries)
    doc.edit("water", (d) => addMolecule3d(d, { ...d.molecules3d![0], at: { x: 1, y: 1 } }));
    const set = st().sets[0].id;
    const step = st().addStep("duplicates", "rdkit", 10, 20);
    st().connect({ set }, step);
    await st().runStep(step);
    expect(worker.run).toHaveBeenCalledWith("duplicates", expect.arrayContaining([expect.objectContaining({ compound: 0, charge: 0 })]), { mirrors: "apart" }, "molecules");
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: true, said: "1 of 2 kept" });
    // (the one set aside, in the step's second exit's set)
    expect(countOf(st(), resultOf(st(), step, "rest")!).entries).toBe(1);
  });

  it("keeps a mirror image a plugin's Duplicates counted in: the one kept standing for both, with the atoms it swaps", async () => {
    const { doc, st } = editor();
    doc.edit("water", (d) => addMolecule3d(d, { ...d.molecules3d![0], at: { x: 1, y: 1 } }));
    const set = st().sets[0].id;
    const step = st().addStep("duplicates", "rdkit", 10, 20);
    st().updateStep(step, { options: { mirrors: "counted" } });
    st().connect({ set }, step);
    worker.run.mockImplementationOnce(async () => ({ kept: [0], counted: [{ entry: 0, degeneracy: 2, mirror: [0, 2, 1] }] }) as never);
    await st().runStep(step);
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: true, said: "1 of 2 kept \u00b7 1 mirror image counted in (degeneracy 2)" });
    const out = setMembers(st(), resultOf(st(), step)!).molecules.map((id) => st().molecules3d.find((m) => m.id === id)!);
    expect(setEntries(out, "molecules").map((e) => [e.degeneracy, e.mirror])).toEqual([[2, [0, 2, 1]]]);
    // (one not as said - not a permutation of its atoms: none taken)
    worker.run.mockImplementationOnce(async () => ({ kept: [0], counted: [{ entry: 0, degeneracy: 2, mirror: [0, 0, 1] }] }) as never);
    await st().runStep(step);
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ said: "1 of 2 kept" });
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
