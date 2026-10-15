import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job, JobAsk } from "../../../../lib/jobs";

/** The jobs, as the test has them: each one's record and its log; and what was asked of them. */
const jobs = new Map<string, Job & { log: string }>();
const asked = { started: [] as JobAsk[], stopped: [] as string[], removed: [] as string[], looked: [] as string[] };
let nextJob = 1;
/** Where set, what a job's beginning waits on. */
let beginning: Promise<void> | null = null;
const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

vi.mock("../../../../lib/jobs", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/jobs")>()),
  startJob: async (ask: JobAsk) => {
    asked.started.push(ask);
    const id = idOf(nextJob++);
    await beginning;
    jobs.set(id, { id, plugin: ask.plugin, program: ask.program, state: "waiting", created: Date.now(), log: "" });
    return id;
  },
  jobOf: async (id: string) => {
    asked.looked.push(id);
    return jobs.get(id)!;
  },
  readJobLog: async (id: string, from: number) => {
    const log = jobs.get(id)?.log ?? "";
    return { text: log.slice(from), next: log.length };
  },
  stopJob: async (id: string) => void asked.stopped.push(id),
  removeJob: async (id: string) => void asked.removed.push(id),
  jobFolder: async (id: string) => `/jobs/${id}`,
}));

/** The files the jobs made, as the test has them, by where they are. */
const madeFiles = new Map<string, Uint8Array>();
vi.mock("@tauri-apps/plugin-fs", async (actual) => ({
  ...(await actual<typeof import("@tauri-apps/plugin-fs")>()),
  readFile: async (path: string) => madeFiles.get(path) ?? new Uint8Array(),
}));
vi.mock("@tauri-apps/api/path", async (actual) => ({
  ...(await actual<typeof import("@tauri-apps/api/path")>()),
  join: async (...parts: string[]) => parts.join("/"),
}));
vi.mock("../../../../lib/plugins/installed", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/plugins/installed")>()),
  lookFor: async () => "/Applications/Blender.app/Contents/MacOS/Blender",
}));

/** The Blender plugin's worker, as the test has it: a job for the scene, and the film it made. */
const worker = {
  prepare: vi.fn(async () => ({ jobs: [{ entries: [0], program: "blender", args: ["-b", "-P", "render.py"], files: [{ name: "render.json", text: "{}" }], reads: [] }] })),
  collect: vi.fn(async () => ({ made: [{ entry: 0, file: "film.mp4", media: "video/mp4" }] })),
};
vi.mock("../../../../lib/calc/workers", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/calc/workers")>()),
  pluginClient: async () => worker,
}));

import { progressOf, rendersOf, startRender, stopRenders } from "./renders";
import { askOf, renderOptions } from "./renderOptions";
import type { RenderAsk } from "./renderScene";
import { valuesOf } from "../../../../lib/options";
import { useReaders } from "../../../../lib/calc/workers";
import { addMolecule3d, createWorkspaceDocument } from "../document";
import { connectStoreToDocument, madeStoreOf, storeOf } from "../store";

/** The look as the canvas draws it: lit, and not outlined. */
const LIT = { look: "meno", shading: "lit", outlines: "none", outline: 3, outlineColour: "black", band: 0.5 };

describe("a render", () => {
  it("is as far as its job last said, in lines of its log", () => {
    expect(progressOf("Blender 5.2\nprogress 0/240\nFra:1\nprogress 12/240\nFra:13 Mem: 30M\n")).toEqual({ done: 12, total: 240 });
    expect(progressOf("progress 1/1\n")).toEqual({ done: 1, total: 1 });
    // (as a Windows pipe leaves its lines - \r\n - and as a program's own redraw does - a lone \r)
    expect(progressOf("Blender 5.2\r\nprogress 3/100\r\nFra: 1 | Sample 4/64\r\nprogress 7/100\r\n")).toEqual({ done: 7, total: 100 });
    expect(progressOf("Fra: 1 | Sample 4/64\rprogress 42/100\rFra: 1 | Sample 9/64\r")).toEqual({ done: 42, total: 100 });
    // (not a line that only ends with it, nor Blender's own sample lines)
    expect(progressOf("Rendering progress 5/10 samples\nFra: 1 | Sample 9/64\n")).toBeNull();
    // (nothing said, or what is not how far)
    expect(progressOf("Rendering\n")).toBeNull();
    expect(progressOf("progress 5/0\nprogress 9/4\n")).toBeNull();
  });

  it("is asked for by Meno's own choices: a picture's size and shape, a film's motion, length and rate - offered only where they can be", () => {
    const picture = renderOptions("picture", ["turn"], false);
    expect(picture.map((o) => o.id)).toEqual(["width", "shape", "look", "molecules", "shading", "band", "outlines", "outline", "outline_colour"]);
    const film = renderOptions("film", ["turn", "frames"], true);
    expect(film.map((o) => o.id)).toEqual(["motion", "seconds", "fps", "width", "shape", "look", "molecules", "surfaces", "shading", "band", "outlines", "outline", "outline_colour"]);
    const ask = askOf("film", valuesOf(film));
    expect(ask).toEqual({ kind: "film", width: 1920, shape: "16:9", motion: "turn", seconds: 8, fps: 30, molecules: "meno", surfaces: "meno", finish: LIT });
    expect(askOf("picture", valuesOf(picture))).toEqual({ kind: "picture", width: 2400, shape: "fit", molecules: "meno", surfaces: "meno", finish: LIT });
  });
});

/** A workspace with water in 3D, drawn: its document, its store - the one its tab's closing finds - and the molecule. */
function workspace() {
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
  const store = storeOf(doc);
  connectStoreToDocument(store, doc);
  doc.markSaved();
  return { doc, store, st: () => store.getState(), id: store.getState().molecules3d[0].id };
}

/** An MP4's first box, `seed` making each its own: what Meno takes to be a film. */
const mp4 = (seed: number) => new Uint8Array([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, seed]);
/** How often a render's job is looked at (renders.ts). */
const LOOK_MS = 1000;
const FILM: RenderAsk = { kind: "film", width: 320, shape: "16:9", motion: "turn", seconds: 1, fps: 24 };

describe("a workspace closing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    jobs.clear();
    madeFiles.clear();
    nextJob = 1;
    beginning = null;
    Object.assign(asked, { started: [], stopped: [], removed: [], looked: [] });
    worker.collect.mockClear();
    useReaders.setState({ state: { blender: "added" }, problem: {} });
  });
  afterEach(() => vi.useRealTimers());

  it("stops its renders - their jobs stopped, looked at no more, nothing put on its page - while another workspace's go on", async () => {
    const one = workspace();
    const other = workspace();
    const ranOne = startRender(one.store, [one.id], FILM, {});
    const ranOther = startRender(other.store, [other.id], FILM, {});
    await vi.advanceTimersByTimeAsync(0);
    const jobOne = rendersOf(one.store).getState().list[0].job!;
    const jobOther = rendersOf(other.store).getState().list[0].job!;
    expect(asked.started).toHaveLength(2);
    expect(new Set([jobOne, jobOther]).size).toBe(2);

    // both running, each looked at
    for (const job of [jobOne, jobOther]) Object.assign(jobs.get(job)!, { state: "running", started: Date.now(), log: "progress 3/24\n" });
    await vi.advanceTimersByTimeAsync(LOOK_MS);
    expect(rendersOf(one.store).getState().list[0]).toMatchObject({ state: "running", done: 3, total: 24 });
    expect(asked.looked).toEqual(expect.arrayContaining([jobOne, jobOther]));

    // the first one's tab closed, as App's closeTab closes it: its job stopped, its placeholder gone, and nothing left waiting
    await stopRenders(madeStoreOf(one.doc)!);
    await ranOne;
    expect(asked.stopped).toEqual([jobOne]);
    expect(rendersOf(one.store).getState().list).toEqual([]);
    expect(vi.getTimerCount()).toBe(1);

    // both jobs ending, each with a film made: only the other's looked at, collected and put on its page
    Object.assign(jobs.get(jobOne)!, { state: "done", ended: Date.now() });
    Object.assign(jobs.get(jobOther)!, { state: "done", ended: Date.now() });
    madeFiles.set(`/jobs/${jobOne}/film.mp4`, mp4(1));
    madeFiles.set(`/jobs/${jobOther}/film.mp4`, mp4(2));
    asked.looked = [];
    await vi.advanceTimersByTimeAsync(5 * LOOK_MS);
    await ranOther;
    expect(asked.looked).toEqual([jobOther]);
    expect(worker.collect).toHaveBeenCalledTimes(1);
    expect(other.st().pictures).toEqual([expect.objectContaining({ media: "video/mp4" })]);
    expect(rendersOf(other.store).getState().list).toEqual([]);
    // (the closed one's page as it was; its job's files kept, as a stopped step's are)
    expect(one.st().pictures).toEqual([]);
    expect(one.doc.history().dirty).toBe(false);
    expect(asked.removed).toEqual([jobOther]);
    expect(asked.stopped).toEqual([jobOne]);
  });

  it("stops at once a render whose job began only as it closed, and begins none after", async () => {
    const one = workspace();
    let begin = () => {};
    beginning = new Promise((go) => (begin = go));
    const ran = startRender(one.store, [one.id], FILM, {});
    await vi.advanceTimersByTimeAsync(0);
    expect(asked.started).toHaveLength(1);
    // (closed while its job was being begun: none to stop yet)
    await stopRenders(one.store);
    expect(asked.stopped).toEqual([]);
    begin();
    await ran;
    expect(asked.stopped).toEqual([idOf(1)]);
    expect(asked.looked).toEqual([]);
    expect(rendersOf(one.store).getState().list).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);

    // asked for again as it closes: nothing begun, nothing put down
    await startRender(one.store, [one.id], FILM, {});
    expect(asked.started).toHaveLength(1);
    expect(rendersOf(one.store).getState().list).toEqual([]);
  });
});
